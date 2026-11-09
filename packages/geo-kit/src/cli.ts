#!/usr/bin/env node
/**
 * geo-kit CLI —— 两个命令：
 *
 *   generate <content.ts> [--out public]   从内容包生成 GEO 产物
 *   audit <url> [--content content.ts]     对站点做 GEO 体检
 *
 * 内容包是 TS 文件 —— 用 tsx 运行时动态 import，因此 CLI 需要能加载 TS。
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { generateArtifacts, artifactsToFiles } from "./artifacts.js";
import { auditSite, renderReport } from "./audit/index.js";
import type { SiteContent } from "./types.js";

interface Args {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { command, positional, flags };
}

async function loadContent(path: string): Promise<SiteContent> {
  const abs = resolve(path);
  const mod = await import(pathToFileURL(abs).href);
  const content = mod.default ?? mod.content ?? mod.site;
  if (!content) {
    throw new Error(`${path} 未导出默认内容包（default / content / site）`);
  }
  return content as SiteContent;
}

async function cmdGenerate(args: Args): Promise<void> {
  const contentPath = args.positional[0];
  if (!contentPath) {
    console.error("用法：geo-kit generate <content.ts> [--out public] [--full]");
    process.exit(1);
  }

  const content = await loadContent(contentPath);
  const outDir = resolve((args.flags.out as string) ?? "public");

  const artifacts = generateArtifacts(content, {
    includeLlmsFull: Boolean(args.flags.full),
  });

  await mkdir(outDir, { recursive: true });
  const files = artifactsToFiles(artifacts);
  for (const [name, body] of Object.entries(files)) {
    const target = resolve(outDir, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, "utf8");
    console.log(`写入 ${target}`);
  }

  // JSON-LD 单独落到一个模块文件，模板从它 import
  const jsonLdPath = resolve(outDir, "_geo/jsonld.json");
  await mkdir(dirname(jsonLdPath), { recursive: true });
  await writeFile(
    jsonLdPath,
    JSON.stringify(artifacts.jsonLd, null, 2),
    "utf8",
  );
  console.log(`写入 ${jsonLdPath}`);

  // 内容索引 —— 供体检与 Phase 3 的 MCP 复用
  const indexPath = resolve(outDir, "_geo/index.json");
  await writeFile(indexPath, JSON.stringify(artifacts.index, null, 2), "utf8");
  console.log(`写入 ${indexPath}`);

  console.log(
    `\n完成：${artifacts.jsonLd.length} 段 JSON-LD，${artifacts.index.entries.length} 条索引，${artifacts.index.capabilities.length} 项能力`,
  );
}

async function cmdAudit(args: Args): Promise<void> {
  const url = args.positional[0];
  if (!url) {
    console.error("用法：geo-kit audit <url> [--content content.ts] [--json] [--full]");
    process.exit(1);
  }

  const content = args.flags.content
    ? await loadContent(args.flags.content as string)
    : undefined;

  // --full：站级体检 —— 抓取全站页面并做跨页检查
  if (args.flags.full) {
    if (!content) {
      console.error("--full 需要 --content（站级检查要与内容包交叉验证）");
      process.exit(1);
    }
    await cmdAuditFull(url, content, args);
    return;
  }

  const report = await auditSite(url, content);

  if (args.flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(renderReport(report));

  // 有 critical 根因时以非零码退出 —— 便于 CI 阻断
  const hasCritical = report.rootCauses.some((c) => c.severity === "critical");
  process.exit(hasCritical ? 1 : 0);
}

/** 站级体检（--full） */
async function cmdAuditFull(
  url: string,
  content: SiteContent,
  args: Args,
): Promise<void> {
  const { crawlSite } = await import("./audit/crawl.js");
  const { auditSiteLevel, combineResults, findOrphanPages } = await import(
    "./audit/site.js"
  );
  const { scoreAudit } = await import("./audit/scorer.js");
  const { buildContentIndex } = await import("./content-index.js");
  const { evaluateCrawlerAllowed } = await import("./audit/robots.js");
  const { AI_CRAWLERS } = await import("./crawlers.js");

  const base = url.replace(/\/+$/, "");
  const index = buildContentIndex(content);

  const log = args.flags.json
    ? (m: string) => console.error(m)
    : (m: string) => console.log(m);
  log(`抓取全站：${base}`);
  const { pages, linkGraph } = await crawlSite(base, content);

  // 拿首页与 robots 做单页体检
  const homePage = pages.find((p) => p.url.endsWith("/")) ?? pages[0];
  const robotsTxt = await fetchText(`${base}/robots.txt`);
  const llmsTxt = await fetchText(`${base}/llms.txt`);

  const crawlerAllowed: Record<string, boolean> = {};
  if (robotsTxt) {
    for (const c of AI_CRAWLERS) {
      crawlerAllowed[c.ua] = evaluateCrawlerAllowed(robotsTxt, c.ua);
    }
  }

  const html = homePage ? await fetchText(homePage.url) : undefined;
  const jsonLd: unknown[] = [];
  if (html) {
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      try {
        jsonLd.push(JSON.parse(m[1]));
      } catch {
        /* 损坏的 JSON-LD 由单页体检报出 */
      }
    }
  }

  const pageResult = scoreAudit({
    url: base,
    robotsTxt,
    llmsTxt,
    html,
    jsonLd,
    index: {
      entries: index.entries.map((e) => ({
        sectionId: e.sectionId,
        title: e.title,
        description: e.description,
        url: e.url,
        category: e.category,
        quotable: e.quotable,
        hasFaq: e.hasFaq,
      })),
      capabilities: index.capabilities,
    },
    locale: content.locale,
    expectedSchemaTypes: expectedSchemaTypesOf(content),
    crawlerAllowed,
  });

  const siteResult = auditSiteLevel({ content, pages, index });
  const orphans = findOrphanPages(linkGraph, `${base}/`);

  const combined = combineResults([pageResult], siteResult);

  if (args.flags.json) {
    console.log(
      JSON.stringify(
        { pages, siteResult, orphans, combined },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nGEO 站级体检报告 — ${base}`);
  console.log(`评分：${combined.score}/100（等级 ${combined.grade}）`);
  console.log(`抓取页面：${pages.length}\n`);

  console.log("维度得分：");
  for (const d of combined.dimensions) {
    const bar = "█".repeat(Math.round(d.score / 10)).padEnd(10, "░");
    console.log(
      `  ${d.key} ${d.name.padEnd(12, "　")} ${bar} ${String(d.score).padStart(3)}%`,
    );
  }

  console.log("\n站级检查项：");
  for (const c of siteResult.checks) {
    const mark =
      c.status === "pass" ? "✓" : c.status === "partial" ? "~" : c.status === "unknown" ? "?" : "✗";
    console.log(`  ${mark} [${c.dimension}] ${c.name} —— ${c.note ?? ""}`);
  }

  if (orphans.length > 0) {
    console.log(`\n孤立页面（无任何页面链接到，AI 难以发现）：`);
    for (const o of orphans.slice(0, 10)) console.log(`  · ${o}`);
  }

  if (combined.recommendations.length > 0) {
    console.log("\n修复建议（按影响排序）：");
    for (const r of combined.recommendations.slice(0, 12)) {
      console.log(`  [${r.dimension}] ${r.message}（缺口 ${r.impact.toFixed(1)}）`);
    }
  }

  const hasCritical = siteResult.checks.some(
    (c) => c.status === "fail" && c.weight - c.earned >= 2,
  );
  process.exit(hasCritical ? 1 : 0);
}

async function fetchText(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "GeoKit-Audit/0.1" },
    });
    if (!res.ok) return undefined;
    return await res.text();
  } catch {
    return undefined;
  }
}

function expectedSchemaTypesOf(content: SiteContent): string[] {
  const types = new Set<string>(["Organization", "WebSite"]);
  for (const s of content.sections) {
    switch (s.type) {
      case "about":
        types.add("AboutPage");
        break;
      case "contact":
        types.add("ContactPage");
        break;
      case "products":
      case "cases":
        types.add("CollectionPage");
        break;
      case "insights":
        types.add("BlogPage");
        break;
      default:
        types.add("WebPage");
    }
  }
  if (content.faq?.length) types.add("FAQPage");
  if (content.sections.some((s) => s.faq?.length)) types.add("FAQPage");
  if (content.products?.length) types.add("Product");
  if (content.insights?.length) types.add("BlogPosting");
  return [...types];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "generate":
      await cmdGenerate(args);
      break;
    case "audit":
      await cmdAudit(args);
      break;
    default:
      console.log(`geo-kit —— GEO 建站核心库 CLI

用法：
  geo-kit generate <content.ts> [--out public] [--full]
      从内容包生成 robots.txt / llms.txt / sitemap.xml / JSON-LD / 内容索引

  geo-kit audit <url> [--content content.ts] [--json]
      对站点做 GEO 体检，输出维度得分与根因诊断
`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

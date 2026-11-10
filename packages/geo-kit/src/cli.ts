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
  const files = artifactsToFiles(artifacts, content, {
    includeKnowledgeBase: Boolean(args.flags["knowledge-base"]),
    includeMcp: Boolean(args.flags.mcp),
  });
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

async function cmdCopy(args: Args): Promise<void> {
  const contentPath = args.positional[0];
  if (!contentPath) {
    console.error("用法：geo-kit copy <content.ts> [--out content/copy.ts] [--sections a,b]");
    process.exit(1);
  }

  const content = await loadContent(contentPath);
  const { generateCopy, applyDrafts, llmConfigFromEnv } = await import("./ai/copywriter.js");
  const { INDUSTRY_PACKS, getIndustryPack } = await import("./content-pack.js");

  const llm = llmConfigFromEnv();
  if (!llm) {
    console.error(
      "未配置 LLM。需要环境变量 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL" +
        "（或 MINIMAX_BASE_URL / MINIMAX_API_KEY / MINIMAX_MODEL）。",
    );
    process.exit(1);
  }

  // 行业包（可选）
  const packId = args.flags.industry as string | undefined;
  const pack = packId ? getIndustryPack(packId) ?? INDUSTRY_PACKS[0] : undefined;

  const sectionIds = args.flags.sections
    ? String(args.flags.sections).split(",").map((s) => s.trim())
    : undefined;

  console.log(`生成文案初稿（模型 ${llm.model}）…`);
  const drafts = await generateCopy(content, {
    sectionIds,
    llm,
    writingHints: pack?.writingHints,
    terminology: pack?.terminology,
  });

  const okCount = drafts.filter((d) => d.ok).length;
  console.log(`\n成功 ${okCount}/${drafts.length}`);

  const outPath = resolve((args.flags.out as string) ?? "content/copy.ts");
  const merged = applyDrafts(content, drafts);

  // 输出为 TS 模块 —— 人工核对后替换原内容包
  const ts = `/**
 * AI 生成的文案初稿 —— ${new Date().toISOString()}
 *
 * 生成模型：${llm.model}
 * 成功区块：${okCount}/${drafts.length}
 *
 * ⚠️ 必须人工核对后再上线：数字、案例、客户名称、资质编号不可直接采信。
 * 生成模型被明确要求「不知道就留空」，但仍需复核。
 *
 * 用法：核对后把 content/site.ts 的 sections 替换为这里的 sections。
 */

import type { SiteContent } from "@geokit/geo-kit";

export const draft: SiteContent = ${JSON.stringify(merged, null, 2)} as SiteContent;

export default draft;
`;
  await writeFile(outPath, ts, "utf8");
  console.log(`写入 ${outPath}`);
}

async function cmdAsk(args: Args): Promise<void> {
  const contentPath = args.positional[0];
  const question = args.positional.slice(1).join(" ");
  if (!contentPath || !question) {
    console.error("用法：geo-kit ask <content.ts> <问题>");
    process.exit(1);
  }

  const content = await loadContent(contentPath);
  const { buildKnowledgeBase, retrieve, buildChatPrompt } = await import("./ai/chat.js");
  const { llmConfigFromEnv } = await import("./ai/copywriter.js");

  const docs = buildKnowledgeBase(content);
  const hits = retrieve(docs, question);

  console.log(`检索命中 ${hits.length} 条：`);
  for (const [i, h] of hits.entries()) {
    console.log(`  [${i + 1}] ${h.doc.title}（${h.doc.kind}）score=${h.score.toFixed(2)}`);
  }

  const cfg = llmConfigFromEnv();
  if (!cfg) {
    console.log("\n（未配置 LLM，仅输出检索结果与提示词预览）");
    console.log("\n" + buildChatPrompt(question, hits, content).slice(0, 800));
    return;
  }

  const prompt = buildChatPrompt(question, hits, content);
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error(`LLM HTTP ${res.status}`);
    process.exit(1);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const answer = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");

  console.log(`\n回答：\n${answer}`);
}

async function cmdSync(args: Args): Promise<void> {
  const contentPath = args.positional[0];
  if (!contentPath) {
    console.error(
      "用法：geo-kit sync <content.ts> [--out content/knowledge-articles.ts] [--kb <id>] [--database <url>] [--match <正则>] [--tags a,b]",
    );
    process.exit(1);
  }

  const databaseUrl =
    (args.flags.database as string | undefined) ??
    process.env.KNOWLEDGE_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "未配置数据库连接串。需要 --database <url> 或环境变量 KNOWLEDGE_DATABASE_URL / DATABASE_URL。",
    );
    process.exit(1);
  }

  const { runSync, writeKnowledgeModule, renderSyncReport } = await import(
    "./sync/cli.js"
  );

  console.log("读取知识库…");
  const { result, module } = await runSync({
    databaseUrl,
    kbId: args.flags.kb as string | undefined,
    mapping: {
      idPrefix: args.flags.prefix as string | undefined,
      titlePattern: args.flags.match as string | undefined,
      includeTags: args.flags.tags
        ? String(args.flags.tags).split(",").map((t) => t.trim())
        : undefined,
    },
  });

  console.log(renderSyncReport(result));

  const out = args.flags.out as string | undefined;
  if (out) {
    await writeKnowledgeModule(out, module);
    console.log(`\n写入 ${out}`);
    console.log(
      "在内容包里引用：\n  import { knowledgeInsights } from \"./knowledge-articles\";\n  site.insights = knowledgeInsights;",
    );
  } else {
    console.log("\n（未指定 --out，仅报告不写文件）");
  }
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
    case "copy":
      await cmdCopy(args);
      break;
    case "sync":
      await cmdSync(args);
      break;
    case "ask":
      await cmdAsk(args);
      break;
    default:
      console.log(`geo-kit —— GEO 建站核心库 CLI

用法：
  geo-kit generate <content.ts> [--out public] [--full] [--knowledge-base] [--mcp]
      从内容包生成 robots.txt / llms.txt / sitemap.xml / JSON-LD / 内容索引
      --knowledge-base 额外生成数字分身知识库（Phase 2）
      --mcp            额外生成 MCP 静态清单（Phase 3）

  geo-kit audit <url> [--content content.ts] [--json] [--full]
      对站点做 GEO 体检。--full 为站级体检（抓全站查跨页问题）

  geo-kit copy <content.ts> [--out content/copy.ts] [--industry <id>]
      用 AI 生成符合 GEO 写作规则的文案初稿

  geo-kit ask <content.ts> <问题>
      用站内知识库检索并回答（数字分身的知识库侧）

  geo-kit sync <content.ts> [--out content/knowledge-articles.ts] [--kb <id>]
      从 GEO-Knowledge 的知识库同步内容，产出独立的知识文章模块
      （不覆盖内容包 —— 手写内容永远安全）
`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

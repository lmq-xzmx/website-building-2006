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
    console.error("用法：geo-kit audit <url> [--content content.ts] [--json]");
    process.exit(1);
  }

  const content = args.flags.content
    ? await loadContent(args.flags.content as string)
    : undefined;

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

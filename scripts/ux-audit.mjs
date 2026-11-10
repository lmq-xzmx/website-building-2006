#!/usr/bin/env node
/**
 * UX 质量体检 —— 对**已构建**的静态站跑一遍体验规则。
 *
 * 为什么单独一个脚本：
 *   GEO 体检（audit/）管的是「AI 能不能读懂这个站」，
 *   UX 体检（audit/ux.ts）管的是「人愿不愿意留下来」——
 *   两者维度正交，报告也分开看。
 *
 * 用法：
 *   node scripts/ux-audit.mjs sites/demo-saas/out
 *   node scripts/ux-audit.mjs sites/demo-saas/out --verbose
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);

// geo-kit 是 TS 包 —— 从构建产物里取（先 build 再跑）
const distEntry = join(repoRoot, "packages/geo-kit/dist/index.js");
if (!existsSync(distEntry)) {
  console.error("geo-kit 还没构建 —— 先跑：pnpm --filter @geokit/geo-kit build");
  process.exit(1);
}
const { auditUxHtml } = await import(`file://${distEntry}`);

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const siteDir = args.find((a) => !a.startsWith("--")) ?? join(repoRoot, "sites/demo-saas/out");

if (!existsSync(siteDir)) {
  console.error(`找不到目录：${siteDir}`);
  process.exit(1);
}

// ── 收集页面 ──────────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (extname(p) === ".html") out.push(p);
  }
  return out;
}

const htmlFiles = walk(siteDir);

// 样式表 —— 静态导出后 CSS 是独立文件，对比度/字号检查要读它
const cssFiles = [];
(function findCss(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) findCss(p);
    else if (extname(p) === ".css") cssFiles.push(p);
  }
})(siteDir);
const css = cssFiles.map((f) => readFileSync(f, "utf8")).join("\n");

// 静态导出里 404 有一族产物（404.html、404/index.html、_not-found.html），
// 内容一模一样 —— 只算一份，否则「多页共用同一份 description」会误报。
const isNotFoundArtifact = (f) => {
  const rel = relative(siteDir, f).replace(/\\/g, "/");
  return rel === "404.html" || rel.startsWith("404/") || rel.endsWith("_not-found.html");
};
let notFoundKept = false;
const pages = htmlFiles
  .filter((f) => {
    if (!isNotFoundArtifact(f)) return true;
    if (notFoundKept) return false;
    notFoundKept = true;
    return true;
  })
  .map((f) => ({
    url: "/" + relative(siteDir, f).replace(/index\.html$/, "").replace(/\\/g, "/"),
    html: readFileSync(f, "utf8"),
    css,
  }));

// ── 跑体检 ────────────────────────────────────────────────
const result = auditUxHtml(pages, {});

const dim = (s) => s.replace(/^./, (c) => c.toUpperCase());
console.log(`\nUX 体检：${siteDir}`);
console.log(`页面 ${pages.length} 个 · 总分 ${result.score} / 等级 ${result.grade}\n`);

const siteFails = result.siteChecks.filter((c) => c.status === "fail");
const siteWarns = result.siteChecks.filter((c) => c.status === "warn");

console.log("── 站级 ──");
for (const c of result.siteChecks) {
  const mark = c.status === "pass" ? "✓" : c.status === "warn" ? "!" : c.status === "fail" ? "✗" : "–";
  if (c.status === "pass" && !verbose) continue;
  console.log(`  ${mark} [${dim(c.dimension)}] ${c.name}${c.note ? " —— " + c.note : ""}`);
}

console.log("\n── 页面级问题 ──");
let issueCount = 0;
for (const pr of result.pageResults) {
  const bad = pr.checks.filter((c) => c.status === "fail" || c.status === "warn");
  if (!bad.length) continue;
  console.log(`  ${pr.url}`);
  for (const c of bad) {
    const mark = c.status === "fail" ? "✗" : "!";
    issueCount++;
    console.log(
      `      ${mark} [${dim(c.dimension)}] ${c.name}${c.note ? " —— " + c.note : ""}` +
        (c.fix ? "\n        ↳ 怎么修：" + c.fix : ""),
    );
  }
}
if (!issueCount) console.log("  （无）");

const fails = siteFails.length + result.pageResults.reduce((n, p) => n + p.checks.filter((c) => c.status === "fail").length, 0);
const warns = siteWarns.length + result.pageResults.reduce((n, p) => n + p.checks.filter((c) => c.status === "warn").length, 0);
console.log(`\n合计：${fails} 个不通过，${warns} 个提醒\n`);

process.exit(fails > 0 ? 1 : 0);

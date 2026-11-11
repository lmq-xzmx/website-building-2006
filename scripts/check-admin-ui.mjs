#!/usr/bin/env node
/**
 * 后台界面的静态自检。
 *
 * v3 起界面是**真文件**（apps/admin/public/console 下的 ES 模块 + CSS），
 * 所以这一版查的东西也跟着换了 —— 从「模板字符串里有没有漏 <script>」
 * 变成「模块图能不能闭合、每个视图有没有 create、CSS 括号配不配平」。
 *
 * 为什么值得留着：后台零构建，模块解析发生在浏览器 ——
 * 一个路径写错就是整屏白页，而且服务端看不出来。静态检查能在启动前抓住。
 *
 * 用法：pnpm check:ui
 */

import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderPage } from "../apps/admin/src/ui.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const consoleDir = resolve(root, "apps/admin/public/console");
const problems = [];
const notes = [];

/* ── 1. 外壳是否指向了正确的资源 ───────────────────────── */
const html = await renderPage({ displayName: "自检" });
for (const asset of ["/console/index.css", "/console/app.js"]) {
  if (!html.includes(asset)) problems.push(`外壳没有引用 ${asset}`);
}
if (html.includes("window.__USER__") && !html.includes("window.__PERMS__")) {
  problems.push("外壳注入了用户但没有注入权限");
}
const openTags = (html.match(/<script\b/g) ?? []).length;
const closeTags = (html.match(/<\/script>/g) ?? []).length;
if (openTags !== closeTags) problems.push(`script 标签不配对：${openTags} / ${closeTags}`);

/* ── 2. 资源文件都在 ───────────────────────────────────── */
const mustExist = [
  "index.css",
  "app.js",
  "lib/dom.js",
  "lib/api.js",
  "lib/store.js",
  "lib/router.js",
  "lib/rich.js",
  "lib/preview.js",
  "lib/drag.js",
  "lib/picker.js",
];
for (const rel of mustExist) {
  try {
    await stat(resolve(consoleDir, rel));
  } catch {
    problems.push(`缺少资源：${rel}`);
  }
}

/* ── 3. 模块图闭合 ─────────────────────────────────────── */
const seen = new Set();
const queue = ["app.js"];
while (queue.length) {
  const rel = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);
  let src;
  try {
    src = await readFile(resolve(consoleDir, rel), "utf8");
  } catch {
    problems.push(`导入不存在的模块：${rel}`);
    continue;
  }
  const dir = dirname(rel);
  for (const m of src.matchAll(/from\s+"(\.[^"]+)"/g)) {
    const target = resolve(consoleDir, dir, m[1]);
    const asRel = target.slice(consoleDir.length + 1);
    try {
      await stat(target);
      queue.push(asRel);
    } catch {
      problems.push(`${rel} 导入了不存在的 ${m[1]}`);
    }
  }
  if (rel.startsWith("views/") && !/export\s+function\s+create\s*\(/.test(src)) {
    problems.push(`${rel} 没有导出 create()`);
  }
}
notes.push(`模块图：${seen.size} 个文件，路径全部可解析`);

/* ── 4. CSS 括号配平 & 明显笔误 ────────────────────────── */
const css = await readFile(resolve(consoleDir, "index.css"), "utf8");
const open = (css.match(/{/g) ?? []).length;
const close = (css.match(/}/g) ?? []).length;
if (open !== close) problems.push(`index.css 括号不配平：{ ${open} 个，} ${close} 个`);

for (const m of css.matchAll(/#[0-9A-Fa-f]{2,6}\s+[0-9A-Fa-f]{2,4}\s*;/g)) {
  problems.push(`index.css 里有非法颜色值：${m[0]}`);
}
if (/var\(\s*--[a-z-]+\s*\)/.test(css)) {
  for (const m of css.matchAll(/var\(\s*--([a-z-]+)\s*\)/g)) {
    if (!css.includes(`--${m[1]}:`)) problems.push(`用了未定义的变量 --${m[1]}`);
  }
}

/* ── 5. 客户端不该用会白屏的写法 ───────────────────────── */
for (const rel of seen) {
  if (!rel.endsWith(".js")) continue;
  const src = await readFile(resolve(consoleDir, rel), "utf8");
  if (/\b(alert|confirm|prompt)\s*\(/.test(src.replace(/\/\/.*$/gm, ""))) {
    problems.push(`${rel} 使用了原生 alert/confirm/prompt —— 用 lib/dom 的 dialog/toast`);
  }
}

/* ── 结果 ─────────────────────────────────────────────── */
for (const n of notes) console.log(`  · ${n}`);
if (problems.length) {
  console.error(`\n✗ 后台界面自检发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`\n✓ 后台界面自检通过（${problems.length} 个问题，${seen.size} 个模块）`);

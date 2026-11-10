#!/usr/bin/env node
/**
 * 后台界面的静态自检 —— 抓「脚本被当文本渲染」这类低级错误。
 *
 * 起因：EDITOR_SCRIPT 漏了 <script> 标签，浏览器把 JS 当纯文本插进页面，
 * 界面上看着有东西（甚至 text() 能读到脚本源码），但**一行都没执行**。
 * 这种 bug 只有真点按钮才会暴露 —— 静态检查能提前抓住。
 *
 * 检查项：
 *   1. 每个 JS 片段都被 <script> 正确包裹
 *   2. 页面引用的全局函数都有定义
 *   3. 关键 DOM id 都存在（脚本按 id 取元素）
 *
 * 用法：node scripts/check-admin-ui.mjs
 */

import { renderPage } from "../apps/admin/src/ui.ts";

const html = await renderPage({ displayName: "自检" });

const problems = [];

// ── 1. script 标签配对 ──────────────────────────────────
const openTags = (html.match(/<script\b/g) ?? []).length;
const closeTags = (html.match(/<\/script>/g) ?? []).length;
if (openTags !== closeTags) {
  problems.push(`script 标签不配对：开 ${openTags} 个，闭 ${closeTags} 个`);
}

// 形如 `<script>` 后面直接跟 JS（而不是换行/缩进）—— 判断裸文本插入
// 裸文本的特征：script 块的**第一行**就是 HTML 标签（脚本里的 HTML 字符串不在首行）
const scriptBlocks = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/g) ?? [];
for (const block of scriptBlocks) {
  const body = block.replace(/^<script\b[^>]*>/, "").replace(/<\/script>$/, "");
  const firstLine = body.trim().split("\n")[0] ?? "";
  if (/^<[a-zA-Z!/]/.test(firstLine)) {
    problems.push("某个 script 块的第一行是 HTML —— 内容被当文本插入了");
  }
}

// ── 2. 全局函数必须有定义 ──────────────────────────────
// 页面里被调用但从未定义的 window.xxx / 裸函数
const requiredGlobals = [
  "__rte", "__rteHtml", "__modAddKbItem", "__modAddManualItem",
  "__modInsertFragment", "__modDetachFragment",
];
for (const name of requiredGlobals) {
  const defined = new RegExp(`window\\.${name}\\s*=`).test(html);
  if (!defined) problems.push(`全局 ${name} 未定义`);
}

// ── 3. 关键 DOM id ──────────────────────────────────────
const ids = [
  "site", "kb", "q", "reload", "save", "publish", "who",
  "tabPlan", "tabModule", "tabWechat", "tabMedia", "modulePane", "wechatPane", "mediaPane",
  "tabFragments", "fragmentsPane", "fragList", "fragDetail", "fragReload",
  "tabHistory", "historyPane", "verList", "verDetail", "verReload",
  "verDiff", "verRollback",
  "modAddPage", "modPageList",
  "modAddModule", "modModuleList", "modFragSel", "modAddFragment",
  "modAddManual", "modItemList", "modItemCount",
  "modEditor", "modSave", "modPublish", "modLook",
  "kbList", "kbCount", "planList", "planCount", "checkPane",
  "wcSide", "wcPreview", "wcCopyRich", "wcCopyPlain",
  "mediaGrid", "mediaQ", "mediaCat", "mediaUpload", "mediaFile",
  "toast",
];
for (const id of ids) {
  if (!html.includes(`id="${id}"`)) problems.push(`缺少 DOM id: ${id}`);
}

// ── 4. 页面里调用的**顶层**函数必须有定义 ──────────────
// 只查 script 块内的代码 —— CSS 里的 var(--x) 之类不该算
const codeOnly = scriptBlocks
  .map((b) => b.replace(/^<script\b[^>]*>/, "").replace(/<\/script>$/, ""))
  .join("\n");

// 只查不在点号之后的调用 —— 方法调用（obj.foo()）不是顶层函数
const called = new Set();
for (const m of codeOnly.matchAll(/(^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)) {
  called.add(m[2]);
}
const defined = new Set();
for (const m of codeOnly.matchAll(/function\s+([a-zA-Z_$][\w$]*)/g)) defined.add(m[1]);
for (const m of codeOnly.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=/g)) defined.add(m[1]);
// 对象字面量的方法简写：{ foo() { ... } }
for (const m of codeOnly.matchAll(/[{,]\s*([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) defined.add(m[1]);

// 这些是浏览器/运行时内置或语言关键字，不该报
const builtin = new Set([
  "if", "for", "while", "switch", "catch", "return", "typeof", "function",
  "async", "await", "new", "delete", "void", "in", "of", "instanceof",
  "String", "Number", "Boolean", "Array", "Object", "JSON", "Math", "Date",
  "Promise", "Set", "Map", "RegExp", "Error", "parseInt", "parseFloat", "isNaN",
  "encodeURIComponent", "decodeURIComponent", "fetch", "alert", "confirm",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "require", "console", "document", "window", "location", "navigator",
  "Blob", "ClipboardItem", "File", "FileReader", "FormData", "URL",
  "URLSearchParams", "AbortController", "TextEncoder", "TextDecoder",
  // CSS 函数名 —— 出现在 style 字符串里，不是 JS 调用
  "gradient", "translateX", "translateY", "scale", "rotate", "var", "calc",
  // Promise 构造器的回调参数与浏览器 API
  "resolve", "reject", "prompt", "confirm", "alert", "open",
]);

for (const name of called) {
  if (builtin.has(name)) continue;
  if (defined.has(name)) continue;
  problems.push(`调用了未定义的函数：${name}`);
}

// ── 报告 ────────────────────────────────────────────────
if (problems.length) {
  console.error("❌ 后台界面自检未通过：");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

console.log(`✅ 后台界面自检通过（${ids.length} 个 DOM id，${requiredGlobals.length} 个全局，${scriptBlocks.length} 个 script 块）`);

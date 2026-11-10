/**
 * 后台界面 —— 单页，纯原生 JS，**无构建步骤**。
 *
 * 为什么不用 React/Vue：
 *   后台是内部工具，交互复杂度中等，但**启动要快、部署要简单**。
 *   一个 .ts 文件 + 原生 DOM，零构建、零依赖、node 直接跑。
 *   真需要复杂交互时再换框架 —— 届时 API 边界已经划好，不影响后端。
 *
 * 界面分区：
 *   编排台视图（左：知识库 / 中：编排台 / 右：校验与预览）
 *   模块视图  （页面 / 模块 / 条目 / 编辑）—— 见 modules-ui.ts
 *
 * 两个视图并存：编排台管「知识条目 → 固定槽位」，
 * 模块视图管「页面 → 模块 → 条目」的自由组合。
 */

import { EDITOR_SCRIPT } from "./editor.ts";
import { MODULE_PANEL_CSS, MODULE_PANEL_HTML, MODULE_PANEL_SCRIPT } from "./modules-ui.ts";
import {
  WECHAT_PANEL_CSS,
  WECHAT_PANEL_HTML,
  WECHAT_PANEL_SCRIPT,
} from "./wechat-ui.ts";

export async function renderPage(user?: {
  displayName?: string;
  name?: string;
}): Promise<string> {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>内容后台 · 智能建站</title>
<style>
  :root {
    --bg: #0f1115;
    --panel: #161a21;
    --panel-2: #1d222b;
    --line: #2a303b;
    --text: #e6e9ef;
    --dim: #98a1b3;
    --accent: #6ea8fe;
    --ok: #4ade80;
    --warn: #fbbf24;
    --err: #f87171;
    --radius: 8px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    height: 100vh; display: flex; flex-direction: column;
  }
  header {
    display: flex; align-items: center; gap: 16px;
    padding: 10px 18px; border-bottom: 1px solid var(--line); background: var(--panel);
    flex-shrink: 0;
  }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; letter-spacing: .3px; }
  header .sp { flex: 1; }
  select, input, button, textarea {
    font: inherit; color: var(--text); background: var(--panel-2);
    border: 1px solid var(--line); border-radius: 6px; padding: 5px 9px;
  }
  input[type=search] { min-width: 180px; }
  button { cursor: pointer; }
  button:hover { border-color: var(--accent); }
  button.primary { background: var(--accent); color: #0b1220; border-color: var(--accent); font-weight: 600; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  main { flex: 1; display: grid; grid-template-columns: 1fr 1fr 1fr; min-height: 0; }
  section.pane { border-right: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; }
  section.pane:last-child { border-right: none; }
  .pane-head {
    padding: 10px 14px; border-bottom: 1px solid var(--line); background: var(--panel);
    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  }
  .pane-head h2 { font-size: 13px; margin: 0; font-weight: 600; color: var(--dim); text-transform: uppercase; letter-spacing: .6px; }
  .pane-head .sp { flex: 1; }
  .pane-body { overflow-y: auto; padding: 10px 12px; flex: 1; }
  .row {
    border: 1px solid var(--line); border-radius: var(--radius);
    padding: 8px 10px; margin-bottom: 8px; background: var(--panel);
  }
  .row:hover { border-color: #39414f; }
  .row .t { font-weight: 500; margin-bottom: 3px; }
  .row .m { color: var(--dim); font-size: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .pill { border: 1px solid var(--line); border-radius: 20px; padding: 0 7px; font-size: 11px; color: var(--dim); }
  .pill.ok { color: var(--ok); border-color: #23543a; }
  .pill.warn { color: var(--warn); border-color: #5a4415; }
  .pill.err { color: var(--err); border-color: #5a2626; }
  .row button { padding: 2px 8px; font-size: 12px; }
  .empty { color: var(--dim); text-align: center; padding: 40px 10px; font-size: 13px; }
  .problem { border-left: 3px solid var(--err); padding: 6px 10px; background: #2a1618; border-radius: 0 6px 6px 0; margin-bottom: 6px; font-size: 13px; }
  .problem.warn { border-color: var(--warn); background: #2a2416; }
  .problem.ok { border-color: var(--ok); background: #14261c; }
  .slot { display: flex; gap: 6px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
  .slot select { padding: 2px 6px; font-size: 12px; }
  .slot input { padding: 2px 6px; font-size: 12px; }
  .grow { flex: 1; min-width: 90px; }
  .drag { cursor: grab; color: var(--dim); user-select: none; }
  .toast {
    position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
    background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius);
    padding: 9px 16px; font-size: 13px; opacity: 0; transition: opacity .18s; pointer-events: none;
  }
  .toast.on { opacity: 1; }
  .toast.err { border-color: var(--err); }
  .count { color: var(--dim); font-size: 12px; }
  .who { color: var(--dim); font-size: 12px; display: flex; align-items: center; gap: 8px; }
  .who button { padding: 2px 8px; font-size: 12px; }
  .tabs { display: flex; gap: 2px; border: 1px solid var(--line); border-radius: 6px; padding: 2px; }
  .tab { border: none; background: transparent; padding: 3px 10px; border-radius: 4px; font-size: 13px; }
  .tab.on { background: var(--accent); color: #0b1220; font-weight: 600; }
  code { background: var(--panel-2); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
  ${MODULE_PANEL_CSS}
  ${WECHAT_PANEL_CSS}
</style>
</head>
<body>
<header>
  <h1>内容后台</h1>
  <div class="tabs">
    <button id="tabPlan" class="tab on">编排台</button>
    <button id="tabModule" class="tab">模块</button>
    <button id="tabWechat" class="tab">公众号</button>
  </div>
  <label>站点 <select id="site"></select></label>
  <label>知识库 <select id="kb"></select></label>
  <input type="search" id="q" placeholder="搜索标题 / 摘要…" />
  <button id="reload">刷新</button>
  <span class="sp"></span>
  <button id="save">保存计划</button>
  <button id="publish" class="primary">发布</button>
  <span id="who" class="who"></span>
</header>

<main>
  <section class="pane">
    <div class="pane-head"><h2>知识库</h2><span class="sp"></span><span class="count" id="kbCount"></span></div>
    <div class="pane-body" id="kbList"><div class="empty">加载中…</div></div>
  </section>

  <section class="pane">
    <div class="pane-head"><h2>编排台</h2><span class="sp"></span><span class="count" id="planCount"></span></div>
    <div class="pane-body" id="planList"><div class="empty">加载中…</div></div>
  </section>

  <section class="pane">
    <div class="pane-head"><h2>校验与预览</h2></div>
    <div class="pane-body" id="checkPane"><div class="empty">选择站点后显示</div></div>
  </section>
</main>

${MODULE_PANEL_HTML}

${WECHAT_PANEL_HTML}

<div class="toast" id="toast"></div>

${EDITOR_SCRIPT}

<script>
// 当前登录用户（服务端注入；未开启鉴权时为 null）
window.__USER__ = ${user ? JSON.stringify({ displayName: user.displayName, name: user.name }).replace(/</g, "\\u003c") : "null"};

const $ = (id) => document.getElementById(id);

let sites = [], bases = [], kbItems = [], plan = null, siteId = null;

// ── 工具 ────────────────────────────────────────────────
function toast(msg, isErr) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast on" + (isErr ? " err" : "");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = "toast"; }, 2600);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function statusPill(s) {
  if (!s) return '<span class="pill">未知</span>';
  if (["pushed", "pulled", "synced_both", "local_only"].includes(s))
    return '<span class="pill ok">' + esc(s) + '</span>';
  if (s === "conflict") return '<span class="pill err">冲突</span>';
  return '<span class="pill warn">' + esc(s) + '</span>';
}

// ── 加载 ────────────────────────────────────────────────
async function loadSites() {
  const r = await fetch("/api/sites");
  sites = (await r.json()).sites ?? [];
  const sel = $("site");
  sel.innerHTML = sites.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + " (" + esc(s.id) + ")</option>").join("");
  siteId = sites[0]?.id ?? null;
  if (siteId) await loadPlan();
}

async function loadKb() {
  const kbId = $("kb").value;
  const r = await fetch("/api/kb" + (kbId ? "?kbId=" + encodeURIComponent(kbId) : ""));
  const d = await r.json();
  if (d.error) { $("kbList").innerHTML = '<div class="empty">' + esc(d.error) + "</div>"; return; }
  bases = d.bases ?? [];
  kbItems = d.items ?? [];

  // 知识库下拉（含隐含的 default）
  const sel = $("kb");
  const cur = sel.value;
  sel.innerHTML = '<option value="">全部库</option>' +
    bases.map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + "</option>").join("") +
    '<option value="default">默认库（隐含）</option>';
  if (cur) sel.value = cur;

  renderKb();
  // 编排台要用知识条目来显示标题 —— 知识库加载完必须重渲染一次，
  // 否则编排台只能显示 itemId（当时 kbItems 还是空的）
  renderPlan();
}

async function loadPlan() {
  if (!siteId) return;
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/plan");
  const d = await r.json();
  plan = d.plan ?? { version: 1, siteId, kbId: "default", updatedAt: "", entries: [] };
  renderPlan();
  await runCheck();
}

// ── 渲染 ────────────────────────────────────────────────
function renderKb() {
  const q = $("q").value.trim().toLowerCase();
  const list = kbItems.filter((i) =>
    !q || (i.title + " " + (i.summary ?? "")).toLowerCase().includes(q));
  $("kbCount").textContent = list.length + " / " + kbItems.length + " 条";

  if (!list.length) { $("kbList").innerHTML = '<div class="empty">没有匹配的条目</div>'; return; }

  const chosen = new Set((plan?.entries ?? []).map((e) => e.itemId));
  // 模块视图下，「加入编排」换成「加入模块」—— 内容来源同样是知识库，
  // 但落到「页面 → 模块 → 条目」的树里。
  const moduleView = typeof currentView !== "undefined" && currentView === "module";
  $("kbList").innerHTML = list.map((i) => {
    const inPlan = chosen.has(i.id);
    const action = moduleView
      ? '<button data-modadd="' + esc(i.id) + '">加入模块</button>'
      : '<button data-add="' + esc(i.id) + '"' + (inPlan ? " disabled" : "") + ">" +
        (inPlan ? "已加入" : "加入编排") + "</button>";
    return '<div class="row">' +
      '<div class="t">' + esc(i.title) + "</div>" +
      '<div class="m">' + statusPill(i.sync_status) +
      (i.summary ? "<span>" + esc(i.summary.slice(0, 46)) + (i.summary.length > 46 ? "…" : "") + "</span>" : "") +
      (i.tags ? "<span>" + i.tags.slice(0, 3).map(esc).join(" · ") + "</span>" : "") +
      "</div>" +
      '<div class="m" style="margin-top:6px">' +
      action +
      '<button data-view="' + esc(i.id) + '">看正文</button>' +
      "</div></div>";
  }).join("");
}

function renderPlan() {
  const entries = (plan?.entries ?? []).slice().sort((a, b) => a.order - b.order);
  const pub = entries.filter((e) => e.published).length;
  $("planCount").textContent = pub + " 已发布 / " + entries.length + " 条";

  if (!entries.length) {
    $("planList").innerHTML = '<div class="empty">从左侧知识库挑内容加入<br/>加入后在这里定位置、排序、定稿</div>';
    return;
  }

  $("planList").innerHTML = entries.map((e) => {
    const item = kbItems.find((i) => i.id === e.itemId);
    const title = e.title ?? item?.title ?? e.itemId;
    return '<div class="row" data-id="' + esc(e.itemId) + '">' +
      '<div class="t"><span class="drag">⠿</span> ' + esc(title) + "</div>" +
      '<div class="m">' +
      (e.published ? '<span class="pill ok">已发布</span>' : '<span class="pill warn">草稿</span>') +
      '<span class="pill">序 ' + e.order + "</span>" +
      (item?.sync_status === "conflict" ? '<span class="pill err">冲突</span>' : "") +
      "</div>" +
      '<div class="slot">' +
      '<select data-field="slot">' +
      ["insights", "faq", "products", "cases"].map((s) =>
        '<option value="' + s + '"' + (e.slot === s ? " selected" : "") + ">" +
        ({ insights: "洞察文章", faq: "常见问题", products: "产品", cases: "案例" }[s]) + "</option>").join("") +
      "</select>" +
      '<input class="grow" data-field="title" placeholder="标题（留空用原文）" value="' + esc(e.title ?? "") + '" />' +
      '<input class="grow" data-field="order" type="number" value="' + e.order + '" style="width:64px" title="排序" />' +
      '<button data-toggle="' + esc(e.itemId) + '">' + (e.published ? "转草稿" : "定稿") + "</button>" +
      '<button data-up="' + esc(e.itemId) + '">↑</button>' +
      '<button data-down="' + esc(e.itemId) + '">↓</button>' +
      '<button data-del="' + esc(e.itemId) + '">移除</button>' +
      "</div></div>";
  }).join("");
}

async function runCheck() {
  if (!siteId) return;
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/preview", { method: "POST" });
  const d = await r.json();
  if (d.error) { $("checkPane").innerHTML = '<div class="empty">' + esc(d.error) + "</div>"; return; }

  const problems = d.problems ?? [];
  let html = "";
  if (!problems.length) {
    html += '<div class="problem ok">校验通过 —— 可以发布</div>';
  } else {
    html += '<div class="problem">发现 ' + problems.length + " 个问题：</div>";
    for (const p of problems) html += '<div class="problem warn">' + esc(p) + "</div>";
  }
  if ((d.skipped ?? []).length) {
    html += '<div class="problem warn">' + d.skipped.length + " 条被跳过（知识库中已不存在）</div>";
  }

  const counts = [
    ["洞察文章", (d.insights ?? []).length],
    ["常见问题", (d.faq ?? []).length],
    ["产品", (d.products ?? []).length],
    ["案例", (d.cases ?? []).length],
  ];
  html += '<div class="row" style="margin-top:12px"><div class="t">合并后的站点内容</div><div class="m">' +
    counts.map(([k, v]) => "<span>" + k + " " + v + "</span>").join("") + "</div></div>";

  // 需补齐的关键字段 —— **只看计划产生的内容**。
  // 手写内容包里人工写的案例/产品不该出现在这里：后台只对机器编排的部分负责。
  const planned = d.planned ?? { insights: [], faq: [], products: [], cases: [] };
  const needMore = [...(planned.cases ?? []), ...(planned.products ?? [])];
  if (needMore.length) {
    html += '<div class="row"><div class="t">需补齐的关键字段（来自知识库编排）</div>';
    for (const x of needMore) {
      html += '<div class="m" style="margin-top:6px"><code>' + esc(x.id) + "</code> " + esc(x.title ?? x.name ?? "") +
        '<span class="pill ' + (x.client ? "ok" : "err") + '">' + (x.client ? "客户名 ✓" : "缺客户名") + "</span>" +
        '<span class="pill ' + ((x.results ?? []).length ? "ok" : "err") + '">' + ((x.results ?? []).length ? "结果 ✓" : "缺量化结果") + "</span>" +
        "</div>";
    }
    html += "</div>";
  }

  $("checkPane").innerHTML = html;
}

// ── 交互 ────────────────────────────────────────────────
$("site").addEventListener("change", async (e) => {
  siteId = e.target.value;
  await loadPlan();
});

$("kb").addEventListener("change", loadKb);
$("q").addEventListener("input", renderKb);

$("reload").addEventListener("click", async () => {
  await fetch("/api/kb/refresh", { method: "POST" });
  await loadKb();
  toast("知识库已刷新");
});

$("kbList").addEventListener("click", async (e) => {
  const addId = e.target.dataset?.add;
  if (addId) {
    plan.entries.push({
      itemId: addId,
      slot: "insights",
      order: plan.entries.length + 1,
      published: false,
    });
    renderKb(); renderPlan();
    return;
  }
  // 模块视图：把知识条目加进当前选中的模块
  const modAddId = e.target.dataset?.modadd;
  if (modAddId) {
    if (window.__modAddKbItem) window.__modAddKbItem(modAddId);
    return;
  }
  const viewId = e.target.dataset?.view;
  if (viewId) {
    const r = await fetch("/api/kb/item/" + encodeURIComponent(viewId));
    const it = await r.json();
    alert((it.title ?? "") + "\\n\\n" + (it.content ?? ""));
  }
});

$("planList").addEventListener("click", async (e) => {
  const id = e.target.dataset?.del ?? e.target.dataset?.toggle ?? e.target.dataset?.up ?? e.target.dataset?.down;
  if (!id) return;
  const idx = plan.entries.findIndex((x) => x.itemId === id);
  if (idx < 0) return;
  const entry = plan.entries[idx];

  if (e.target.dataset.del) plan.entries.splice(idx, 1);
  else if (e.target.dataset.toggle) entry.published = !entry.published;
  else if (e.target.dataset.up) {
    const prev = plan.entries.findIndex((x) => x.order < entry.order);
    if (prev >= 0) { const a = plan.entries[prev].order; plan.entries[prev].order = entry.order; entry.order = a; }
  } else if (e.target.dataset.down) {
    const next = plan.entries.findIndex((x) => x.order > entry.order);
    if (next >= 0) { const a = plan.entries[next].order; plan.entries[next].order = entry.order; entry.order = a; }
  }
  renderPlan(); renderKb();
});

$("planList").addEventListener("change", (e) => {
  const row = e.target.closest(".row");
  if (!row) return;
  const id = row.dataset.id;
  const entry = plan.entries.find((x) => x.itemId === id);
  if (!entry) return;
  const field = e.target.dataset.field;
  if (field === "slot") entry.slot = e.target.value;
  else if (field === "title") entry.title = e.target.value || undefined;
  else if (field === "order") entry.order = Number(e.target.value) || 0;
  renderPlan();
});

$("save").addEventListener("click", async () => {
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/plan", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  });
  const d = await r.json();
  if (d.error) toast(d.error, true); else toast("计划已保存 → plan.json");
});

$("publish").addEventListener("click", async () => {
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/publish", { method: "POST" });
  const d = await r.json();
  if (d.error) { toast(d.error, true); return; }
  if ((d.problems ?? []).length) {
    toast("有 " + d.problems.length + " 个问题未解决 —— 见右栏", true);
  } else {
    toast("已发布 → " + d.written);
  }
  await runCheck();
});

(async () => {
  await loadSites();
  await loadKb();
})();

// 登录状态（服务端注入 __USER__；未开启鉴权时为 null）
if (window.__USER__) {
  const who = $("who");
  who.textContent = window.__USER__.displayName || window.__USER__.name;
  const btn = document.createElement("button");
  btn.textContent = "退出";
  btn.addEventListener("click", () => { location.href = "/logout"; });
  who.appendChild(btn);
}
</script>

${MODULE_PANEL_SCRIPT}

${WECHAT_PANEL_SCRIPT}

<script>
// ── 视图切换 ────────────────────────────────────────────
let currentView = "plan";

function switchView(v) {
  currentView = v;
  document.querySelector("main").hidden = v !== "plan";
  document.getElementById("modulePane").hidden = v !== "module";
  document.getElementById("wechatPane").hidden = v !== "wechat";
  document.getElementById("tabPlan").classList.toggle("on", v === "plan");
  document.getElementById("tabModule").classList.toggle("on", v === "module");
  document.getElementById("tabWechat").classList.toggle("on", v === "wechat");
  // 编排台专属按钮在模块视图下无意义
  document.getElementById("save").hidden = v !== "plan";
  document.getElementById("publish").hidden = v !== "plan";
  if (v === "module") loadModules();
  if (v === "wechat") {
    // 公众号排版要基于「当前选中的条目」—— 先确保模块数据已加载
    if (typeof loadModules === "function" && !modPlan) loadModules();
    if (typeof wcRenderSide === "function") { wcRenderSide(); wcRenderPreview(); }
  }
  // 知识库列表的按钮随视图变化（「加入编排」↔「加入模块」）
  renderKb();
}

document.getElementById("tabPlan").addEventListener("click", () => switchView("plan"));
document.getElementById("tabModule").addEventListener("click", () => switchView("module"));
document.getElementById("tabWechat").addEventListener("click", () => switchView("wechat"));

// 模块面板的绑定（在 MODULE_PANEL_SCRIPT 之后执行）
if (typeof bindModulePanel === "function") bindModulePanel();
// 公众号排版面板的绑定（在 WECHAT_PANEL_SCRIPT 之后执行）
if (typeof bindWechatPanel === "function") bindWechatPanel();
</script>
</body>
</html>
`;
}

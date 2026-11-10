/**
 * 模块编排面板 —— 「页面 → 模块 → 条目」三层 CRUD 的界面。
 *
 * 与旧的「编排台」并存：
 *   - 编排台（plan）：把知识条目塞进四个固定槽位（insights/faq/products/cases）
 *   - 模块面板（本文件）：自由组合页面与模块，条目可来自知识库**或**手工创作
 *
 * 两者都是后台的独立视图，切换查看，互不干扰。
 *
 * 界面结构（三栏）：
 *   左：页面列表（增删改查、排序、发布）
 *   中：当前页面的模块列表（增删改查、排序、启停）+ 模块内条目
 *   右：条目编辑（标题/摘要/富文本正文/类型专属字段）+ 校验结果
 */

export const MODULE_PANEL_HTML = `
<section id="modulePane" class="module-pane" hidden>
  <aside class="mod-pages">
    <div class="pane-head">
      <h2>页面</h2><span class="sp"></span>
      <button id="modAddPage">+ 新页</button>
    </div>
    <div class="pane-body" id="modPageList"></div>
  </aside>

  <aside class="mod-modules">
    <div class="pane-head">
      <h2>模块</h2><span class="sp"></span>
      <select id="modFragSel" title="插入一个片段引用"><option value="">插片段…</option></select>
      <button id="modAddFragment">插入</button>
      <button id="modAddModule">+ 加模块</button>
    </div>
    <div class="pane-body" id="modModuleList"></div>
  </aside>

  <aside class="mod-items">
    <div class="pane-head">
      <h2>条目</h2><span class="sp"></span>
      <button id="modAddManual">+ 手工新建</button>
      <span class="count" id="modItemCount"></span>
    </div>
    <div class="pane-body" id="modItemList"></div>
  </aside>

  <aside class="mod-edit">
    <div class="pane-head">
      <h2>编辑</h2><span class="sp"></span>
      <button id="modSave">保存编排</button>
      <button id="modPublish" class="primary">发布并重建</button>
    </div>
    <div class="pane-body" id="modEditor"></div>
  </aside>

  <aside class="mod-look">
    <div class="pane-head"><h2>外观</h2></div>
    <div class="pane-body" id="modLook"></div>
  </aside>
</section>
`;

/** 面板的样式 */
export const MODULE_PANEL_CSS = `
/* ── 审核状态 ─────────────────────────────────────────── */
.review-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.review-state { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--panel-2); color: var(--dim); border: 1px solid var(--line); }
.review-state.pending { color: var(--warn); border-color: var(--warn); }
.review-state.approved { color: var(--ok); border-color: var(--ok); }
.review-state.rejected { color: var(err); border-color: var(--err); }

.module-pane {
  flex: 1; display: grid;
  grid-template-columns: 200px 230px 270px 1fr 240px;
  min-height: 0; overflow: hidden;
}
.module-pane[hidden] { display: none; }
.module-pane > aside {
  border-right: 1px solid var(--line);
  display: flex; flex-direction: column; min-height: 0; min-width: 0;
}
.module-pane > aside:last-child { border-right: none; }
.mod-pages .pane-body, .mod-modules .pane-body,
.mod-items .pane-body, .mod-edit .pane-body,
.mod-look .pane-body {
  overflow-y: auto; padding: 8px; flex: 1;
}

/* 外观设置 */
.look-group { margin-bottom: 14px; }
.look-group > h3 {
  font-size: 11px; margin: 0 0 6px; color: var(--accent);
  text-transform: uppercase; letter-spacing: .5px;
}
.look-opts { display: grid; gap: 4px; }
.look-opt {
  text-align: left; padding: 6px 8px; font-size: 12px;
  display: flex; align-items: center; gap: 7px; line-height: 1.4;
}
.look-opt .swatch {
  width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0;
  border: 1px solid var(--line);
}
.look-opt.on { border-color: var(--accent); background: var(--panel-2); }
.look-opt .desc { color: var(--dim); font-size: 11px; display: block; }
.look-field { margin-bottom: 8px; }
.look-field label { font-size: 11px; color: var(--dim); display: block; margin-bottom: 3px; }
.look-field input, .look-field select { width: 100%; box-sizing: border-box; font-size: 12px; }
.mrow {
  border: 1px solid var(--line); border-radius: var(--radius);
  padding: 6px 8px; margin-bottom: 6px; background: var(--panel);
  cursor: pointer;
}
.mrow:hover { border-color: #39414f; }
.mrow.sel { border-color: var(--accent); background: var(--panel-2); }
.mrow .t { font-size: 13px; font-weight: 500; margin-bottom: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mrow .m { color: var(--dim); font-size: 11px; display: flex; gap: 6px;
  align-items: center; flex-wrap: wrap; }
.mrow .m button { padding: 1px 6px; font-size: 11px; }
.mform { display: flex; flex-direction: column; gap: 8px; }
.mform label { font-size: 12px; color: var(--dim); display: block; margin-bottom: 3px; }
.mform input, .mform select, .mform textarea {
  width: 100%; box-sizing: border-box;
}
.mform .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.mform .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.mform .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.hint { font-size: 11px; color: var(--dim); margin-top: 3px; }
.hint.err { color: var(--err); }
.mgroup { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
.mgroup:last-child { border-bottom: none; }
.mgroup > h3 { font-size: 12px; margin: 0 0 6px; color: var(--accent);
  text-transform: uppercase; letter-spacing: .5px; }

/* ── 富文本编辑器 ─────────────────────────────────────── */
.rte { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
.rte-toolbar {
  display: flex; gap: 3px; align-items: center; flex-wrap: wrap;
  padding: 5px 6px; border-bottom: 1px solid var(--line); background: var(--panel-2);
}
.rte-toolbar button { padding: 2px 7px; font-size: 12px; }
.rte-sep { width: 1px; height: 16px; background: var(--line); margin: 0 3px; }
.rte-body { padding: 6px; }
.eblock {
  display: grid; grid-template-columns: 96px 1fr 24px 24px 24px;
  gap: 4px; align-items: start; margin-bottom: 4px;
}
.eblock select { padding: 2px 4px; font-size: 11px; }
.eblock-body {
  min-height: 30px; padding: 5px 7px; border: 1px solid transparent;
  border-radius: 5px; background: var(--panel-2); outline: none;
  white-space: pre-wrap; word-break: break-word; line-height: 1.6;
}
.eblock-body:focus { border-color: var(--accent); }
.eblock-body:empty::before {
  content: "（空段落）"; color: var(--dim);
}
.eblock-move, .eblock-del { padding: 2px 0; font-size: 12px; }
`;

export const MODULE_PANEL_SCRIPT = `
<script>
// ── 模块编排状态 ────────────────────────────────────────
let modPlan = null;        // ModulePlan
let curPageId = null;
let curModuleId = null;
let curItemId = null;
let modStats = null;

/**
 * 有没有某个权限 —— 服务端注入 window.__PERMS__。
 *
 * 前端据此**禁用**无权操作，而不是让人点了再吃一个 403。
 * 真正的拦截在服务端（apps/admin/src/server.ts 的 requirePerm）——
 * 前端只是让人提前知道。
 */
function hasPerm(p) {
  return (window.__PERMS__ ?? []).includes(p);
}

/** 审核状态的中文名 */
const REVIEW_LABEL = { pending: "待审核", approved: "已通过", rejected: "已驳回" };

const MOD_TYPE_LABEL = {
  "rich-text": "富文本正文",
  "card-grid": "卡片网格",
  "faq": "问答",
  "stats": "数据条",
  "hero": "英雄区",
  "cta": "行动号召",
  "gallery": "图片",
  "trust": "信任背书",
  "logo-wall": "客户 Logo 墙",
  "process": "流程步骤",
  "form": "留言表单",
};
const CARD_KIND_LABEL = { products: "产品", cases: "案例", insights: "洞察", generic: "通用" };

function mEsc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function mUid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 10);
}

function curPage() {
  return (modPlan?.pages ?? []).find((p) => p.id === curPageId) ?? null;
}

/** 页面在栏目树里的深度 —— 0 = 顶级 */
function pageDepth(id) {
  let d = 0;
  let cur = (modPlan?.pages ?? []).find((p) => p.id === id);
  // 防环（父指针指错时会死循环）—— 最多数 20 层
  while (cur?.parentId && d < 20) {
    cur = (modPlan?.pages ?? []).find((p) => p.id === cur.parentId);
    d++;
  }
  return d;
}
function curModule() {
  const p = curPage();
  return (p?.modules ?? []).find((m) => m.id === curModuleId) ?? null;
}
function curItem() {
  const m = curModule();
  // 引用片段的模块 —— 条目在片段里，要按展开后的找
  const rm = resolvedModule(m);
  return (rm?.items ?? []).find((i) => i.id === curItemId) ?? null;
}

// ── 片段（可复用组件）───────────────────────────────────
//
// 引用片段的模块，内容不在模块里 —— 在片段里。
// 前端要按「展开后」的样子展示，所以这里也做一次展开
// （服务端物化时展开一次，两边各一份 —— 后端那份是权威）。

function fragById(id) {
  const list = (typeof window !== "undefined" && window.geoFragments) || [];
  return list.find((f) => f.id === id) ?? null;
}

/** 展开片段引用 —— 片段内容 + 局部覆盖 */
function resolvedModule(m) {
  if (!m || !m.fragmentId) return m;
  const f = fragById(m.fragmentId);
  if (!f) return m;
  const ov = m.overrides || {};
  const items = (f.items || []).map((it) => {
    const o = (ov.items || []).find((x) => x.itemId === it.id);
    if (!o) return it;
    if (o.hidden) return null;
    const out = { ...it };
    for (const k of ["title", "summary", "question", "answer", "image", "value",
      "unit", "label", "href", "client", "results", "specs", "alt", "caption",
      "step", "published"]) {
      if (o[k] !== undefined) out[k] = o[k];
    }
    return out;
  }).filter(Boolean);
  return {
    ...m,
    type: f.type,
    title: ov.title !== undefined ? ov.title : (m.title !== undefined ? m.title : f.title),
    subtitle: ov.subtitle !== undefined ? ov.subtitle : (m.subtitle !== undefined ? m.subtitle : f.subtitle),
    props: { ...(f.props || {}), ...(ov.props || {}) },
    items,
  };
}

async function loadModules() {
  if (!siteId) return;
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/modules");
  const d = await r.json();
  modPlan = d.plan ?? { version: 1, siteId, kbId: "default", updatedAt: "", pages: [] };
  modStats = d.stats ?? null;
  // 片段表一起拿 —— 引用/脱离/存为片段都要用
  if (d.fragments) window.geoFragments = d.fragments;
  await loadFragments();
  if (!curPageId || !modPlan.pages.some((p) => p.id === curPageId)) {
    curPageId = modPlan.pages[0]?.id ?? null;
    curModuleId = null;
    curItemId = null;
  }
  renderModules();
}

function renderModules() {
  renderPageList();
  renderFragSelect();
  renderModuleList();
  renderItemList();
  renderModuleEditor();
  renderLook();
  // 富文本编辑器要在 DOM 建好之后再挂
  mountEditor(curItem());
  // 图片选择器要用媒体库数据
  renderImagePicker(curItem());
}

/** 片段下拉 —— 插入片段引用 */
function renderFragSelect() {
  const sel = document.getElementById("modFragSel");
  if (!sel) return;
  const cur = sel.value;
  const list = (typeof window !== "undefined" && window.geoFragments) || [];
  sel.innerHTML = '<option value="">插片段…</option>' +
    list.map((f) =>
      '<option value="' + mEsc(f.id) + '">' + mEsc(f.name) + "（" +
      (f.items ?? []).length + " 条）</option>").join("");
  sel.value = cur;
}

// ── 外观设置（布局变体 / 质感 / 色板）────────────────────

const LOOK_LAYOUTS = [
  { id: "centered", label: "窄栏居中", desc: "传统 B2B，稳重克制", swatch: "linear-gradient(135deg,#3b82f6 0%,#3b82f6 50%,#e5e7eb 50%,#e5e7eb 100%)" },
  { id: "split", label: "左右分栏", desc: "横向节奏，产品/SaaS", swatch: "linear-gradient(135deg,#3b82f6 0%,#3b82f6 45%,#e5e7eb 45%,#e5e7eb 55%,#f9fafb 55%)" },
  { id: "editorial", label: "杂志编排", desc: "衬线标题大留白，咨询/律所", swatch: "linear-gradient(135deg,#1f2937 0%,#1f2937 30%,#f3f4f6 30%,#f3f4f6 100%)" },
  { id: "bold", label: "大胆撞色", desc: "超大标题主色块，消费/初创", swatch: "linear-gradient(135deg,#f97316 0%,#f97316 55%,#fff7ed 55%,#fff7ed 100%)" },
];

const LOOK_STYLES = [
  { id: "modern", label: "现代（圆角阴影）" },
  { id: "classic", label: "经典（方正边框）" },
  { id: "minimal", label: "极简（大留白）" },
];

const LOOK_VARIANTS = [
  { id: "default", label: "蓝（默认）", color: "#2f6bff" },
  { id: "forest", label: "绿（环保/医疗）", color: "#10b981" },
  { id: "slate", label: "石墨（金融/咨询）", color: "#64748b" },
  { id: "amber", label: "暖橙（餐饮/零售）", color: "#f59e0b" },
];

function renderLook() {
  const el = document.getElementById("modLook");
  if (!el) return;
  const a = modPlan?.appearance ?? {};

  const group = (title, options, cur, field) =>
    '<div class="look-group"><h3>' + title + "</h3><div class='look-opts'>" +
    options.map((o) =>
      '<button class="look-opt' + (o.id === cur ? " on" : "") + '" data-look="' + field + '" data-lookval="' + o.id + '">' +
      (o.swatch ? '<span class="swatch" style="background:' + o.swatch + '"></span>' : "") +
      (o.color ? '<span class="swatch" style="background:' + o.color + '"></span>' : "") +
      "<span>" + o.label +
      (o.desc ? '<span class="desc">' + o.desc + "</span>" : "") +
      "</span></button>").join("") +
    "</div></div>";

  el.innerHTML =
    group("布局变体", LOOK_LAYOUTS, a.layout ?? "", "layout") +
    group("质感", LOOK_STYLES, a.style ?? "", "style") +
    group("色板", LOOK_VARIANTS, a.variant ?? "", "variant") +
    '<div class="look-group"><h3>密度</h3><div class="look-opts">' +
    [{ id: "comfortable", label: "舒展" }, { id: "compact", label: "紧凑（内容多时用）" }]
      .map((o) =>
        '<button class="look-opt' + ((a.density ?? "") === o.id ? " on" : "") +
        '" data-look="density" data-lookval="' + o.id + '"><span>' + o.label + "</span></button>").join("") +
    "</div></div>" +
    '<div class="look-group"><h3>主色</h3>' +
    '<div class="look-field"><input id="lookPrimary" placeholder="#2f6bff" value="' +
    mEsc(a.primaryColor ?? "") + '" /></div>' +
    '<div class="hint">留空 = 用色板默认色</div></div>';
}

function renderPageList() {
  const pages = (modPlan?.pages ?? []).slice().sort((a, b) => a.order - b.order);
  const el = document.getElementById("modPageList");
  if (!pages.length) {
    el.innerHTML = '<div class="empty">还没有页面<br/>点「+ 新页」开始</div>';
    return;
  }
  el.innerHTML = pages.map((p) => {
    const mods = (p.modules ?? []).length;
    const items = (p.modules ?? []).reduce((n, m) => n + (m.items ?? []).length, 0);
    // 层级缩进 —— 栏目树
    const depth = pageDepth(p.id);
    const indent = depth ? "padding-left:" + (8 + depth * 14) + "px" : "";
    // 定时状态
    let sched = "";
    if (p.publishAt) {
      const due = Date.parse(p.publishAt) <= Date.now();
      sched = '<span class="pill ' + (due ? "ok" : "warn") + '">' +
        (due ? "已定时" : "待发布") + "</span>";
    }
    return '<div class="mrow' + (p.id === curPageId ? " sel" : "") + '" data-page="' + mEsc(p.id) + '" style="' + indent + '">' +
      '<div class="t">' + (p.sticky ? "📌 " : "") + mEsc(p.title || p.path) + "</div>" +
      '<div class="m">' +
      (p.published ? '<span class="pill ok">发布</span>' : '<span class="pill warn">草稿</span>') +
      (p.inNav === false ? '<span class="pill">不导航</span>' : "") +
      sched +
      '<span class="pill">' + mEsc(p.path) + "</span>" +
      '<span class="pill">' + mods + " 模块 / " + items + " 条</span>" +
      "</div>" +
      '<div class="m" style="margin-top:5px">' +
      '<button data-pub="' + mEsc(p.id) + '">' + (p.published ? "转草稿" : "发布") + "</button>" +
      '<button data-pup="' + mEsc(p.id) + '">↑</button>' +
      '<button data-pdown="' + mEsc(p.id) + '">↓</button>' +
      '<button data-pdel="' + mEsc(p.id) + '">删</button>' +
      "</div></div>";
  }).join("");
}

function renderModuleList() {
  const p = curPage();
  const el = document.getElementById("modModuleList");
  if (!p) { el.innerHTML = '<div class="empty">先选一个页面</div>'; return; }
  const mods = (p.modules ?? []).slice().sort((a, b) => a.order - b.order);
  if (!mods.length) {
    el.innerHTML = '<div class="empty">这个页面还没有模块<br/>点「+ 加模块」</div>';
    return;
  }
  el.innerHTML = mods.map((m) => {
    // 引用片段的模块 —— 条目在片段里，列表要显示展开后的条目数
    const rm = resolvedModule(m);
    const pub = (rm.items ?? []).filter((i) => i.published).length;
    const frag = m.fragmentId ? fragById(m.fragmentId) : null;
    return '<div class="mrow' + (m.id === curModuleId ? " sel" : "") + '" data-module="' + mEsc(m.id) + '">' +
      '<div class="t">' + mEsc(rm.title || MOD_TYPE_LABEL[rm.type] || rm.type) + "</div>" +
      '<div class="m">' +
      '<span class="pill">' + mEsc(MOD_TYPE_LABEL[rm.type] || rm.type) + "</span>" +
      (frag ? '<span class="pill">引用「' + mEsc(frag.name) + "」</span>" : "") +
      (m.enabled ? "" : '<span class="pill warn">已停用</span>') +
      '<span class="pill">' + pub + "/" + (rm.items ?? []).length + " 条</span>" +
      "</div>" +
      '<div class="m" style="margin-top:5px">' +
      '<button data-men="' + mEsc(m.id) + '">' + (m.enabled ? "停用" : "启用") + "</button>" +
      '<button data-mup="' + mEsc(m.id) + '">↑</button>' +
      '<button data-mdown="' + mEsc(m.id) + '">↓</button>' +
      '<button data-msavefrag="' + mEsc(m.id) + '">存为片段</button>' +
      (frag ? "" : '<button data-mfrag="' + mEsc(m.id) + '">转引用</button>') +
      (frag ? '<button data-mdetach="' + mEsc(m.id) + '">脱离引用</button>' : "") +
      '<button data-mdel="' + mEsc(m.id) + '">删</button>' +
      "</div></div>";
  }).join("");
}

function renderItemList() {
  const m = curModule();
  const el = document.getElementById("modItemList");
  const cnt = document.getElementById("modItemCount");
  if (!m) {
    el.innerHTML = '<div class="empty">先选一个模块</div>';
    if (cnt) cnt.textContent = "";
    return;
  }
  // 引用片段的模块 —— 条目来自片段，按展开后的显示
  const rm = resolvedModule(m);
  const isRef = !!m.fragmentId;
  const items = (rm.items ?? []).slice().sort((a, b) => a.order - b.order);
  if (cnt) cnt.textContent = items.filter((i) => i.published).length + " 已发布 / " + items.length + " 条";

  const head = isRef
    ? '<div class="mgroup"><h3>来自片段</h3>' +
      '<div class="hint">这些条目在片段「' + mEsc((fragById(m.fragmentId) || {}).name ?? "?") +
      "」里。改这里的内容会写成**局部覆盖**，片段本体不变。</div></div>"
    : '<div class="mgroup"><h3>从知识库添加</h3>' +
      '<div class="hint">点知识库条目右侧的「加入模块」按钮</div></div>';

  el.innerHTML =
    head +
    (items.length
      ? items.map((i) => {
          const kb = i.source === "kb" ? kbItems.find((x) => x.id === i.kbItemId) : null;
          const title = i.title || i.question || kb?.title || i.id;
          let sched = "";
          if (i.publishAt) {
            const due = Date.parse(i.publishAt) <= Date.now();
            sched = '<span class="pill ' + (due ? "ok" : "warn") + '">' +
              (due ? "已定时" : "待发布") + "</span>";
          }
          // 引用模块的条目不能删（删了就是删片段里的条目）
          const actions = isRef
            ? '<button data-iedit="' + mEsc(i.id) + '">改这一处</button>'
            : '<button data-ipub="' + mEsc(i.id) + '">' + (i.published ? "转草稿" : "定稿") + "</button>" +
              '<button data-iup="' + mEsc(i.id) + '">↑</button>' +
              '<button data-idown="' + mEsc(i.id) + '">↓</button>' +
              '<button data-idel="' + mEsc(i.id) + '">删</button>';
          return '<div class="mrow' + (i.id === curItemId ? " sel" : "") + '" data-item="' + mEsc(i.id) + '">' +
            '<div class="t">' + (i.sticky ? "📌 " : "") + mEsc(title) + "</div>" +
            '<div class="m">' +
            (i.source === "kb"
              ? '<span class="pill ok">知识库</span>'
              : '<span class="pill">手工</span>') +
            (isRef ? '<span class="pill">片段</span>' : "") +
            (i.published ? '<span class="pill ok">发布</span>' : '<span class="pill warn">草稿</span>') +
            sched +
            '<span class="pill">序 ' + i.order + "</span>" +
            "</div>" +
            '<div class="m" style="margin-top:5px">' + actions + "</div></div>";
        }).join("")
      : '<div class="empty">这个模块还没有条目</div>');
}

/** 右栏编辑区 */
function renderModuleEditor() {
  const el = document.getElementById("modEditor");
  const item = curItem();
  const page = curPage();
  const mod = curModule();

  if (item) {
    // 引用片段的条目 —— 编辑的是**局部覆盖**，不是片段本体
    if (mod?.fragmentId) {
      el.innerHTML = fragItemEditorHtml(item, mod, fragById(mod.fragmentId));
      return;
    }
    el.innerHTML = itemEditorHtml(item, mod);
    return;
  }
  if (mod) { el.innerHTML = moduleEditorHtml(mod, page); return; }
  if (page) { el.innerHTML = pageEditorHtml(page); return; }
  el.innerHTML = '<div class="empty">左边选一个页面 / 模块 / 条目</div>';
}

/**
 * 片段条目的编辑区 —— 只能改「这一处」的覆盖。
 *
 * 为什么不能直接改正文：
 *   改了就是改片段本体 —— 首页和「关于我们」页会一起变，
 *   这与「局部覆盖」的语义相反。
 *   所以这里只开放少量文案字段；要改正文请改片段。
 */
function fragItemEditorHtml(i, m, frag) {
  const ov = (m.overrides?.items ?? []).find((x) => x.itemId === i.id);
  const isFaq = frag?.type === "faq";

  let h = '<div class="mform">' +
    '<div class="mgroup"><h3>片段条目</h3>' +
    '<div class="hint">来自片段「' + mEsc(frag?.name ?? "?") + "」<br/>" +
    "这里改的是**这一处的覆盖**，片段本体不变 —— " +
    "别的页面引用同一片段时不受影响。</div></div>";

  if (isFaq) {
    h += '<div><label>问题（覆盖）</label>' +
      '<input id="me-item-question" value="' + mEsc(ov?.question ?? "") + '" /></div>' +
      '<div><label>答案（覆盖）</label><textarea id="me-item-answer" rows="4">' +
      mEsc(ov?.answer ?? "") + "</textarea></div>";
  } else {
    h += '<div><label>标题（覆盖）</label>' +
      '<input id="me-item-title" value="' + mEsc(ov?.title ?? "") + '" /></div>' +
      '<div><label>摘要（覆盖）</label><textarea id="me-item-summary" rows="2">' +
      mEsc(ov?.summary ?? "") + "</textarea></div>";
  }

  h += '<div class="hint">片段里的原值：' +
    mEsc(isFaq ? (i.question ?? "") : (i.title ?? "")) + "</div>" +
    '<div class="actions">' +
    '<button id="me-item-save" class="primary">保存覆盖</button>' +
    '<button id="me-item-reset">恢复片段内容</button>' +
    "</div></div>";
  return h;
}

function pageEditorHtml(p) {
  // 父页面下拉 —— 构成栏目树
  const others = (modPlan?.pages ?? []).filter((x) => x.id !== p.id);
  const parentOpts =
    '<option value="">（顶级栏目）</option>' +
    others.map((x) =>
      '<option value="' + mEsc(x.id) + '"' + (p.parentId === x.id ? " selected" : "") + ">" +
      mEsc(x.title || x.path) + "</option>").join("");

  return '<div class="mform">' +
    '<div><label>页面标题</label><input id="me-page-title" value="' + mEsc(p.title) + '" /></div>' +
    '<div><label>路由路径</label><input id="me-page-path" value="' + mEsc(p.path) + '" placeholder="/about" />' +
    '<div class="hint">相对站点根；发布后成为真实路由</div></div>' +
    '<div><label>页面描述（每页必须有自己的一份）</label>' +
    '<textarea id="me-page-desc" rows="3">' + mEsc(p.description ?? "") + "</textarea></div>" +
    '<div><label>父页面（栏目层级）</label><select id="me-page-parent">' + parentOpts + "</select>" +
    '<div class="hint">企业门户常见结构：产品服务（父）→ 三个子产品页</div></div>' +
    '<div class="row2">' +
    '<div><label>定时发布</label><input id="me-page-publish-at" type="datetime-local" value="' +
      mEsc((p.publishAt ?? "").slice(0, 16)) + '" /></div>' +
    '<div><label>导航显示</label><select id="me-page-in-nav">' +
    '<option value="1"' + (p.inNav !== false ? " selected" : "") + ">显示</option>" +
    '<option value="0"' + (p.inNav === false ? " selected" : "") + ">隐藏</option>" +
    "</select></div></div>" +
    '<div class="actions">' +
    '<button id="me-page-sticky">' + (p.sticky ? "取消置顶" : "置顶") + "</button>" +
    '<button id="me-page-save" class="primary">应用到页面</button>' +
    "</div></div>";
}

function moduleEditorHtml(m, page) {
  const kind = String(m.props?.kind ?? "");
  const isRef = !!m.fragmentId;
  const rm = resolvedModule(m);
  const frag = isRef ? fragById(m.fragmentId) : null;

  let h = '<div class="mform">' +
    (isRef
      ? '<div class="mgroup"><h3>片段引用</h3>' +
        '<div class="hint">内容在片段「' + mEsc(frag?.name ?? m.fragmentId) + "」里 —— " +
        "改下面的标题/副标题是**这一处**的覆盖，片段本体不变。<br/>" +
        "要让这一处独立于片段，点「脱离引用」。</div>" +
        '<div class="actions"><button id="me-mod-detach">脱离引用</button>' +
        '<button id="me-mod-openfrag">打开片段</button></div></div>'
      : "") +
    '<div><label>模块标题</label><input id="me-mod-title" value="' +
      mEsc(rm.title ?? "") + '" /></div>' +
    '<div><label>副标题</label><input id="me-mod-sub" value="' +
      mEsc(rm.subtitle ?? "") + '" /></div>' +
    '<div class="row2">' +
    '<div><label>模块类型</label><select id="me-mod-type"' +
      (isRef ? " disabled" : "") + ">" +
    Object.entries(MOD_TYPE_LABEL).map(([k, v]) =>
      '<option value="' + k + '"' + (rm.type === k ? " selected" : "") + ">" + v + "</option>").join("") +
    "</select>" +
    (isRef ? '<div class="hint">类型由片段决定</div>' : "") + "</div>" +
    '<div><label>卡片类型（card-grid 用）</label><select id="me-mod-kind"' +
      (isRef ? " disabled" : "") + ">" +
    Object.entries(CARD_KIND_LABEL).map(([k, v]) =>
      '<option value="' + k + '"' + (kind === k ? " selected" : "") + ">" + v + "</option>").join("") +
    "</select></div></div>";

  // 表单模块：字段定义在模块 props 里 —— 一行一个字段
  // 引用片段的模块不显示字段编辑 —— props 归片段管
  if (rm.type === "form" && !isRef) {
    const fields = m.props?.fields ?? [];
    const lines = fields.map((f) =>
      [f.name, f.label, f.type ?? "text", f.required ? "必填" : "选填",
        (f.options ?? []).join("|"), f.placeholder ?? ""].join(",")).join("\\n");
    h += '<div><label>表单字段（一行一个：字段名,标签,类型,必填/选填,选项(用|分隔),占位提示）</label>' +
      '<textarea id="me-mod-fields" rows="5" placeholder="姓名,您的称呼,text,必填,,请输入姓名&#10;手机,联系电话,tel,必填,,&#10;需求,需求描述,textarea,选填,,简单描述">' +
      mEsc(lines) + "</textarea>" +
      '<div class="hint">必填项总数控制在 3–5 个 —— 多了转化率掉。类型可选 text / tel / email / url / textarea / select</div></div>';
  }

  h += '<div class="row2">' +
    '<div><label>排序</label><input id="me-mod-order" type="number" value="' + m.order + '" /></div>' +
    '<div><label>状态</label><select id="me-mod-enabled">' +
    '<option value="1"' + (m.enabled ? " selected" : "") + ">启用</option>" +
    '<option value="0"' + (!m.enabled ? " selected" : "") + ">停用</option>" +
    "</select></div></div>" +
    '<div class="actions"><button id="me-mod-save" class="primary">应用到模块</button></div>' +
    "</div>";
  return h;
}

function itemEditorHtml(i, m) {
  const isKb = i.source === "kb";
  const kind = String(m?.props?.kind ?? "");
  const isFaq = m?.type === "faq";
  const isStats = m?.type === "stats";
  const isCta = m?.type === "cta";
  const isHero = m?.type === "hero";

  let h = '<div class="mform">';

  h += '<div class="mgroup"><h3>' + (isKb ? "知识库条目" : "手工创作") + "</h3>";
  if (isKb) {
    const kb = kbItems.find((x) => x.id === i.kbItemId);
    h += '<div class="hint">来源：知识库「' + mEsc(kb?.title ?? i.kbItemId) + "」" +
      '<br/>正文来自知识库，这里只能改标题/摘要等覆盖项</div>';
  }
  h += "</div>";

  if (isFaq) {
    h += '<div><label>问题（应是问句，以？结尾）</label>' +
      '<input id="me-item-question" value="' + mEsc(i.question ?? "") + '" /></div>';
    h += '<div><label>答案</label><textarea id="me-item-answer" rows="3">' +
      mEsc(i.answer ?? "") + "</textarea></div>";
  } else {
    h += '<div><label>标题</label><input id="me-item-title" value="' + mEsc(i.title ?? "") + '" /></div>';
    h += '<div><label>摘要</label><textarea id="me-item-summary" rows="2">' +
      mEsc(i.summary ?? "") + "</textarea></div>";
  }

  // 图片 —— 从媒体库选，或直接填外链
  //
  // 媒体库优先：图片收进站点自己的 public/media/，
  // 换 CDN 不用逐条改，外链挂了也不会空图。
  h += '<div><label>图片</label>' +
    '<div id="me-item-image-pick"></div>' +
    '<input id="me-item-image" value="' + mEsc(i.image ?? "") + '" placeholder="/media/xxx.png 或外链 URL" />' +
    "</div>";

  if (isHero) {
    h += '<div class="hint">英雄区的标题就是 H1 —— 缺了 AI 没有可摘的定位句</div>';
  }

  if (isStats) {
    h += '<div class="row3">' +
      '<div><label>数值</label><input id="me-item-value" value="' + mEsc(i.value ?? "") + '" /></div>' +
      '<div><label>单位</label><input id="me-item-unit" value="' + mEsc(i.unit ?? "") + '" /></div>' +
      '<div><label>标签</label><input id="me-item-label" value="' + mEsc(i.label ?? "") + '" /></div>' +
      "</div>";
  }

  if (isCta) {
    h += '<div><label>跳转链接</label><input id="me-item-href" value="' + mEsc(i.href ?? "") + '" /></div>';
  }

  if (m?.type === "card-grid" && kind === "cases") {
    h += '<div><label>客户名</label><input id="me-item-client" value="' + mEsc(i.client ?? "") + '" /></div>';
    h += '<div><label>量化结果（一行一条）</label>' +
      '<textarea id="me-item-results" rows="3">' + mEsc((i.results ?? []).join("\\n")) + "</textarea>" +
      '<div class="hint">AI 最爱引用数字 —— 缺了会被校验拦住</div></div>';
  }

  if (m?.type === "card-grid" && kind === "products") {
    const specs = (i.specs ?? []).map((s) => s.name + "=" + s.value + (s.unit ? s.unit : "")).join("\\n");
    h += '<div><label>规格表（一行一条：名称=值）</label>' +
      '<textarea id="me-item-specs" rows="3">' + mEsc(specs) + "</textarea></div>";
  }

  // 信任背书 / Logo 墙 —— 图片语义靠 alt，缺了读屏与 AI 都拿不到信息
  if (m?.type === "trust" || m?.type === "logo-wall") {
    h += '<div><label>图片替代文本（alt）</label>' +
      '<input id="me-item-alt" value="' + mEsc(i.alt ?? "") + '" placeholder="一句话说明这张图是什么" />' +
      '<div class="hint">必填 —— 无障碍与 AI 识图都靠它</div></div>';
  }
  if (m?.type === "logo-wall") {
    h += '<div><label>客户名</label><input id="me-item-client" value="' + mEsc(i.client ?? "") + '" /></div>';
  }
  if (m?.type === "trust") {
    h += '<div><label>图注</label>' +
      '<input id="me-item-caption" value="' + mEsc(i.caption ?? "") + '" placeholder="如：ISO 27001 认证（2024）" /></div>';
  }
  if (m?.type === "process") {
    h += '<div><label>步骤序号</label>' +
      '<input id="me-item-step" type="number" value="' + (i.step ?? 0) + '" /></div>' +
      '<div class="hint">序号从 1 开始 —— 乱了流程就讲不通</div>';
  }
  if (m?.type === "form") {
    h += '<div class="hint">表单模块的条目写「提交之后会发生什么」—— 例如：我们会在 1 个工作日内联系您</div>';
  }

  if (!isKb) {
    h += '<div><label>正文（富文本）</label><div id="me-item-body"></div>' +
      '<div class="hint">块类型可在工具条切换；存储是 ProseMirror JSON，AI 能精确引用到段落</div></div>';
  }

  h += '<div class="row2">' +
    '<div><label>排序</label><input id="me-item-order" type="number" value="' + i.order + '" /></div>' +
    '<div><label>状态</label><select id="me-item-published">' +
    '<option value="1"' + (i.published ? " selected" : "") + ">发布</option>" +
    '<option value="0"' + (!i.published ? " selected" : "") + ">草稿</option>" +
    "</select></div></div>" +
    '<div><label>定时发布</label>' +
    '<input id="me-item-publish-at" type="datetime-local" value="' +
    mEsc((i.publishAt ?? "").slice(0, 16)) + '" />' +
    '<div class="hint">留空 = 立即发布；到点自动生效（每次发布时判断，不需要后台定时任务）</div></div>' +
    '<div class="actions">' +
    '<button id="me-item-sticky">' + (i.sticky ? "取消置顶" : "置顶") + "</button>" +
    "</div>" +
    '<div><label>审核状态</label>' +
    '<div class="review-row">' +
      '<span class="review-state' + (i.review ? " " + i.review : "") + '">' +
        (i.review ? (REVIEW_LABEL[i.review] ?? i.review) : "未提交审核") +
      "</span>" +
      '<button id="me-review-pending"' + (hasPerm("content.edit") ? "" : " disabled") + ">提交审核</button>" +
      '<button id="me-review-approved"' + (hasPerm("content.review") ? "" : " disabled") + ">通过</button>" +
      '<button id="me-review-rejected"' + (hasPerm("content.review") ? "" : " disabled") + ">驳回</button>" +
    "</div>" +
    '<div class="hint">只有「已通过」的内容能发布；提交审核是编辑自己的动作，通过与驳回要审核权限</div></div>';

  h += '<div class="actions">' +
    '<button id="me-item-save" class="primary">应用到条目</button>' +
    '<button id="me-item-del">删除条目</button>' +
    "</div></div>";

  return h;
}

// ── 富文本编辑器挂载 ────────────────────────────────────
function mountEditor(item) {
  const host = document.getElementById("me-item-body");
  if (!host || !item || item.source === "kb") return;
  host.innerHTML = window.__rteHtml(item.body);
  const root = host.querySelector(".rte");
  // write 负责把内容填进各块（__rteHtml 只出骨架）
  if (root) window.__rte.write(root, item.body);
}

// ── 图片选择器（从媒体库挑）──────────────────────────────
function renderImagePicker(item) {
  const host = document.getElementById("me-item-image-pick");
  if (!host) return;
  const assets = (typeof window !== "undefined" && window.mediaAssets) || [];

  if (!assets.length) {
    host.innerHTML =
      '<div class="hint">媒体库还没有图片 —— 切到「媒体」标签页上传' +
      '（也可以直接在上面填外链 URL）</div>';
    return;
  }

  host.innerHTML =
    '<div class="hint" style="margin-bottom:4px">从媒体库选：</div>' +
    '<select id="me-item-image-select" style="width:100%;margin-bottom:5px">' +
    '<option value="">（不选）</option>' +
    assets.map((a) =>
      '<option value="' + mEsc(a.url) + '"' +
      (item.image === a.url ? " selected" : "") + ">" +
      mEsc(a.filename) + (a.alt ? " — " + mEsc(a.alt).slice(0, 20) : "") +
      "</option>").join("") +
    "</select>" +
    (item.image
      ? '<div style="margin-top:4px"><img src="' + mEsc(item.image) +
        '" alt="" style="max-height:90px;max-width:100%;border-radius:6px;' +
        'border:1px solid var(--line)" /></div>'
      : "");
}

/** 读回编辑器内容 */
function readEditorBody() {
  const host = document.getElementById("me-item-body");
  if (!host) return undefined;
  const root = host.querySelector(".rte");
  if (!root) return undefined;
  return window.__rte.read(root);
}

// ── 交互 ────────────────────────────────────────────────
function bindModulePanel() {
  const on = (id, ev, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  };

  // 页面列表
  on("modPageList", "click", (e) => {
    const t = e.target;
    const row = t.closest("[data-page]");
    if (row && !t.closest("button")) {
      curPageId = row.dataset.page;
      curModuleId = null; curItemId = null;
      renderModules();
      return;
    }
    const b = t.closest("button");
    if (!b) return;
    const p = modPlan.pages.find((x) => x.id === b.dataset.pub);
    if (p) {
      p.published = !p.published;
      renderModules();
      return;
    }
    const up = modPlan.pages.find((x) => x.id === b.dataset.pup);
    if (up) {
      const others = modPlan.pages.filter((x) => x.id !== up.id).sort((a, b2) => a.order - b2.order);
      const idx = others.findIndex((x) => x.order > up.order);
      const swap = idx >= 0 ? others[idx] : null;
      if (swap) { const a = swap.order; swap.order = up.order; up.order = a; }
      else { up.order = Math.min(...others.map((x) => x.order), 0) - 1; }
      renderModules();
      return;
    }
    const down = modPlan.pages.find((x) => x.id === b.dataset.pdown);
    if (down) {
      const others = modPlan.pages.filter((x) => x.id !== down.id).sort((a, b2) => a.order - b2.order);
      const idx = others.findIndex((x) => x.order < down.order);
      const swap = idx >= 0 ? others[idx] : null;
      if (swap) { const a = swap.order; swap.order = down.order; down.order = a; }
      else { down.order = Math.max(...others.map((x) => x.order), 0) + 1; }
      renderModules();
      return;
    }
    const del = modPlan.pages.find((x) => x.id === b.dataset.pdel);
    if (del) {
      if (!confirm("删除页面「" + (del.title || del.path) + "」？其模块与条目一起删除")) return;
      modPlan.pages = modPlan.pages.filter((x) => x.id !== del.id);
      if (curPageId === del.id) { curPageId = null; curModuleId = null; curItemId = null; }
      renderModules();
    }
  });

  on("modAddPage", "click", () => {
    const order = modPlan.pages.length ? Math.max(...modPlan.pages.map((p) => p.order)) + 1 : 0;
    const p = {
      id: mUid("pg"), path: "/page-" + (modPlan.pages.length + 1),
      title: "新页面", description: "", modules: [], order, published: false,
    };
    modPlan.pages.push(p);
    curPageId = p.id; curModuleId = null; curItemId = null;
    renderModules();
  });

  // 模块列表
  on("modModuleList", "click", async (e) => {
    const t = e.target;
    const row = t.closest("[data-module]");
    if (row && !t.closest("button")) {
      curModuleId = row.dataset.module; curItemId = null;
      renderModules();
      return;
    }
    const b = t.closest("button");
    if (!b) return;
    const page = curPage();
    if (!page) return;
    const m = page.modules.find((x) => x.id === (b.dataset.men || b.dataset.mup || b.dataset.mdown ||
      b.dataset.mdel || b.dataset.msavefrag || b.dataset.mdetach || b.dataset.mfrag));
    if (!m) return;
    if (b.dataset.msavefrag) {
      await saveModuleAsFragment(m);
      return;
    }
    if (b.dataset.mfrag) {
      await turnModuleIntoFragment(m);
      return;
    }
    if (b.dataset.mdetach) {
      detachModule(m);
      return;
    }
    if (b.dataset.men) { m.enabled = !m.enabled; renderModules(); return; }
    if (b.dataset.mup || b.dataset.mdown) {
      const dir = b.dataset.mup ? -1 : 1;
      const sorted = page.modules.slice().sort((a, b2) => a.order - b2.order);
      const idx = sorted.findIndex((x) => x.id === m.id);
      const other = dir < 0 ? sorted[idx - 1] : sorted[idx + 1];
      if (other) { const a = other.order; other.order = m.order; m.order = a; }
      renderModules();
      return;
    }
    if (b.dataset.mdel) {
      if (!confirm("删除模块「" + (m.title || m.type) + "」？其条目一起删除")) return;
      page.modules = page.modules.filter((x) => x.id !== m.id);
      if (curModuleId === m.id) { curModuleId = null; curItemId = null; }
      renderModules();
    }
  });

  on("modAddModule", "click", () => {
    const page = curPage();
    if (!page) { alert("先选一个页面"); return; }
    const order = page.modules.length ? Math.max(...page.modules.map((m) => m.order)) + 1 : 0;
    const m = {
      id: mUid("mod"), type: "rich-text", title: "新模块", subtitle: "",
      items: [], props: { kind: "generic" }, order, enabled: true,
    };
    page.modules.push(m);
    curModuleId = m.id; curItemId = null;
    renderModules();
  });

  // ── 插入片段引用 ────────────────────────────────────
  //
  // 插进来的模块**不含内容** —— 内容在片段里。
  // 片段改了，所有引用点跟着改（这才是复用的意义）。
  on("modAddFragment", "click", () => {
    const sel = document.getElementById("modFragSel");
    const fid = sel?.value;
    if (!fid) { toast("先选一个片段", true); return; }
    insertFragmentModule(fid);
  });

  /** 把一个片段作为引用插到当前页面末尾 */
  function insertFragmentModule(fid) {
    const page = curPage();
    if (!page) { toast("先选一个页面", true); return; }
    const frag = fragById(fid);
    if (!frag) { toast("片段不存在", true); return; }
    const order = page.modules.length ? Math.max(...page.modules.map((m) => m.order)) + 1 : 0;
    const m = {
      id: mUid("mod"), type: frag.type, items: [], order, enabled: true,
      fragmentId: fid,
    };
    page.modules.push(m);
    curModuleId = m.id; curItemId = null;
    renderModules();
    toast("已插入片段「" + frag.name + "」—— 内容跟着片段走");
  }

  /**
   * 把模块存为片段。
   *
   * 片段是**内容的副本** —— 模块本身不动。
   * 想改成引用的话用「转引用」（下面另一个入口）。
   */
  async function saveModuleAsFragment(m) {
    const rm = resolvedModule(m);
    const name = prompt("片段名：", rm.title || MOD_TYPE_LABEL[rm.type] || "未命名片段");
    if (name === null) return;
    const desc = prompt("这个片段用在哪？（可留空）", "") ?? "";
    const r = await fetch(
      "/api/sites/" + encodeURIComponent(siteId) + "/fragments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: desc.trim(),
          module: {
            type: rm.type, title: rm.title, subtitle: rm.subtitle,
            items: rm.items ?? [], props: rm.props,
          },
        }),
      },
    );
    const d = await r.json();
    if (d.error) { toast(d.error, true); return; }
    await loadFragments();
    toast("已存为片段「" + d.fragment.name + "」");
  }

  /** 把模块转成片段引用 —— 内容归片段管，这里只留引用 */
  async function turnModuleIntoFragment(m) {
    const rm = resolvedModule(m);
    const name = prompt("片段名：", rm.title || MOD_TYPE_LABEL[rm.type] || "未命名片段");
    if (name === null) return;
    const r = await fetch(
      "/api/sites/" + encodeURIComponent(siteId) + "/fragments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          module: {
            type: rm.type, title: rm.title, subtitle: rm.subtitle,
            items: rm.items ?? [], props: rm.props,
          },
        }),
      },
    );
    const d = await r.json();
    if (d.error) { toast(d.error, true); return; }
    m.fragmentId = d.fragment.id;
    m.items = [];
    delete m.overrides;
    await loadFragments();
    renderModules();
    toast("已转为引用片段「" + d.fragment.name + "」");
  }

  /**
   * 脱离引用 —— 把片段内容拷成这一处自己的内容。
   *
   * 拷一份而不是共享：脱离之后这一处就该与片段无关。
   */
  function detachModule(m) {
    const frag = fragById(m.fragmentId);
    if (!frag) {
      toast("片段已不存在 —— 请删掉这个模块", true);
      return;
    }
    const rm = resolvedModule(m);
    m.items = rm.items ?? [];
    m.type = rm.type;
    m.title = rm.title;
    m.subtitle = rm.subtitle;
    m.props = rm.props;
    delete m.fragmentId;
    delete m.overrides;
    renderModules();
    toast("已脱离引用 —— 这一处的内容现在是自己的");
  }

  // 条目列表
  on("modItemList", "click", (e) => {
    const t = e.target;
    const row = t.closest("[data-item]");
    if (row && !t.closest("button")) {
      curItemId = row.dataset.item;
      renderModules();
      return;
    }
    const b = t.closest("button");
    if (!b) return;
    const mod = curModule();
    if (!mod) return;
    // 片段条目：只有「改这一处」
    if (b.dataset.iedit) {
      curItemId = b.dataset.iedit;
      renderModules();
      return;
    }
    const i = mod.items.find((x) => x.id === (b.dataset.ipub || b.dataset.iup || b.dataset.idown || b.dataset.idel));
    if (!i) return;
    if (b.dataset.ipub) { i.published = !i.published; renderModules(); return; }
    if (b.dataset.iup || b.dataset.idown) {
      const dir = b.dataset.iup ? -1 : 1;
      const sorted = mod.items.slice().sort((a, b2) => a.order - b2.order);
      const idx = sorted.findIndex((x) => x.id === i.id);
      const other = dir < 0 ? sorted[idx - 1] : sorted[idx + 1];
      if (other) { const a = other.order; other.order = i.order; i.order = a; }
      renderModules();
      return;
    }
    if (b.dataset.idel) {
      mod.items = mod.items.filter((x) => x.id !== i.id);
      if (curItemId === i.id) curItemId = null;
      renderModules();
    }
  });

  // 编辑区
  // 媒体库选择器联动：下拉选了 → 填进图片输入框
  document.getElementById("modEditor").addEventListener("change", (e) => {
    if (e.target.id !== "me-item-image-select") return;
    const input = document.getElementById("me-item-image");
    if (input) input.value = e.target.value;
    const it = curItem();
    if (it) it.image = e.target.value || undefined;
    renderImagePicker(it);
  });

  document.getElementById("modEditor").addEventListener("click", (e) => {
    const t = e.target;
    if (t.id === "me-page-save") {
      const p = curPage(); if (!p) return;
      p.title = document.getElementById("me-page-title").value;
      p.path = document.getElementById("me-page-path").value;
      p.description = document.getElementById("me-page-desc").value;
      const parent = document.getElementById("me-page-parent");
      if (parent) p.parentId = parent.value || undefined;
      const inNav = document.getElementById("me-page-in-nav");
      if (inNav) p.inNav = inNav.value === "1";
      const at = document.getElementById("me-page-publish-at");
      if (at) p.publishAt = at.value ? new Date(at.value).toISOString() : undefined;
      renderModules();
      return;
    }
    if (t.id === "me-page-sticky") {
      const p = curPage(); if (!p) return;
      p.sticky = !p.sticky;
      renderModules();
      return;
    }
    if (t.id === "me-mod-save") {
      const m = curModule(); if (!m) return;
      const titleVal = document.getElementById("me-mod-title").value;
      const subVal = document.getElementById("me-mod-sub").value;
      if (m.fragmentId) {
        // 引用片段的模块 —— 改的是**这一处的覆盖**，不是片段本体
        m.overrides = m.overrides ?? {};
        if (titleVal.trim()) m.overrides.title = titleVal; else delete m.overrides.title;
        if (subVal.trim()) m.overrides.subtitle = subVal; else delete m.overrides.subtitle;
        m.title = undefined;
        m.subtitle = undefined;
      } else {
        m.title = titleVal;
        m.subtitle = subVal;
        m.type = document.getElementById("me-mod-type").value;
        m.props = { ...(m.props ?? {}), kind: document.getElementById("me-mod-kind").value };
        // 表单字段（一行一个：名称,标签,类型,必填/选填,选项|分隔,占位提示）
        const fieldsInput = document.getElementById("me-mod-fields");
        if (fieldsInput) {
          const fields = fieldsInput.value.split("\\n")
            .map((line) => line.trim()).filter(Boolean)
            .map((line) => {
              const p = line.split(",").map((x) => x.trim());
              const opts = (p[4] ?? "").split("|").map((x) => x.trim()).filter(Boolean);
              const f = {
                name: p[0] ?? "",
                label: p[1] ?? "",
                type: p[2] || "text",
                required: (p[3] ?? "") === "必填",
                placeholder: p[5] ?? "",
              };
              if (opts.length) f.options = opts;
              return f;
            })
            .filter((f) => f.name);
          m.props.fields = fields;
        }
      }
      m.order = Number(document.getElementById("me-mod-order").value) || 0;
      m.enabled = document.getElementById("me-mod-enabled").value === "1";
      renderModules();
      return;
    }
    if (t.id === "me-mod-detach") {
      const m = curModule(); if (!m) return;
      detachModule(m);
      return;
    }
    if (t.id === "me-mod-openfrag") {
      const m = curModule(); if (!m?.fragmentId) return;
      const frag = fragById(m.fragmentId);
      toast(frag ? "片段「" + frag.name + "」在「片段」标签页里" : "片段不存在", !frag);
      return;
    }
    if (t.id === "me-item-save") {
      const i = curItem(); if (!i) return;
      const mod = curModule();
      if (mod?.fragmentId) {
        // 片段条目 —— 保存成**局部覆盖**
        const frag = fragById(mod.fragmentId);
        const isFaq = frag?.type === "faq";
        const patch = { itemId: i.id };
        if (isFaq) {
          patch.question = document.getElementById("me-item-question").value;
          patch.answer = document.getElementById("me-item-answer").value;
        } else {
          patch.title = document.getElementById("me-item-title").value;
          patch.summary = document.getElementById("me-item-summary").value;
        }
        const ovs = (mod.overrides?.items ?? []).slice();
        const idx = ovs.findIndex((x) => x.itemId === i.id);
        if (idx >= 0) ovs[idx] = { ...ovs[idx], ...patch };
        else ovs.push(patch);
        mod.overrides = { ...(mod.overrides ?? {}), items: ovs };
        renderModules();
        toast("已保存覆盖 —— 片段本体没动");
        return;
      }
      if (mod?.type === "faq") {
        i.question = document.getElementById("me-item-question").value;
        i.answer = document.getElementById("me-item-answer").value;
        i.title = i.question;
      } else {
        i.title = document.getElementById("me-item-title").value;
        i.summary = document.getElementById("me-item-summary").value;
      }
      if (document.getElementById("me-item-value")) i.value = document.getElementById("me-item-value").value;
      if (document.getElementById("me-item-unit")) i.unit = document.getElementById("me-item-unit").value;
      if (document.getElementById("me-item-label")) i.label = document.getElementById("me-item-label").value;
      if (document.getElementById("me-item-href")) i.href = document.getElementById("me-item-href").value;
      if (document.getElementById("me-item-client")) i.client = document.getElementById("me-item-client").value;
      if (document.getElementById("me-item-alt")) i.alt = document.getElementById("me-item-alt").value;
      if (document.getElementById("me-item-caption")) i.caption = document.getElementById("me-item-caption").value;
      if (document.getElementById("me-item-step")) i.step = Number(document.getElementById("me-item-step").value) || 0;
      if (document.getElementById("me-item-results")) {
        i.results = document.getElementById("me-item-results").value.split("\\n").map((x) => x.trim()).filter(Boolean);
      }
      if (document.getElementById("me-item-specs")) {
        const specs = document.getElementById("me-item-specs").value.split("\\n")
          .map((line) => line.trim()).filter(Boolean)
          .map((line) => {
            const eq = line.indexOf("=");
            if (eq < 0) return { name: line, value: "" };
            return { name: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() };
          });
        i.specs = specs;
      }
      const body = readEditorBody();
      if (body) i.body = body;
      const imgInput = document.getElementById("me-item-image");
      if (imgInput) i.image = imgInput.value.trim() || undefined;
      i.order = Number(document.getElementById("me-item-order").value) || 0;
      i.published = document.getElementById("me-item-published").value === "1";
      const at = document.getElementById("me-item-publish-at");
      if (at) i.publishAt = at.value ? new Date(at.value).toISOString() : undefined;
      renderModules();
      return;
    }
    if (t.id === "me-item-reset") {
      // 恢复片段内容 —— 删掉这一处的覆盖
      const mod = curModule();
      const i = curItem();
      if (!mod?.fragmentId || !i) return;
      const ovs = (mod.overrides?.items ?? []).filter((x) => x.itemId !== i.id);
      mod.overrides = { ...(mod.overrides ?? {}), items: ovs };
      renderModules();
      toast("已恢复片段内容");
      return;
    }
    if (t.id === "me-review-pending" || t.id === "me-review-approved" || t.id === "me-review-rejected") {
      const i = curItem(); const mod = curModule(); const page = curPage();
      if (!i || !mod || !page) return;
      const decision = t.id === "me-review-pending" ? "pending"
        : t.id === "me-review-approved" ? "approved" : "rejected";
      const r = await fetch(
        "/api/sites/" + encodeURIComponent(siteId) + "/modules/review",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageId: page.id, moduleId: mod.id, itemId: i.id, decision,
          }),
        },
      );
      const d = await r.json();
      if (d.error) { toast(d.error, true); return; }
      i.review = decision;
      renderModules();
      toast(decision === "pending" ? "已提交审核" :
            decision === "approved" ? "已通过" : "已驳回");
      return;
    }
    if (t.id === "me-item-sticky") {
      const i = curItem(); if (!i) return;
      i.sticky = !i.sticky;
      renderModules();
      return;
    }
    if (t.id === "me-item-del") {
      const mod = curModule();
      const i = curItem();
      if (!mod || !i) return;
      mod.items = mod.items.filter((x) => x.id !== i.id);
      curItemId = null;
      renderModules();
    }
  });

  // 外观设置
  const look = document.getElementById("modLook");
  if (look) {
    look.addEventListener("click", (e) => {
      const b = e.target.closest("[data-look]");
      if (!b) return;
      const field = b.dataset.look;
      const val = b.dataset.lookval;
      if (!modPlan) return;
      modPlan.appearance = modPlan.appearance ?? {};
      if (modPlan.appearance[field] === val) delete modPlan.appearance[field];
      else modPlan.appearance[field] = val;
      renderLook();
    });
    look.addEventListener("change", (e) => {
      if (e.target.id !== "lookPrimary") return;
      if (!modPlan) return;
      modPlan.appearance = modPlan.appearance ?? {};
      const v = e.target.value.trim();
      if (v) modPlan.appearance.primaryColor = v;
      else delete modPlan.appearance.primaryColor;
    });
  }

  // 保存
  on("modSave", "click", async () => {
    if (!siteId) return;
    const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/modules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(modPlan),
    });
    const d = await r.json();
    if (d.error) { toast(d.error, true); return; }
    modStats = d.stats;
    toast("编排已保存 → modules.json");
  });

  // 发布按钮按权限禁用 —— 没有发布权限的人点了只会被服务端 403 挡回来，
  // 不如一开始就是灰的并说明原因。
  const pubBtn = $("modPublish");
  if (pubBtn && !hasPerm("content.publish")) {
    pubBtn.disabled = true;
    pubBtn.title = "你的角色没有发布权限";
  }

  // ── 发布并重建 ─────────────────────────────────────
  //
  // 「发布」= 物化（写 modules.generated.ts）+ 重建（next build 出 HTML）。
  // 只物化不重建的话，访客看到的还是旧内容 —— 静态站伺服的是构建产物。
  on("modPublish", "click", async () => {
    if (!siteId) return;
    const btn = $("modPublish");
    btn.disabled = true;
    btn.textContent = "发布中…";
    try {
      const r = await fetch(
        "/api/sites/" + encodeURIComponent(siteId) + "/modules/publish",
        { method: "POST" },
      );
      const d = await r.json();
      if (d.error) {
        toast(d.error, true);
        if (d.problems) showPublishProblems(d.problems);
        return;
      }
      modStats = d.stats;

      const rb = d.rebuild;
      if (!rb) {
        toast("已发布（未重建）—— 站点内容未更新");
      } else if (rb.ok) {
        toast("已发布并重建 —— " + (rb.pages ?? "?") + " 个页面，用时 " +
              Math.round(rb.ms / 1000) + " 秒");
      } else {
        toast("编排已发布，但站点重建失败 —— " + (rb.reason ?? "未知原因"), true);
        showRebuildOutput(rb);
      }
    } catch (e) {
      toast("发布失败：" + (e instanceof Error ? e.message : String(e)), true);
    } finally {
      btn.disabled = false;
      btn.textContent = "发布并重建";
    }
  });

  /** 展示校验问题 */
  function showPublishProblems(problems) {
    const pane = $("modEditor");
    if (!pane) return;
    pane.innerHTML =
      '<div class="mgroup"><h3>发布被拦下</h3>' +
      problems.map((p) =>
        '<div class="problem' + (p.level === "warn" ? " warn" : "") + '">' +
        "<b>" + (p.itemTitle || p.moduleTitle || "") + "</b> —— " + p.message +
        "</div>").join("") +
      "</div>";
  }

  /** 展示构建输出 */
  function showRebuildOutput(rb) {
    const pane = $("modEditor");
    if (!pane) return;
    pane.innerHTML =
      '<div class="mgroup"><h3>构建失败</h3>' +
      '<div class="problem">' + (rb.reason ?? "") + "</div>" +
      '<pre style="font-size:11px;white-space:pre-wrap;color:var(--dim);' +
      'max-height:320px;overflow:auto">' +
      String(rb.output ?? "").slice(-3000) + "</pre></div>";
  }

  // 知识库条目「加入模块」：知识库列表的按钮事件在 ui.ts 里，
  // 那里检测到当前在模块视图时调这个函数
  window.__modAddKbItem = function (kbId) {
    const mod = curModule();
    if (!mod) { toast("先选一个模块", true); return; }
    const order = mod.items.length ? Math.max(...mod.items.map((i) => i.order)) + 1 : 0;
    mod.items.push({
      id: mUid("it"), source: "kb", kbItemId: kbId,
      order, published: false,
    });
    renderModules();
    toast("已加入模块 —— 在右栏定稿");
  };

  // 片段面板的「插入到当前页」委托到这里 ——
  // 编排树只有这边有，片段面板拿不到。
  window.__modInsertFragment = function (fragmentId) {
    insertFragmentModule(fragmentId);
  };

  // 脱离引用（片段面板也能触发）
  window.__modDetachFragment = function (moduleId) {
    const page = curPage();
    const m = page?.modules.find((x) => x.id === moduleId);
    if (!m) { toast("先选中那个模块", true); return; }
    detachModule(m);
  };

  // 手工新建条目
  window.__modAddManualItem = function () {    const mod = curModule();
    if (!mod) { toast("先选一个模块", true); return; }
    const order = mod.items.length ? Math.max(...mod.items.map((i) => i.order)) + 1 : 0;
    const it = {
      id: mUid("it"), source: "manual",
      title: "", summary: "", order, published: false,
      body: { type: "doc", content: [{ type: "paragraph", content: [] }] },
    };
    mod.items.push(it);
    curItemId = it.id;
    renderModules();
  };

  // 手工新建条目（按钮）
  on("modAddManual", "click", () => window.__modAddManualItem());

  // 初始化
  loadModules();
}
</script>
`;

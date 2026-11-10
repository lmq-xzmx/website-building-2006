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
      <button id="modSave" class="primary">保存编排</button>
    </div>
    <div class="pane-body" id="modEditor"></div>
  </aside>
</section>
`;

/** 面板的样式 */
export const MODULE_PANEL_CSS = `
.module-pane {
  flex: 1; display: grid;
  grid-template-columns: 220px 260px 300px 1fr;
  min-height: 0; overflow: hidden;
}
.module-pane[hidden] { display: none; }
.module-pane > aside {
  border-right: 1px solid var(--line);
  display: flex; flex-direction: column; min-height: 0; min-width: 0;
}
.module-pane > aside:last-child { border-right: none; }
.mod-pages .pane-body, .mod-modules .pane-body,
.mod-items .pane-body, .mod-edit .pane-body {
  overflow-y: auto; padding: 8px; flex: 1;
}
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

const MOD_TYPE_LABEL = {
  "rich-text": "富文本正文",
  "card-grid": "卡片网格",
  "faq": "问答",
  "stats": "数据条",
  "hero": "英雄区",
  "cta": "行动号召",
  "gallery": "图片",
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
function curModule() {
  const p = curPage();
  return (p?.modules ?? []).find((m) => m.id === curModuleId) ?? null;
}
function curItem() {
  const m = curModule();
  return (m?.items ?? []).find((i) => i.id === curItemId) ?? null;
}

async function loadModules() {
  if (!siteId) return;
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/modules");
  const d = await r.json();
  modPlan = d.plan ?? { version: 1, siteId, kbId: "default", updatedAt: "", pages: [] };
  modStats = d.stats ?? null;
  if (!curPageId || !modPlan.pages.some((p) => p.id === curPageId)) {
    curPageId = modPlan.pages[0]?.id ?? null;
    curModuleId = null;
    curItemId = null;
  }
  renderModules();
}

function renderModules() {
  renderPageList();
  renderModuleList();
  renderItemList();
  renderModuleEditor();
  // 富文本编辑器要在 DOM 建好之后再挂
  mountEditor(curItem());
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
    return '<div class="mrow' + (p.id === curPageId ? " sel" : "") + '" data-page="' + mEsc(p.id) + '">' +
      '<div class="t">' + mEsc(p.title || p.path) + "</div>" +
      '<div class="m">' +
      (p.published ? '<span class="pill ok">发布</span>' : '<span class="pill warn">草稿</span>') +
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
    const pub = (m.items ?? []).filter((i) => i.published).length;
    return '<div class="mrow' + (m.id === curModuleId ? " sel" : "") + '" data-module="' + mEsc(m.id) + '">' +
      '<div class="t">' + mEsc(m.title || MOD_TYPE_LABEL[m.type] || m.type) + "</div>" +
      '<div class="m">' +
      '<span class="pill">' + mEsc(MOD_TYPE_LABEL[m.type] || m.type) + "</span>" +
      (m.enabled ? "" : '<span class="pill warn">已停用</span>') +
      '<span class="pill">' + pub + "/" + (m.items ?? []).length + " 条</span>" +
      "</div>" +
      '<div class="m" style="margin-top:5px">' +
      '<button data-men="' + mEsc(m.id) + '">' + (m.enabled ? "停用" : "启用") + "</button>" +
      '<button data-mup="' + mEsc(m.id) + '">↑</button>' +
      '<button data-mdown="' + mEsc(m.id) + '">↓</button>' +
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
  const items = (m.items ?? []).slice().sort((a, b) => a.order - b.order);
  if (cnt) cnt.textContent = items.filter((i) => i.published).length + " 已发布 / " + items.length + " 条";

  const kind = String(m.props?.kind ?? "");
  el.innerHTML =
    '<div class="mgroup"><h3>从知识库添加</h3>' +
    '<div class="hint">点知识库条目右侧的「加入模块」按钮</div></div>' +
    (items.length
      ? items.map((i) => {
          const kb = i.source === "kb" ? kbItems.find((x) => x.id === i.kbItemId) : null;
          const title = i.title || i.question || kb?.title || i.id;
          return '<div class="mrow' + (i.id === curItemId ? " sel" : "") + '" data-item="' + mEsc(i.id) + '">' +
            '<div class="t">' + mEsc(title) + "</div>" +
            '<div class="m">' +
            (i.source === "kb"
              ? '<span class="pill ok">知识库</span>'
              : '<span class="pill">手工</span>') +
            (i.published ? '<span class="pill ok">发布</span>' : '<span class="pill warn">草稿</span>') +
            '<span class="pill">序 ' + i.order + "</span>" +
            "</div>" +
            '<div class="m" style="margin-top:5px">' +
            '<button data-ipub="' + mEsc(i.id) + '">' + (i.published ? "转草稿" : "定稿") + "</button>" +
            '<button data-iup="' + mEsc(i.id) + '">↑</button>' +
            '<button data-idown="' + mEsc(i.id) + '">↓</button>' +
            '<button data-idel="' + mEsc(i.id) + '">删</button>' +
            "</div></div>";
        }).join("")
      : '<div class="empty">这个模块还没有条目</div>');
}

/** 右栏编辑区 */
function renderModuleEditor() {
  const el = document.getElementById("modEditor");
  const item = curItem();
  const page = curPage();
  const mod = curModule();

  if (item) { el.innerHTML = itemEditorHtml(item, mod); return; }
  if (mod) { el.innerHTML = moduleEditorHtml(mod, page); return; }
  if (page) { el.innerHTML = pageEditorHtml(page); return; }
  el.innerHTML = '<div class="empty">左边选一个页面 / 模块 / 条目</div>';
}

function pageEditorHtml(p) {
  return '<div class="mform">' +
    '<div><label>页面标题</label><input id="me-page-title" value="' + mEsc(p.title) + '" /></div>' +
    '<div><label>路由路径</label><input id="me-page-path" value="' + mEsc(p.path) + '" placeholder="/about" />' +
    '<div class="hint">相对站点根；发布后成为真实路由</div></div>' +
    '<div><label>页面描述（每页必须有自己的一份）</label>' +
    '<textarea id="me-page-desc" rows="3">' + mEsc(p.description ?? "") + "</textarea></div>" +
    '<div class="actions">' +
    '<button id="me-page-save" class="primary">应用到页面</button>' +
    "</div></div>";
}

function moduleEditorHtml(m, page) {
  const kind = String(m.props?.kind ?? "");
  return '<div class="mform">' +
    '<div><label>模块标题</label><input id="me-mod-title" value="' + mEsc(m.title ?? "") + '" /></div>' +
    '<div><label>副标题</label><input id="me-mod-sub" value="' + mEsc(m.subtitle ?? "") + '" /></div>' +
    '<div class="row2">' +
    '<div><label>模块类型</label><select id="me-mod-type">' +
    Object.entries(MOD_TYPE_LABEL).map(([k, v]) =>
      '<option value="' + k + '"' + (m.type === k ? " selected" : "") + ">" + v + "</option>").join("") +
    "</select></div>" +
    '<div><label>卡片类型（card-grid 用）</label><select id="me-mod-kind">' +
    Object.entries(CARD_KIND_LABEL).map(([k, v]) =>
      '<option value="' + k + '"' + (kind === k ? " selected" : "") + ">" + v + "</option>").join("") +
    "</select></div></div>" +
    '<div class="row2">' +
    '<div><label>排序</label><input id="me-mod-order" type="number" value="' + m.order + '" /></div>' +
    '<div><label>状态</label><select id="me-mod-enabled">' +
    '<option value="1"' + (m.enabled ? " selected" : "") + ">启用</option>" +
    '<option value="0"' + (!m.enabled ? " selected" : "") + ">停用</option>" +
    "</select></div></div>" +
    '<div class="actions"><button id="me-mod-save" class="primary">应用到模块</button></div>' +
    "</div>";
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

  if (!isKb) {
    h += '<div><label>正文（富文本）</label><div id="me-item-body"></div>' +
      '<div class="hint">块类型可在工具条切换；存储是 ProseMirror JSON，AI 能精确引用到段落</div></div>';
  }

  h += '<div class="row2">' +
    '<div><label>排序</label><input id="me-item-order" type="number" value="' + i.order + '" /></div>' +
    '<div><label>状态</label><select id="me-item-published">' +
    '<option value="1"' + (i.published ? " selected" : "") + ">发布</option>" +
    '<option value="0"' + (!i.published ? " selected" : "") + ">草稿</option>" +
    "</select></div></div>";

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
  on("modModuleList", "click", (e) => {
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
    const m = page.modules.find((x) => x.id === (b.dataset.men || b.dataset.mup || b.dataset.mdown || b.dataset.mdel));
    if (!m) return;
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
  document.getElementById("modEditor").addEventListener("click", (e) => {
    const t = e.target;
    if (t.id === "me-page-save") {
      const p = curPage(); if (!p) return;
      p.title = document.getElementById("me-page-title").value;
      p.path = document.getElementById("me-page-path").value;
      p.description = document.getElementById("me-page-desc").value;
      renderModules();
      return;
    }
    if (t.id === "me-mod-save") {
      const m = curModule(); if (!m) return;
      m.title = document.getElementById("me-mod-title").value;
      m.subtitle = document.getElementById("me-mod-sub").value;
      m.type = document.getElementById("me-mod-type").value;
      m.props = { ...(m.props ?? {}), kind: document.getElementById("me-mod-kind").value };
      m.order = Number(document.getElementById("me-mod-order").value) || 0;
      m.enabled = document.getElementById("me-mod-enabled").value === "1";
      renderModules();
      return;
    }
    if (t.id === "me-item-save") {
      const i = curItem(); if (!i) return;
      const mod = curModule();
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
      i.order = Number(document.getElementById("me-item-order").value) || 0;
      i.published = document.getElementById("me-item-published").value === "1";
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

  // 手工新建条目
  window.__modAddManualItem = function () {
    const mod = curModule();
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

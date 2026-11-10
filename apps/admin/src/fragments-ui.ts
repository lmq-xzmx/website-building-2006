/**
 * 片段面板 —— 可复用片段（组件）的管理界面。
 *
 * 为什么要有这个面板：
 *   「公司简介」「联系方式」「常见问题」这类内容在企业门户里反复出现。
 *   复制粘贴的代价是：客户改一次电话要改三处，漏一处线上就自相矛盾。
 *   片段把同一段内容收成一份，页面上的模块变成**引用**。
 *
 * 面板能力：
 *   - 列出片段（名字、类型、条目数、更新时间）
 *   - 看片段内容（条目逐条列出）
 *   - 改名 / 改说明
 *   - 插入到当前页面（引用形式）
 *   - 删除（被引用着会拦下来并说明谁在用）
 *
 * 「从现有模块存为片段」在模块面板里 —— 片段总是从真实内容来的，
 * 不该让人凭空手写一个空片段。
 */

export const FRAGMENTS_PANEL_HTML = `
<section id="fragmentsPane" class="fragments-pane" hidden>
  <aside class="frag-list">
    <div class="pane-head">
      <h2>片段</h2><span class="sp"></span>
      <button id="fragReload">刷新</button>
    </div>
    <div class="pane-body" id="fragList"></div>
  </aside>

  <aside class="frag-detail">
    <div class="pane-head"><h2>片段内容</h2></div>
    <div class="pane-body" id="fragDetail"></div>
  </aside>
</section>
`;

export const FRAGMENTS_PANEL_CSS = `
.fragments-pane {
  flex: 1; display: grid; grid-template-columns: 280px 1fr;
  min-height: 0; overflow: hidden;
}
.fragments-pane[hidden] { display: none; }
.fragments-pane > aside {
  border-right: 1px solid var(--line);
  display: flex; flex-direction: column; min-height: 0; min-width: 0;
}
.fragments-pane > aside:last-child { border-right: none; }
.frag-list .pane-body, .frag-detail .pane-body {
  overflow-y: auto; padding: 10px; flex: 1;
}
.frow {
  border: 1px solid var(--line); border-radius: var(--radius);
  padding: 8px 10px; margin-bottom: 8px; background: var(--panel);
  cursor: pointer;
}
.frow:hover { border-color: #39414f; }
.frow.sel { border-color: var(--accent); background: var(--panel-2); }
.frow .t { font-size: 13px; font-weight: 500; margin-bottom: 3px; }
.frow .m { color: var(--dim); font-size: 11px; display: flex; gap: 6px;
  align-items: center; flex-wrap: wrap; }
.frow .m button { padding: 1px 6px; font-size: 11px; }
`;

export const FRAGMENTS_PANEL_SCRIPT = `
<script>
// ── 片段状态 ────────────────────────────────────────────
let fragLib = { fragments: [] };
let fragProblems = [];
let curFragId = null;

function fgEsc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * 读片段库。
 *
 * 结果挂到 window.geoFragments —— 模块面板也要用
 * （显示「引用片段」、脱离引用、存为片段）。
 * 用 window 而不是共享变量：脚本块里的 let 是块级作用域，
 * 跨脚本块看不见。
 */
async function loadFragments() {
  if (!siteId) return;
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/fragments");
  const d = await r.json();
  if (d.error) { toast(d.error, true); return; }
  fragLib = { fragments: d.fragments ?? [] };
  fragProblems = d.problems ?? [];
  window.geoFragments = fragLib.fragments;
  renderFragments();
}

function fragById(id) {
  return (fragLib.fragments ?? []).find((f) => f.id === id) ?? null;
}

function renderFragments() {
  renderFragList();
  renderFragDetail();
}

function renderFragList() {
  const el = document.getElementById("fragList");
  if (!el) return;
  const list = fragLib.fragments ?? [];
  if (!list.length) {
    el.innerHTML = '<div class="empty">还没有片段<br/>' +
      "在「模块」标签页选中一个模块，点「存为片段」</div>";
    return;
  }
  el.innerHTML = list.map((f) => {
    const bad = fragProblems.filter((p) => p.fragmentId === f.id && p.level === "error");
    return '<div class="frow' + (f.id === curFragId ? " sel" : "") + '" data-frag="' + fgEsc(f.id) + '">' +
      '<div class="t">' + fgEsc(f.name) + "</div>" +
      '<div class="m">' +
      '<span class="pill">' + fgEsc(f.type) + "</span>" +
      '<span class="pill">' + (f.items ?? []).length + " 条</span>" +
      (bad.length ? '<span class="pill err">' + bad.length + " 个问题</span>" : "") +
      "</div>" +
      (f.description ? '<div class="hint">' + fgEsc(f.description) + "</div>" : "") +
      '<div class="m" style="margin-top:5px">' +
      '<button data-finsert="' + fgEsc(f.id) + '">插入当前页</button>' +
      '<button data-frename="' + fgEsc(f.id) + '">改名</button>' +
      '<button data-fdel="' + fgEsc(f.id) + '">删</button>' +
      "</div></div>";
  }).join("");
}

function renderFragDetail() {
  const el = document.getElementById("fragDetail");
  if (!el) return;
  const f = curFragId ? fragById(curFragId) : null;
  if (!f) {
    el.innerHTML = '<div class="empty">左边选一个片段</div>';
    return;
  }
  const problems = fragProblems.filter((p) => p.fragmentId === f.id);
  let h = '<div class="mform">' +
    '<div><label>片段名</label><input id="fg-name" value="' + fgEsc(f.name) + '" /></div>' +
    '<div><label>说明</label><textarea id="fg-desc" rows="2">' +
      fgEsc(f.description ?? "") + "</textarea></div>" +
    '<div class="actions"><button id="fg-save" class="primary">保存</button></div>' +
    "</div>";

  h += '<div class="mgroup"><h3>内容（' + (f.items ?? []).length + " 条）</h3>";
  if (!(f.items ?? []).length) {
    h += '<div class="hint">这个片段还没有条目 —— 引用它的页面会渲染出空区块</div>';
  } else {
    for (const it of f.items) {
      const label = it.title || it.question || it.label || it.id;
      h += '<div class="mrow"><div class="t">' + fgEsc(label) + "</div>" +
        '<div class="m">' +
        '<span class="pill">' + (it.source === "kb" ? "知识库" : "手工") + "</span>" +
        (it.published ? '<span class="pill ok">发布</span>' : '<span class="pill warn">草稿</span>') +
        "</div>" +
        (it.summary ? '<div class="hint">' + fgEsc(it.summary) + "</div>" : "") +
        "</div>";
    }
  }
  h += "</div>";

  if (problems.length) {
    h += '<div class="mgroup"><h3>校验</h3>' +
      problems.map((p) =>
        '<div class="problem' + (p.level === "warn" ? " warn" : "") + '">' +
        fgEsc(p.message) + "</div>").join("") + "</div>";
  }

  el.innerHTML = h;
}

function bindFragmentsPanel() {
  const list = document.getElementById("fragList");
  if (!list) return;

  list.addEventListener("click", async (e) => {
    const t = e.target;

    const insertId = t.dataset?.finsert;
    if (insertId) {
      // 插入到「当前页」—— 委托给模块面板（那边才有编排树）
      if (typeof window.__modInsertFragment === "function") {
        window.__modInsertFragment(insertId);
      } else {
        toast("先切到「模块」标签页并选好页面", true);
      }
      return;
    }

    const renameId = t.dataset?.frename;
    if (renameId) {
      const f = fragById(renameId);
      if (!f) return;
      const name = prompt("片段的新名字：", f.name);
      if (name === null) return;
      const r = await fetch(
        "/api/sites/" + encodeURIComponent(siteId) + "/fragments/" + encodeURIComponent(renameId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() || f.name }),
        },
      );
      const d = await r.json();
      if (d.error) { toast(d.error, true); return; }
      toast("已改名");
      await loadFragments();
      return;
    }

    const delId = t.dataset?.fdel;
    if (delId) {
      const f = fragById(delId);
      if (!f) return;
      if (!confirm("删除片段「" + f.name + "」？")) return;
      const r = await fetch(
        "/api/sites/" + encodeURIComponent(siteId) + "/fragments/" + encodeURIComponent(delId),
        { method: "DELETE" },
      );
      const d = await r.json();
      if (d.error) {
        // 被引用着 —— 告诉用户谁在用
        const used = (d.used ?? []).join("；");
        toast(d.error + (used ? "（" + used + "）" : ""), true);
        return;
      }
      if (curFragId === delId) curFragId = null;
      toast("已删除");
      await loadFragments();
      return;
    }

    const row = t.closest("[data-frag]");
    if (row) {
      curFragId = row.dataset.frag;
      renderFragments();
    }
  });

  const detail = document.getElementById("fragDetail");
  if (detail) {
    detail.addEventListener("click", async (e) => {
      if (e.target.id !== "fg-save") return;
      const f = curFragId ? fragById(curFragId) : null;
      if (!f) return;
      const name = document.getElementById("fg-name").value.trim();
      const desc = document.getElementById("fg-desc").value.trim();
      const r = await fetch(
        "/api/sites/" + encodeURIComponent(siteId) + "/fragments/" + encodeURIComponent(f.id),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name || f.name, description: desc }),
        },
      );
      const d = await r.json();
      if (d.error) { toast(d.error, true); return; }
      toast("已保存");
      await loadFragments();
    });
  }
}
</script>
`;

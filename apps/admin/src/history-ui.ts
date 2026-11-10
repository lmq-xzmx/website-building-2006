/**
 * 版本面板 —— 编排的快照、对比与回滚。
 *
 * 为什么要有：
 *   发布是**覆盖写** modules.json —— 出错了只能靠 git 回滚。
 *   但 git 回滚粗得没法用：回滚的是整个仓库（把别的站点一起带走），
 *   而且回滚的是代码，不是「这一版编排长什么样」。
 *
 * 这里把编排当成有生命周期的文档：
 *   每次发布留一份快照 → 出错时点一下回到上一版 → 历史不丢。
 *
 * 面板能力：
 *   - 版本列表（版本号、时间、操作者、摘要统计）
 *   - 看某个版本的编排长什么样
 *   - 对比某个版本与当前编排（行级差异）
 *   - 一键回滚
 *
 * 注意：回滚只恢复**编排**（modules.json）——
 * 站点要真正变回去，还得再点一次「发布并重建」。
 * 这是故意的：回滚不该偷偷重建站点（重建要几十秒，且可能失败）。
 */

export const HISTORY_PANEL_HTML = `
<section id="historyPane" class="history-pane" hidden>
  <aside class="ver-list">
    <div class="pane-head">
      <h2>版本</h2><span class="sp"></span>
      <button id="verReload">刷新</button>
    </div>
    <div class="pane-body" id="verList"></div>
  </aside>

  <aside class="ver-detail">
    <div class="pane-head">
      <h2>版本详情</h2><span class="sp"></span>
      <button id="verDiff">对比当前</button>
      <button id="verRollback" class="primary">回滚到此版本</button>
    </div>
    <div class="pane-body" id="verDetail"></div>
  </aside>
</section>
`;

export const HISTORY_PANEL_CSS = `
.history-pane {
  flex: 1; display: grid; grid-template-columns: 300px 1fr;
  min-height: 0; overflow: hidden;
}
.history-pane[hidden] { display: none; }
.history-pane > aside {
  border-right: 1px solid var(--line);
  display: flex; flex-direction: column; min-height: 0; min-width: 0;
}
.history-pane > aside:last-child { border-right: none; }
.ver-list .pane-body, .ver-detail .pane-body {
  overflow-y: auto; padding: 10px; flex: 1;
}
.vrow {
  border: 1px solid var(--line); border-radius: var(--radius);
  padding: 8px 10px; margin-bottom: 8px; background: var(--panel);
  cursor: pointer;
}
.vrow:hover { border-color: #39414f; }
.vrow.sel { border-color: var(--accent); background: var(--panel-2); }
.vrow .t { font-size: 13px; font-weight: 500; margin-bottom: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.vrow .m { color: var(--dim); font-size: 11px; display: flex; gap: 6px;
  align-items: center; flex-wrap: wrap; }
.dline {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; padding: 4px 8px; border-radius: 5px;
  border-left: 3px solid var(--line); margin-bottom: 4px;
  background: var(--panel-2); word-break: break-all;
}
.dline.added { border-left-color: var(--ok); }
.dline.removed { border-left-color: var(--err); }
.dline.changed { border-left-color: var(--warn); }
`;

export const HISTORY_PANEL_SCRIPT = `
<script>
// ── 版本状态 ────────────────────────────────────────────
let verList = [];
let curVerId = null;
let curVerPlan = null;

function hvEsc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
    p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

async function loadHistory() {
  if (!siteId) return;
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/history");
  const d = await r.json();
  if (d.error) { toast(d.error, true); return; }
  verList = d.versions ?? [];
  if (curVerId && !verList.some((v) => v.id === curVerId)) curVerId = null;
  renderVersions();
}

/** 选版本 —— 拉快照 */
async function selectVersion(id) {
  curVerId = id;
  const r = await fetch(
    "/api/sites/" + encodeURIComponent(siteId) + "/history/" + encodeURIComponent(id),
  );
  const d = await r.json();
  if (d.error) { toast(d.error, true); return; }
  curVerPlan = d.plan ?? null;
  renderVersions();
  renderVerDetail();
}

function renderVersions() {
  const el = document.getElementById("verList");
  if (!el) return;
  if (!verList.length) {
    el.innerHTML = '<div class="empty">还没有版本<br/>发布一次就会留下快照</div>';
    return;
  }
  el.innerHTML = verList.map((v) =>
    '<div class="vrow' + (v.id === curVerId ? " sel" : "") + '" data-ver="' + hvEsc(v.id) + '">' +
      '<div class="t">' + hvEsc(v.id) + "</div>" +
      '<div class="m">' +
      '<span class="pill">' + hvEsc(v.author ?? "") + "</span>" +
      '<span class="pill">' + (v.stats?.pages ?? 0) + " 页 / " +
        (v.stats?.modules ?? 0) + " 模块 / " + (v.stats?.items ?? 0) + " 条</span>" +
      "</div>" +
      '<div class="hint">' + hvEsc(fmtTime(v.createdAt)) + " · " + hvEsc(v.reason ?? "") + "</div>" +
    "</div>").join("");
}

function renderVerDetail() {
  const el = document.getElementById("verDetail");
  if (!el) return;
  if (!curVerId) {
    el.innerHTML = '<div class="empty">左边选一个版本</div>';
    return;
  }
  const v = verList.find((x) => x.id === curVerId);
  if (!v) {
    el.innerHTML = '<div class="empty">左边选一个版本</div>';
    return;
  }

  let h = '<div class="row"><div class="t">' + hvEsc(v.id) + "</div>" +
    '<div class="m">' +
    '<span class="pill">' + hvEsc(v.author ?? "") + "</span>" +
    '<span class="pill">' + hvEsc(v.reason ?? "") + "</span>" +
    "</div>" +
    '<div class="hint">' + hvEsc(fmtTime(v.createdAt)) + " · " +
      (v.stats?.pages ?? 0) + " 页 / " + (v.stats?.modules ?? 0) + " 模块 / " +
      (v.stats?.items ?? 0) + " 条</div></div>";

  // 编排结构 —— 让人一眼看出这一版长什么样
  h += '<div class="mgroup"><h3>编排结构</h3>';
  const pages = curVerPlan?.pages ?? [];
  if (!pages.length) {
    h += '<div class="hint">这一版没有页面</div>';
  } else {
    for (const p of pages) {
      h += '<div class="mrow" style="cursor:default"><div class="t">' +
        hvEsc(p.title || p.path) + "</div>" +
        '<div class="m">' +
        '<span class="pill">' + hvEsc(p.path) + "</span>" +
        (p.published ? '<span class="pill ok">发布</span>' : '<span class="pill warn">草稿</span>') +
        '<span class="pill">' + (p.modules ?? []).length + " 模块</span>" +
        "</div>";
      for (const m of p.modules ?? []) {
        h += '<div class="hint" style="margin-left:10px">· ' +
          hvEsc(m.title || m.type) + "（" + hvEsc(m.type) + "，" +
          (m.items ?? []).length + " 条）</div>";
      }
      h += "</div>";
    }
  }
  h += "</div>";

  // 差异区 —— 对比之后填进来
  h += '<div class="mgroup" id="verDiffBox"><h3>与当前的差异</h3>' +
    '<div class="hint">点右上「对比当前」</div></div>';

  el.innerHTML = h;
}

function bindHistoryPanel() {
  const list = document.getElementById("verList");
  if (list) {
    list.addEventListener("click", (e) => {
      const row = e.target.closest("[data-ver]");
      if (!row) return;
      void selectVersion(row.dataset.ver);
    });
  }

  document.getElementById("verReload")?.addEventListener("click", async () => {
    await loadHistory();
    toast("版本列表已刷新");
  });

  // 对比当前
  document.getElementById("verDiff")?.addEventListener("click", async () => {
    if (!curVerId) { toast("先选一个版本", true); return; }
    const r = await fetch(
      "/api/sites/" + encodeURIComponent(siteId) + "/history/diff",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: curVerId }),
      },
    );
    const d = await r.json();
    if (d.error) { toast(d.error, true); return; }
    const box = document.getElementById("verDiffBox");
    if (!box) return;
    const entries = d.diff?.entries ?? [];
    const s = d.diff?.summary ?? { added: 0, removed: 0, changed: 0 };
    let h = "<h3>与当前的差异（+" + s.added + " / -" + s.removed + " / ~" + s.changed + "）</h3>";
    if (!entries.length) {
      h += '<div class="hint">与当前编排一致，没有差异</div>';
    } else {
      const mark = { added: "+", removed: "-", changed: "~" };
      h += entries.map((x) =>
        '<div class="dline ' + x.kind + '">' +
        mark[x.kind] + " " + hvEsc(x.path) + " —— " + hvEsc(x.detail) + "</div>").join("");
    }
    box.innerHTML = h;
  });

  // 回滚
  document.getElementById("verRollback")?.addEventListener("click", async () => {
    if (!curVerId) { toast("先选一个版本", true); return; }
    if (!confirm(
      "回滚到版本 " + curVerId + "？\\n" +
      "当前编排会被这一版替换（历史不丢，回滚本身也会留一个版本）",
    )) return;
    const r = await fetch(
      "/api/sites/" + encodeURIComponent(siteId) + "/history/rollback",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: curVerId }),
      },
    );
    const d = await r.json();
    if (d.error) { toast(d.error, true); return; }
    toast(d.hint ?? "已回滚");
    await loadHistory();
    await selectVersion(curVerId);
    // 模块面板要跟着刷新 —— 回滚改的是 modules.json
    if (typeof loadModules === "function") await loadModules();
  });
}
</script>
`;

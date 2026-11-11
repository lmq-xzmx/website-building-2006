/**
 * 应用外壳 —— 导轨、顶栏、路由、全局快捷键。
 *
 * 分工：
 *   app.js     只负责「外面这一圈」和视图的生命周期
 *   views/*.js 每个作业区自己管自己，互不知道对方存在
 *   lib/store  唯一的状态来源
 */

import { h, icon, mount, clear, toast, dialog, drawer, empty, relTime } from "./lib/dom.js";
import { ApiError, api } from "./lib/api.js";
import { VIEWS, go, onRoute, parseHash, start as startRouter, currentView } from "./lib/router.js";
import * as store from "./lib/store.js";

import * as overview from "./views/overview.js";
import * as content from "./views/content.js";
import * as templates from "./views/templates.js";
import * as media from "./views/media.js";
import * as components from "./views/components.js";
import * as wechat from "./views/wechat.js";
import * as release from "./views/release.js";
import * as appearance from "./views/appearance.js";

const VIEW_IMPL = { overview, content, templates, media, components, wechat, release, appearance };

const app = document.getElementById("app");
let railEl = null;
let topbarEl = null;
let stageEl = null;
let activeView = null;
let currentCtx = null;

/* ── 启动 ───────────────────────────────────────────────── */
async function boot() {
  store.state.user = window.__USER__ ?? null;
  store.state.perms = Array.isArray(window.__PERMS__) ? window.__PERMS__ : [];

  buildChrome();
  renderStage(
    h(
      "div",
      { class: "work__body", style: { display: "grid", placeItems: "center" } },
      h(
        "div",
        { class: "empty" },
        h("div", { class: "empty__mark" }, icon("refresh", 18)),
        h("h3", { text: "正在打开打样台" }),
        h("p", { text: "读取站点与编排…" }),
      ),
    ),
  );

  try {
    await store.loadSites();
    if (!store.state.siteId) {
      renderStage(
        h(
          "div",
          { class: "work__body", style: { display: "grid", placeItems: "center" } },
          h(
            "div",
            { class: "empty" },
            h("div", { class: "empty__mark" }, icon("alert", 18)),
            h("h3", { text: "sites/ 下还没有站点" }),
            h("p", { text: "放一个含 content/site.ts 的目录到 sites/，刷新即可出现在这里。" }),
          ),
        ),
      );
      return;
    }
    await Promise.all([store.loadPlan(), store.loadKb(), store.loadFragments()]);
    store.pruneSelection();
    store.emit("boot");
    updateChrome();
    onRoute(paintRoute);
    startRouter();
    void store.runCheck({ silent: true });
  } catch (e) {
    renderStage(
      h(
        "div",
        { class: "work__body", style: { display: "grid", placeItems: "center" } },
        h(
          "div",
          { class: "empty" },
          h("div", { class: "empty__mark" }, icon("alert", 18)),
          h("h3", { text: "打不开站点" }),
          h("p", { text: e instanceof ApiError ? e.message : String(e) }),
          h(
            "button",
            { class: "btn btn--ink", type: "button", text: "重试", onclick: () => location.reload() },
          ),
        ),
      ),
    );
  }

  store.subscribe((reason) => {
    updateChrome();
    if (reason === "site") {
      loadSiteData();
      return;
    }
    if (activeView?.update) {
      try {
        activeView.update(reason);
      } catch (err) {
        console.error("[view update]", reason, err);
      }
    }
  });

  document.addEventListener("keydown", onGlobalKey);
  window.addEventListener("beforeunload", (e) => {
    if (!store.state.dirty) return;
    e.preventDefault();
    e.returnValue = "有未保存的改动";
  });

  // 崩溃恢复：本地草稿比磁盘新时，明确问一次
  setTimeout(offerDraft, 600);
  checkPerms();
}

async function loadSiteData() {
  renderStage(loadingStage("切换站点…"));
  try {
    await store.loadPlan();
    await store.loadKb();
    await store.loadFragments();
    store.pruneSelection();
    store.emit("plan");
    void store.runCheck({ silent: true });
    paintRoute(parseHash());
  } catch (e) {
    toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
  }
}

function offerDraft() {
  const draft = store.pendingDraft();
  if (!draft) return;
  toast(`发现 ${relTime(new Date(draft.at).toISOString())} 的未保存草稿`, {
    kind: "",
    actionLabel: "恢复",
    timeout: 12000,
    onAction: () => {
      store.restoreDraft(draft);
      toast("已恢复草稿 —— 检查后记得保存", { kind: "ok" });
    },
  });
}

function checkPerms() {
  if (store.state.perms.length === 0) return;
  if (!store.state.perms.includes("content.publish")) {
    setTimeout(() => toast("你的角色没有发布权限，可以编辑与提交审核", { timeout: 5000 }), 1200);
  }
}

/* ── 外壳 ───────────────────────────────────────────────── */
function buildChrome() {
  railEl = h("nav", { class: "rail", "aria-label": "作业区" });
  topbarEl = h("header", { class: "topbar" });
  stageEl = h("main", { class: "shell__stage", style: { flex: "1", minHeight: "0", display: "flex" } });
  const shell = h("div", { class: "shell" }, topbarEl, stageEl);
  app.append(railEl, shell);
  updateChrome();
}

function updateChrome() {
  if (!railEl) return;
  const active = currentView() ?? parseHash().view;
  const c = store.counts();
  const blockers = store.state.check.problems.length;

  mount(
    railEl,
    h(
      "div",
      { class: "rail__brand" },
      h("div", { class: "rail__mark", "aria-hidden": "true" }, "打", h("b", { text: "样" })),
      h("div", { class: "rail__name", text: "内容后台" }),
    ),
    h(
      "div",
      { class: "rail__nav" },
      ...VIEWS.map((v) => {
        const badge =
          v.id === "release" && blockers ? h("span", { class: "rail__badge", text: String(blockers) }) : null;
        return h(
          "button",
          {
            class: "rail__item",
            type: "button",
            "aria-current": active === v.id ? "page" : null,
            title: v.title,
            onclick: () => go(v.id),
          },
          icon(v.icon, 18),
          h("span", { text: v.label }),
          badge,
        );
      }),
      h(
        "button",
        {
          class: "rail__item",
          type: "button",
          title: `草稿 ${c.drafts} 条 · 待审 ${c.pending} 条`,
          onclick: () => go("release"),
        },
        icon("clock", 18),
        h("span", { text: "待办" }),
        c.pending ? h("span", { class: "rail__badge", text: String(c.pending) }) : null,
      ),
    ),
    h("span", { class: "rail__spacer" }),
    h(
      "button",
      {
        class: "rail__user",
        type: "button",
        title: store.state.user ? `${store.state.user.displayName || store.state.user.name} · ${store.state.user.role ?? ""}` : "未登录",
        onclick: () => userMenu(),
      },
      initials(),
    ),
  );

  updateTopbar();
}

function initials() {
  const n = store.state.user?.displayName || store.state.user?.name || "本";
  return n.slice(0, 1).toUpperCase();
}

function updateTopbar() {
  const site = store.state.sites.find((s) => s.id === store.state.siteId);
  const view = VIEWS.find((v) => v.id === (currentView() ?? "overview"));
  const page = store.currentPage();
  const c = store.counts();
  const check = store.state.check;
  const blockers = check.problems.length;
  const hold = check.checking || !check.ready || check.kbDown;
  const warnCount = check.warnings.length;

  mount(
    topbarEl,
    h(
      "button",
      {
        class: "site-switch",
        type: "button",
        "aria-label": "切换站点",
        onclick: (e) => siteMenu(e.currentTarget),
      },
      h("span", { class: "site-switch__dot" }),
      h("span", { class: "site-switch__name", text: site?.name ?? "未选站点" }),
      h("span", { class: "site-switch__id", text: site?.id ?? "" }),
      icon("chevronDown", 13),
    ),
    h(
      "div",
      { class: "crumb" },
      h("b", { text: view?.label ?? "" }),
      view?.id === "content" && page ? [icon("chevronRight", 12), h("span", { text: page.title })] : null,
    ),
    h("span", { class: "topbar__spacer" }),

    store.state.dirty
      ? h(
          "span",
          { class: "dirty", title: "有改动还没写进 modules.json —— ⌘S 保存" },
          h("i"),
          "未保存",
        )
      : store.state.lastSavedAt
        ? h("span", { class: "muted", style: { fontSize: "11.5px" }, text: `已保存 · ${relTime(store.state.lastSavedAt)}` })
        : null,

    h(
      "button",
      {
        id: "topbar-pages",
        class: "btn btn--ghost btn--sm",
        type: "button",
        title: "页面清单 —— 每个页面的网址都在这儿",
        onclick: openPageMap,
      },
      icon("link", 14),
      h("span", { text: "页面清单" }),
    ),

    h(
      "button",
      {
        id: "topbar-search",
        class: "btn btn--ghost btn--sm",
        type: "button",
        title: "搜索页面 / 跳转 / 执行命令（⌘K）",
        onclick: openPalette,
      },
      icon("search", 14),
      h("span", { text: "搜索" }),
      h("span", { class: "kbd", text: "⌘K" }),
    ),

    h(
      "button",
      {
        id: "topbar-save",
        class: "btn btn--sm",
        type: "button",
        disabled: !store.state.dirty || store.state.saving,
        title: "保存编排（⌘S）",
        onclick: saveNow,
      },
      icon("save", 14),
      store.state.saving ? "保存中…" : "保存",
    ),

    h(
      "button",
      {
        id: "topbar-publish",
        class: `btn ${blockers || hold ? "" : "btn--stamp"} btn--sm`,
        type: "button",
        title: hold ? "校样还没就绪" : blockers ? `${blockers} 处阻断问题，先修完再发布` : "去发布台",
        onclick: () => go("release"),
      },
      icon("upload", 14),
      hold ? "校样中…" : blockers ? `发布 · ${blockers} 处待修` : warnCount ? `发布 · ${warnCount} 提醒` : "发布",
    ),
  );
}

/* ── 站点切换 / 用户菜单 ───────────────────────────────── */

/**
 * 页面清单 —— 每个页面在站上的网址。
 *
 * 为什么单开一个入口，而不是挂在站点切换按钮下：
 *   站点切换按钮是**换站点**的，网址清单是**看这个站有什么页面**的 ——
 *   两个不同的意图塞进一个按钮，菜单会变成两件事的混合体。
 *   而且站点只有一个时，切换按钮几乎不用，网址却天天要抄。
 */
async function openPageMap() {
  const pages = store.pages();
  const fromEnv = store.state.siteBaseFrom === "env";
  const urlOf = (path) => store.pageUrl(path);

  // 编排之外的固定页（/about、/cases…）不在 modules.json 里 ——
  // 从构建产物扫出来，否则清单只给一半地址。
  let built = [];
  try {
    const d = await api.sitePages(store.state.siteId);
    built = d.pages ?? [];
  } catch {
    built = [];
  }
  const planned = new Set(pages.map((p) => (p.path || "/").replace(/\/+$/, "") || "/"));
  const extra = built.filter((p) => !planned.has(p.replace(/\/+$/, "") || "/"));

  const body = h("div", { class: "stack gap10" });
  if (!pages.length && !extra.length) {
    body.appendChild(empty({ title: "这个站点还没有页面", text: "去内容区建一页。", mark: "file" }));
  } else {
    for (const p of pages) {
      const url = urlOf(p.path);
      body.appendChild(
        h(
          "div",
          {
            style: {
              border: "1px solid var(--rule)",
              borderRadius: "4px",
              background: "var(--sheet)",
              padding: "9px 11px",
            },
          },
          h(
            "div",
            { class: "hstack gap8" },
            h("span", { style: { fontSize: "13px", fontWeight: "500" }, text: p.title || "未命名页面" }),
            p.published ? null : h("span", { class: "tag tag--draft", text: "草稿" }),
            p.generatedFrom ? h("span", { class: "tag tag--frag", text: "模版生成" }) : null,
            h("span", { class: "sp" }),
            h("code", {
              class: "url-chip",
              text: url,
              title: "点击复制网址",
              onclick: () => void copyText(url),
            }),
            h("button", {
              class: "btn btn--ghost btn--icon btn--sm",
              type: "button",
              title: "在新标签打开",
              "aria-label": "打开这一页",
              onclick: () => window.open(url, "_blank", "noopener"),
            }, icon("external", 13)),
          ),
          h("div", { class: "mono muted", style: { fontSize: "11.5px", marginTop: "3px" }, text: p.path || "/" }),
        ),
      );
    }
    for (const path of extra) {
      const url = urlOf(path);
      body.appendChild(
        h(
          "div",
          {
            style: {
              border: "1px solid var(--rule)",
              borderRadius: "4px",
              background: "var(--sheet)",
              padding: "9px 11px",
            },
          },
          h(
            "div",
            { class: "hstack gap8" },
            h("span", { style: { fontSize: "13px", fontWeight: "500" }, text: path }),
            h("span", { class: "tag", title: "这一页来自内容包，不在后台编排里", text: "内容包" }),
            h("span", { class: "sp" }),
            h("code", {
              class: "url-chip",
              text: url,
              title: "点击复制网址",
              onclick: () => void copyText(url),
            }),
            h("button", {
              class: "btn btn--ghost btn--icon btn--sm",
              type: "button",
              title: "在新标签打开",
              "aria-label": "打开这一页",
              onclick: () => window.open(url, "_blank", "noopener"),
            }, icon("external", 13)),
          ),
        ),
      );
    }
  }

  drawer({
    title: "页面清单",
    subtitle: fromEnv ? "这些是站点上的正式网址" : "这些是本地预览网址（/preview/…）—— 发布到生产后域名会变",
    body,
    width: "620px",
  });
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制：" + text, { kind: "ok" });
  } catch {
    toast(text, { timeout: 6000 });
  }
}

function siteMenu(anchor) {
  const rect = anchor.getBoundingClientRect();
  const pop = h(
    "div",
    {
      class: "card",
      style: {
        position: "fixed",
        top: `${rect.bottom + 6}px`,
        left: `${rect.left}px`,
        width: "280px",
        zIndex: "85",
        padding: "5px",
        boxShadow: "var(--shadow-lift)",
      },
    },
    h("div", { class: "section-label", style: { margin: "4px 6px 6px" }, text: "站点" }),
    ...store.state.sites.map((s) =>
      h(
        "button",
        {
          class: "cmdk__item",
          type: "button",
          "data-on": s.id === store.state.siteId ? "1" : null,
          onclick: () => {
            close();
            store.setSite(s.id);
          },
        },
        icon("layers", 14),
        h("span", { text: s.name }),
        h("small", { text: s.id }),
      ),
    ),
  );
  const scrim = h("div", { style: { position: "fixed", inset: "0", zIndex: "84" }, onclick: close });
  document.body.append(scrim, pop);
  function close() {
    pop.remove();
    scrim.remove();
  }
}

function userMenu() {
  const u = store.state.user;
  dialog({
    title: u ? u.displayName || u.name : "未登录（开发模式）",
    body: h(
      "div",
      { class: "stack gap8" },
      h("p", { class: "muted", text: u ? `角色：${u.role ?? "—"}` : "后台未开启鉴权，拥有全部权限。" }),
      h(
        "div",
        { class: "chips" },
        ...(store.state.perms.length ? store.state.perms : ["全权限"]).map((p) =>
          h("span", { class: "chip", text: typeof p === "string" ? p : p.id }),
        ),
      ),
    ),
    confirmLabel: "退出登录",
    cancelLabel: "关闭",
    danger: true,
    onConfirm: () => {
      location.href = "/logout";
    },
  });
}

/* ── 路由 → 视图 ────────────────────────────────────────── */
function paintRoute({ view }) {
  const impl = VIEW_IMPL[view];
  if (!impl) return;
  try {
    activeView?.destroy?.();
    activeView = impl.create({
      siteId: store.state.siteId,
      onSaved: () => toast("已保存", { kind: "ok" }),
    });
    currentCtx = activeView;
    renderStage(activeView.el);
    updateChrome();
  } catch (e) {
    console.error(e);
    renderStage(
      h(
        "div",
        { class: "work__body", style: { padding: "40px" } },
        h(
          "div",
          { class: "empty" },
          h("div", { class: "empty__mark" }, icon("alert", 18)),
          h("h3", { text: "这个作业区没打开" }),
          h("p", { text: e instanceof Error ? e.message : String(e) }),
        ),
      ),
    );
  }
}

function renderStage(node) {
  clear(stageEl);
  stageEl.appendChild(node);
}

function loadingStage(text) {
  return h(
    "div",
    { class: "work__body", style: { display: "grid", placeItems: "center" } },
    h("div", { class: "empty" }, h("div", { class: "empty__mark" }, icon("refresh", 18)), h("h3", { text })),
  );
}

/* ── 全局动作 ───────────────────────────────────────────── */
export async function saveNow() {
  if (!store.state.plan) return;
  try {
    await store.savePlan();
    updateChrome();
    toast("已保存到 modules.json", { kind: "ok", timeout: 1800 });
    void store.runCheck();
  } catch (e) {
    toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
  }
}

function onGlobalKey(e) {
  const meta = e.metaKey || e.ctrlKey;
  if (meta && e.key.toLowerCase() === "s") {
    e.preventDefault();
    void saveNow();
    return;
  }
  if (meta && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openPalette();
    return;
  }
  if (meta && e.key.toLowerCase() === "z" && !isTyping(e.target)) {
    const label = store.undo();
    if (label) toast(`已撤销：${label}`, { timeout: 1600 });
    else toast("没有可撤销的操作", { timeout: 1400 });
  }
}

function isTyping(el) {
  const tag = el?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || el?.isContentEditable;
}

/* ── 命令面板 ───────────────────────────────────────────── */
function openPalette() {
  const pages = store.pages();
  const items = [
    ...pages.map((p) => ({
      label: p.title,
      hint: p.path,
      icon: "file",
      run: () => {
        store.select({ pageId: p.id });
        go("content");
      },
    })),
    ...VIEWS.map((v) => ({ label: v.label, hint: v.title, icon: v.icon, run: () => go(v.id) })),
    { label: "保存编排", hint: "⌘S", icon: "save", run: () => void saveNow() },
    { label: "重新校验", hint: "跑一遍校样", icon: "check", run: () => void store.runCheck().then(() => toast("校验完成")) },
    { label: "刷新知识库", hint: "重新拉取", icon: "refresh", run: () => void store.loadKb({ force: true }).then(() => toast("知识库已刷新")) },
  ];

  const list = h("div", { class: "cmdk__list" });
  const input = h("input", {
    class: "cmdk__input",
    placeholder: "跳到页面、切换作业区、执行命令…",
    "aria-label": "命令",
  });
  let filtered = items;
  let cursor = 0;

  function paint() {
    mount(
      list,
      ...filtered.map((it, i) =>
        h(
          "button",
          {
            class: "cmdk__item",
            type: "button",
            "data-on": i === cursor ? "1" : null,
            onmousemove: () => {
              cursor = i;
              paint();
            },
            onclick: () => {
              close();
              it.run();
            },
          },
          icon(it.icon, 14),
          h("span", { text: it.label }),
          h("small", { text: it.hint }),
        ),
      ),
      filtered.length ? null : h("div", { class: "empty", style: { padding: "22px" } }, h("p", { text: "没有匹配项" })),
    );
  }

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    filtered = q
      ? items.filter((it) => `${it.label} ${it.hint}`.toLowerCase().includes(q))
      : items;
    cursor = 0;
    paint();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cursor = Math.min(filtered.length - 1, cursor + 1);
      paint();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cursor = Math.max(0, cursor - 1);
      paint();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[cursor];
      if (it) {
        close();
        it.run();
      }
    } else if (e.key === "Escape") {
      close();
    }
  });

  const box = h("div", { class: "dialog cmdk" }, input, list);
  const scrim = h("div", { class: "scrim", style: { placeItems: "start center", paddingTop: "0" } }, box);
  scrim.addEventListener("mousedown", (e) => {
    if (e.target === scrim) close();
  });
  function close() {
    scrim.remove();
  }
  document.body.appendChild(scrim);
  paint();
  input.focus();
}

/* ── 去 ─────────────────────────────────────────────────── */
boot();

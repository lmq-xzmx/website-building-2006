/**
 * 应用状态 —— 单一可变对象 + 订阅。
 *
 * 旧界面的状态散在七个面板的闭包里，谁都能改全局 plan，
 * 于是「保存」按钮不知道自己保存的是哪一份。这里收口：
 *   - state 只能由本文件的函数改
 *   - 改结构必须 pushUndo()，撤销才有的撤
 *   - dirty 由 savePlan 统一复位
 */

import { api, ApiError } from "./api.js";
import { uid } from "./dom.js";

const LS_SITE = "geo.console.site";
const LS_DRAFT = "geo.console.draft.";

export const state = {
  user: null,
  perms: [],
  sites: [],
  siteId: null,
  /** 站点访问基址：开发机跟随后台地址，生产机由 SITE_BASE_URL 配置 */
  siteBaseUrl: "",
  siteBaseFrom: "request",
  plan: null,
  /** 与磁盘相比是否有未保存改动 */
  dirty: false,
  saving: false,
  lastSavedAt: null,
  /** 知识库（只读） */
  kb: { bases: [], items: [], loading: false, error: "", at: 0 },
  kbId: "",
  /** 校验 + 物化预览。ready=false 时界面不能说「可以发布」——那是假阳性 */
  check: { problems: [], warnings: [], stats: null, pages: [], at: 0, running: false, error: "", materialized: false, checking: false, ready: false, kbDown: false },
  /** 当前工位选择 */
  sel: { pageId: null, moduleId: null, itemId: null },
  /** 界面态 */
  /** 界面态：focusIssue = 从待办跳过来的那条问题，内容区据此给修复提示 */
  ui: { device: "desktop", mode: "edit", kbOpen: false, structQuery: "", focusIssue: null },
  undoStack: [],
};

/* ── 订阅 ───────────────────────────────────────────────── */
const subs = new Set();
export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
export function emit(reason = "change") {
  for (const fn of subs) fn(reason, state);
}
export function notify(reason) {
  emit(reason);
}

export function can(perm) {
  if (!state.perms || state.perms.length === 0) return true;
  return state.perms.includes(perm);
}

/* ── 站点 ───────────────────────────────────────────────── */
export async function loadSites() {
  const d = await api.sites();
  state.sites = d.sites ?? [];
  state.siteBaseUrl = d.siteBaseUrl || `${location.origin}/`;
  state.siteBaseFrom = d.siteBaseFrom ?? "request";
  const remembered = localStorage.getItem(LS_SITE);
  const hit = state.sites.find((s) => s.id === remembered);
  state.siteId = hit?.id ?? state.sites[0]?.id ?? null;
  return state.sites;
}

export function setSite(id) {
  if (!id || id === state.siteId) return;
  state.siteId = id;
  localStorage.setItem(LS_SITE, id);
  state.plan = null;
  state.check = { problems: [], warnings: [], stats: null, pages: [], at: 0, running: false, error: "", materialized: false, checking: false, ready: false, kbDown: false };
  state.sel = { pageId: null, moduleId: null, itemId: null };
  state.undoStack = [];
  state.dirty = false;
  emit("site");
}

/* ── 编排读写 ───────────────────────────────────────────── */
export async function loadPlan() {
  if (!state.siteId) return;
  const d = await api.modules(state.siteId);
  state.plan = normalizePlan(d.plan ?? d, state.siteId);
  state.dirty = false;
  state.lastSavedAt = state.plan.updatedAt ?? null;
  pruneSelection();
  emit("plan");
}

function normalizePlan(plan, siteId) {
  const p = plan && Array.isArray(plan.pages) ? plan : { version: 1, siteId, kbId: "default", pages: [], updatedAt: "" };
  p.pages = p.pages.map((pg, i) => ({
    ...pg,
    order: Number.isFinite(pg.order) ? pg.order : i,
    modules: (pg.modules ?? []).map((m, j) => ({
      ...m,
      order: Number.isFinite(m.order) ? m.order : j,
      enabled: m.enabled !== false,
      items: (m.items ?? []).map((it, k) => ({
        ...it,
        order: Number.isFinite(it.order) ? it.order : k,
        published: it.published !== false,
      })),
    })),
  }));
  return p;
}

export function touch() {
  state.dirty = true;
  state.plan.updatedAt = new Date().toISOString();
  persistDraft();
  emit("dirty");
  scheduleCheck();
  scheduleAutosave();
}

/**
 * 自动保存 —— 用户对「加的内容刷新后还在」是有预期的。
 *
 * 以前的模型是纯显式保存：不点「保存」就只进内存 + localStorage 草稿，
 * 刷新后从磁盘读回旧数据，刚加的内容看起来「消失」了
 * （草稿恢复提示只有 12 秒，很容易错过）。
 *
 * 现在改动停手 1.5 秒后自动落盘；显式保存（⌘S / 按钮）仍然保留 ——
 * 立即落盘，不等防抖。自动保存失败时 dirty 保持、草稿仍在 localStorage，
 * 刷新后的草稿恢复提示还是兜底。
 */
const AUTOSAVE_MS = 1500;
let autosaveTimer = null;

function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    if (!state.dirty || state.saving) return;
    savePlan().catch(() => {
      /* 落盘失败不打断编辑 —— dirty 挂着，草稿兜底 */
    });
  }, AUTOSAVE_MS);
}

export async function savePlan() {
  if (!state.siteId || !state.plan) return;
  // 手动保存立即落盘，挂起的自动保存就不必再跑
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  state.saving = true;
  emit("saving");
  try {
    await api.saveModules(state.siteId, state.plan);
    state.dirty = false;
    state.lastSavedAt = new Date().toISOString();
    localStorage.removeItem(LS_DRAFT + state.siteId);
    return true;
  } finally {
    state.saving = false;
    emit("saved");
  }
}

function persistDraft() {
  if (!state.siteId || !state.plan) return;
  try {
    localStorage.setItem(
      LS_DRAFT + state.siteId,
      JSON.stringify({ plan: state.plan, at: Date.now() }),
    );
  } catch {
    /* 配额满了就算了，别打断编辑 */
  }
}

/** 有没有比磁盘更新的本地草稿（崩溃/关标签页后的救命稻草） */
export function pendingDraft() {
  if (!state.siteId) return null;
  const raw = localStorage.getItem(LS_DRAFT + state.siteId);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!d?.plan?.pages) return null;
    if (state.plan && JSON.stringify(d.plan) === JSON.stringify(state.plan)) return null;
    return d;
  } catch {
    return null;
  }
}

export function restoreDraft(draft) {
  state.plan = normalizePlan(draft.plan, state.siteId);
  state.dirty = true;
  pruneSelection();
  emit("plan");
  scheduleCheck();
  // 恢复的草稿也要自动落盘 —— 不然「恢复」之后再刷新，又要恢复一遍
  scheduleAutosave();
}

export function dropDraft() {
  if (state.siteId) localStorage.removeItem(LS_DRAFT + state.siteId);
}

/* ── 撤销 ───────────────────────────────────────────────── */
export function pushUndo(label) {
  if (!state.plan) return;
  state.undoStack.push({ label, plan: JSON.stringify(state.plan), sel: { ...state.sel } });
  if (state.undoStack.length > 30) state.undoStack.shift();
}

export function undo() {
  const last = state.undoStack.pop();
  if (!last) return null;
  state.plan = JSON.parse(last.plan);
  state.sel = last.sel;
  touch();
  emit("plan");
  return last.label;
}

/* ── 查询 ───────────────────────────────────────────────── */
export function pages() {
  return (state.plan?.pages ?? []).slice().sort((a, b) => {
    if (!!b.sticky !== !!a.sticky) return b.sticky ? 1 : -1;
    return a.order - b.order;
  });
}

export function pageById(id) {
  return state.plan?.pages.find((p) => p.id === id) ?? null;
}

export function modulesOf(page) {
  if (!page) return [];
  return (page.modules ?? []).slice().sort((a, b) => {
    if (!!b.sticky !== !!a.sticky) return b.sticky ? 1 : -1;
    return a.order - b.order;
  });
}

export function itemsOf(mod) {
  if (!mod) return [];
  return (mod.items ?? []).slice().sort((a, b) => {
    if (!!b.sticky !== !!a.sticky) return b.sticky ? 1 : -1;
    return a.order - b.order;
  });
}

export function currentPage() {
  return pageById(state.sel.pageId) ?? pages()[0] ?? null;
}

export function currentModule(page) {
  const pg = page ?? currentPage();
  if (!pg) return null;
  return (pg.modules ?? []).find((m) => m.id === state.sel.moduleId) ?? modulesOf(pg)[0] ?? null;
}

export function currentItem(mod) {
  const m = mod ?? currentModule();
  if (!m) return null;
  return (m.items ?? []).find((it) => it.id === state.sel.itemId) ?? null;
}

export function pruneSelection() {
  const pg = pages();
  if (!pg.length) {
    state.sel = { pageId: null, moduleId: null, itemId: null };
    return;
  }
  if (!pg.some((p) => p.id === state.sel.pageId)) {
    state.sel = { pageId: pg[0].id, moduleId: null, itemId: null };
  }
  const page = pageById(state.sel.pageId);
  const mods = modulesOf(page);
  if (!mods.some((m) => m.id === state.sel.moduleId)) {
    state.sel.moduleId = mods[0]?.id ?? null;
    state.sel.itemId = null;
  }
  const mod = (page?.modules ?? []).find((m) => m.id === state.sel.moduleId);
  if (!(mod?.items ?? []).some((it) => it.id === state.sel.itemId)) state.sel.itemId = null;
}

export function select({ pageId, moduleId, itemId } = {}) {
  if (pageId !== undefined && pageId !== state.sel.pageId) {
    state.sel = { pageId, moduleId: null, itemId: null };
  }
  if (moduleId !== undefined) {
    state.sel.moduleId = moduleId;
    if (itemId === undefined) state.sel.itemId = null;
  }
  if (itemId !== undefined) state.sel.itemId = itemId;
  pruneSelection();
  emit("select");
}

export function locate(problem) {
  if (!problem) return;
  state.sel = {
    pageId: problem.pageId || state.sel.pageId,
    moduleId: problem.moduleId || null,
    itemId: problem.itemId || null,
  };
  pruneSelection();
  state.ui.mode = "edit";
  // 带一条待办过去：内容区才知道「为什么跳到这、要改哪个字段」
  state.ui.focusIssue = { ...problem };
  emit("select");
}

export function clearFocus({ silent = false } = {}) {
  if (!state.ui.focusIssue) return;
  state.ui.focusIssue = null;
  if (!silent) emit("select");
}

/** 找到问题指向的那条内容（审核与一键修复都要精确定位） */
export function findItem(problem) {
  const pg = (state.plan?.pages ?? []).find((p) => p.id === problem?.pageId);
  const mod = (pg?.modules ?? []).find((m) => m.id === problem?.moduleId);
  return (mod?.items ?? []).find((i) => i.id === problem?.itemId) ?? null;
}

/** 已上线但卡在审核上的条目 —— 概览的「待审」从这里找到终点 */
export function pendingItems() {
  const out = [];
  for (const pg of state.plan?.pages ?? []) {
    for (const mod of pg.modules ?? []) {
      for (const it of mod.items ?? []) {
        if (it.published && (it.review === "pending" || it.review === "rejected")) {
          out.push({ page: pg, mod, item: it });
        }
      }
    }
  }
  return out;
}

/**
 * 审核动作 —— 以前服务端有接口、前端没有任何入口，链路是断的。
 * 服务端写盘后同步本地那一条，再重算校样，阻断随之消失。
 */
export async function reviewItem(problem, decision) {
  if (!problem?.itemId || !problem?.moduleId) {
    throw new Error("这条没定位到具体内容，去内容区手动改");
  }
  // 审核是**服务端写盘**动作：它只能改磁盘上 modules.json 里存在的条目。
  // 编辑默认只存本地草稿（localStorage），新建/刚改过的条目还没 PUT 到后台，
  // 直接审核就会命中 0 条 → 404。所以先把草稿落盘，再送审核。
  if (state.dirty) await savePlan();
  const d = await api.review(state.siteId, {
    pageId: problem.pageId,
    moduleId: problem.moduleId,
    itemId: problem.itemId,
    decision,
  });
  const item = findItem(problem);
  if (item) item.review = decision;
  state.ui.focusIssue = null;
  emit("plan");
  await runCheck({ silent: true });
  return d.count ?? 1;
}

/** 一键修复：只做不改变内容含义的修补（补问号），改完可撤销 */
export async function applyAutoFix(problem, spec) {
  const item = findItem(problem);
  if (!item || !spec?.autoPatch) return 0;
  const patch = spec.autoPatch(item);
  if (!patch) return 0;
  pushUndo(spec.autoLabel || "一键修复");
  Object.assign(item, patch);
  state.ui.focusIssue = null;
  touch();
  emit("plan");
  await runCheck({ silent: true });
  return 1;
}

/* ── 计数器 ─────────────────────────────────────────────── */
export function counts() {
  const plan = state.plan;
  if (!plan) return { pages: 0, publishedPages: 0, modules: 0, items: 0, drafts: 0, pending: 0, kb: 0 };
  let publishedPages = 0;
  let modules = 0;
  let items = 0;
  let drafts = 0;
  let pending = 0;
  let kb = 0;
  for (const pg of plan.pages ?? []) {
    if (pg.published) publishedPages++;
    for (const m of pg.modules ?? []) {
      if (!m.enabled) continue;
      modules++;
      for (const it of m.items ?? []) {
        items++;
        if (it.source === "kb") kb++;
        if (!it.published) drafts++;
        if (it.review === "pending") pending++;
      }
    }
  }
  return { pages: plan.pages?.length ?? 0, publishedPages, modules, items, drafts, pending, kb };
}

/* ── 知识库 ─────────────────────────────────────────────── */
export async function loadKb({ force = false, kbId } = {}) {
  state.kb.loading = true;
  state.kb.error = "";
  emit("kb");
  try {
    const d = await api.kb({ kbId: kbId ?? state.kbId, refresh: force });
    state.kb.bases = d.bases ?? [];
    state.kb.items = (d.items ?? []).map((i) => ({
      ...i,
      tags: parseTags(i.tags),
    }));
    state.kb.at = Date.now();
  } catch (e) {
    state.kb.error = e instanceof ApiError ? e.message : String(e);
    state.kb.items = [];
  } finally {
    state.kb.loading = false;
    emit("kb");
  }
}

function parseTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  if (typeof tags === "string") {
    return tags
      .replace(/^[\[{]|[\]}]$/g, "")
      .split(/[,，]/)
      .map((t) => t.replace(/["']/g, "").trim())
      .filter(Boolean);
  }
  return [];
}

export function kbItemById(id) {
  return state.kb.items.find((i) => i.id === id) ?? null;
}

export function usedKbIds() {
  const set = new Set();
  for (const pg of state.plan?.pages ?? []) {
    for (const m of pg.modules ?? []) {
      for (const it of m.items ?? []) if (it.kbItemId) set.add(it.kbItemId);
    }
  }
  return set;
}

/* ── 校验与预览（防抖，避免每敲一个字就打一次接口）──────── */
let checkTimer = 0;
export function scheduleCheck(delay = 700) {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => void runCheck(), delay);
}

export async function runCheck({ silent = false } = {}) {
  if (!state.siteId || !state.plan) return null;
  clearTimeout(checkTimer);
  state.check.checking = true;
  if (!silent) {
    state.check.running = true;
    emit("check");
  }
  const planSnapshot = JSON.parse(JSON.stringify(state.plan));
  try {
    const d = await api.previewModules(state.siteId, planSnapshot);
    const problems = d.problems ?? [];
    state.check = {
      problems: problems.filter((p) => p.level === "error"),
      warnings: problems.filter((p) => p.level !== "error"),
      stats: d.stats ?? null,
      pages: d.pages ?? [],
      skipped: d.skipped ?? [],
      at: Date.now(),
      running: false,
      checking: false,
      ready: true,
      kbDown: false,
      error: "",
      materialized: true,
    };
  } catch (e) {
    // 知识库没连上时预览接口会 503 —— 退化成「本地物化」，
    // 至少版面能看，正文位置有明确占位，而不是整块空白。
    state.check = {
      problems: state.check.problems,
      warnings: state.check.warnings,
      stats: localStats(),
      pages: localMaterialize(planSnapshot),
      at: Date.now(),
      running: false,
      checking: false,
      ready: true,
      kbDown: true,
      error: e instanceof ApiError ? e.message : String(e),
      materialized: false,
    };
  }
  emit("check");
  return state.check;
}

function localStats() {
  const c = counts();
  return { pages: c.publishedPages, modules: c.modules, items: c.items, draftItems: c.drafts, kbItems: c.kb };
}

/** 没有服务端物化时的兜底：只排出结构，知识库正文留占位 */
function localMaterialize(plan) {
  return (plan.pages ?? [])
    .filter((p) => p.published)
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      id: p.id,
      path: p.path,
      title: p.title,
      description: p.description,
      modules: (p.modules ?? [])
        .filter((m) => m.enabled)
        .sort((a, b) => a.order - b.order)
        .map((m) => ({
          id: m.id,
          type: m.type,
          title: m.title,
          subtitle: m.subtitle,
          props: m.props,
          items: (m.items ?? [])
            .filter((it) => it.published)
            .sort((a, b) => a.order - b.order)
            .map((it) => ({
              ...it,
              paragraphs: it.body ? bodyToParagraphs(it.body) : [],
              pendingKb: it.source === "kb" && !it.body,
            })),
        })),
    }));
}

export function bodyToParagraphs(doc) {
  const out = [];
  for (const node of doc?.content ?? []) {
    if (node.type === "paragraph" || node.type === "heading") {
      out.push(textOf(node));
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      for (const li of node.content ?? []) out.push(textOf(li.content?.[0] ?? li));
    } else if (node.type === "blockquote" || node.type === "codeBlock") {
      out.push(textOf(node));
    }
  }
  return out.filter(Boolean);
}

function textOf(node) {
  return (node?.content ?? []).map((c) => c.text ?? "").join("");
}

export function previewPageFor(pagePath) {
  return state.check.pages.find((p) => p.path === pagePath) ?? null;
}

/* ── 结构变更 ───────────────────────────────────────────── */
const MODULE_DEFAULT_ITEM = {
  hero: () => ({ title: "一句话说清你是谁", summary: "给谁解决什么问题，用一句话说完。" }),
  "rich-text": () => ({ title: "小节标题", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }] } }),
  "card-grid": () => ({ title: "卡片标题", summary: "一句话说明这张卡片的价值。" }),
  faq: () => ({ question: "客户最常问的那个问题是什么？", answer: "直接给答案，别绕。" }),
  stats: () => ({ value: "99.95", unit: "%", label: "可用性" }),
  cta: () => ({ title: "下一步做什么", href: "/contact" }),
  gallery: () => ({ title: "图片说明", image: "" }),
  trust: () => ({ title: "资质名称", image: "", alt: "", caption: "" }),
  "logo-wall": () => ({ title: "客户名", image: "", alt: "客户名" }),
  process: () => ({ title: "步骤标题", summary: "这一步客户要做什么、多久。" }),
  form: () => ({ title: "提交后会发生什么", summary: "例如：工作日 2 小时内回电。" }),
};

export function newPage() {
  pushUndo("新建页面");
  const id = uid("pg");
  const n = (state.plan.pages?.length ?? 0) + 1;
  const page = {
    id,
    path: `/page-${n}`,
    title: "未命名页面",
    description: "",
    order: Math.max(0, ...(state.plan.pages ?? []).map((p) => p.order ?? 0)) + 1,
    published: false,
    modules: [],
    inNav: true,
  };
  state.plan.pages.push(page);
  touch();
  select({ pageId: id });
  emit("plan");
  return page;
}

export function deletePage(pageId) {
  const idx = state.plan.pages.findIndex((p) => p.id === pageId);
  if (idx < 0) return null;
  pushUndo("删除页面");
  const [gone] = state.plan.pages.splice(idx, 1);
  // 子页面挂回顶级 —— 不因为删父页把整棵子树弄丢
  for (const p of state.plan.pages) if (p.parentId === gone.id) delete p.parentId;
  touch();
  pruneSelection();
  emit("plan");
  return gone;
}

export function updatePage(pageId, patch) {
  const page = pageById(pageId);
  if (!page) return;
  Object.assign(page, patch);
  touch();
  emit("plan");
}

export function reorderPages(fromId, toId, after = false) {
  const list = pages();
  const from = list.findIndex((p) => p.id === fromId);
  const to = list.findIndex((p) => p.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  pushUndo("调整页面顺序");
  const [moved] = list.splice(from, 1);
  const target = list.findIndex((p) => p.id === toId);
  list.splice(after ? target + 1 : target, 0, moved);
  list.forEach((p, i) => {
    p.order = i;
  });
  state.plan.pages = list;
  touch();
  emit("plan");
}

export function addModule(type) {
  const page = currentPage();
  if (!page) return null;
  pushUndo("新增模块");
  const mod = {
    id: uid("mod"),
    type,
    title: MODULE_TYPE_LABEL[type] ?? "新模块",
    subtitle: "",
    items: [],
    order: Math.max(0, ...(page.modules ?? []).map((m) => m.order ?? 0)) + 1,
    enabled: true,
  };
  const tpl = MODULE_DEFAULT_ITEM[type]?.();
  if (tpl) mod.items.push({ id: uid("it"), source: "manual", order: 0, published: true, review: "approved", ...tpl });
  page.modules.push(mod);
  touch();
  select({ pageId: page.id, moduleId: mod.id, itemId: mod.items[0]?.id ?? null });
  emit("plan");
  return mod;
}

export function deleteModule(moduleId) {
  const page = currentPage();
  if (!page) return null;
  const idx = (page.modules ?? []).findIndex((m) => m.id === moduleId);
  if (idx < 0) return null;
  pushUndo("删除模块");
  const [gone] = page.modules.splice(idx, 1);
  touch();
  pruneSelection();
  emit("plan");
  return gone;
}

export function updateModule(moduleId, patch) {
  const page = currentPage();
  const mod = (page?.modules ?? []).find((m) => m.id === moduleId);
  if (!mod) return;
  Object.assign(mod, patch);
  touch();
  emit("plan");
}

export function reorderModules(fromId, toId, after = false) {
  const page = currentPage();
  if (!page) return;
  const list = modulesOf(page);
  const from = list.findIndex((m) => m.id === fromId);
  if (from < 0) return;
  pushUndo("调整模块顺序");
  const [moved] = list.splice(from, 1);
  const target = list.findIndex((m) => m.id === toId);
  list.splice(after ? target + 1 : target, 0, moved);
  list.forEach((m, i) => {
    m.order = i;
  });
  page.modules = list;
  touch();
  emit("plan");
}

export function addManualItem(moduleId) {
  const page = currentPage();
  const mod = (page?.modules ?? []).find((m) => m.id === moduleId);
  if (!mod) return null;
  pushUndo("新增条目");
  const tpl = MODULE_DEFAULT_ITEM[mod.type]?.() ?? { title: "新条目" };
  const item = {
    id: uid("it"),
    source: "manual",
    order: Math.max(0, ...(mod.items ?? []).map((i) => i.order ?? 0)) + 1,
    published: true,
    review: "approved",
    ...tpl,
  };
  mod.items.push(item);
  touch();
  select({ pageId: page.id, moduleId: mod.id, itemId: item.id });
  emit("plan");
  return item;
}

export function addKbItem(kbItem, moduleId) {
  const page = currentPage();
  const mod = (page?.modules ?? []).find((m) => m.id === moduleId);
  if (!mod || !kbItem) return null;
  pushUndo("引用知识条目");
  const item = {
    id: uid("it"),
    source: "kb",
    kbItemId: kbItem.id,
    title: kbItem.title,
    summary: kbItem.summary ?? "",
    order: Math.max(0, ...(mod.items ?? []).map((i) => i.order ?? 0)) + 1,
    published: true,
    review: "approved",
  };
  // 模块类型决定这条知识条目落到哪个字段 —— 别让人手动填空
  if (mod.type === "faq") {
    item.question = kbItem.title;
    item.answer = kbItem.summary ?? "";
  }
  if (mod.type === "stats") {
    item.label = kbItem.title;
    item.value = "";
  }
  if (mod.type === "process") {
    item.step = (mod.items?.length ?? 0) + 1;
  }
  mod.items.push(item);
  touch();
  select({ pageId: page.id, moduleId: mod.id, itemId: item.id });
  emit("plan");
  return item;
}

export function deleteItem(moduleId, itemId) {
  const page = currentPage();
  const mod = (page?.modules ?? []).find((m) => m.id === moduleId);
  if (!mod) return null;
  const idx = (mod.items ?? []).findIndex((i) => i.id === itemId);
  if (idx < 0) return null;
  pushUndo("删除条目");
  const [gone] = mod.items.splice(idx, 1);
  touch();
  pruneSelection();
  emit("plan");
  return gone;
}

export function updateItem(moduleId, itemId, patch, { quiet = false } = {}) {
  const page = currentPage();
  const mod = (page?.modules ?? []).find((m) => m.id === moduleId);
  const item = (mod?.items ?? []).find((i) => i.id === itemId);
  if (!item) return;
  Object.assign(item, patch);
  touch();
  if (!quiet) emit("plan");
}

export function reorderItems(moduleId, fromId, toId, after = false) {
  const page = currentPage();
  const mod = (page?.modules ?? []).find((m) => m.id === moduleId);
  if (!mod) return;
  const list = itemsOf(mod);
  const from = list.findIndex((i) => i.id === fromId);
  if (from < 0) return;
  pushUndo("调整条目顺序");
  const [moved] = list.splice(from, 1);
  const target = list.findIndex((i) => i.id === toId);
  list.splice(after ? target + 1 : target, 0, moved);
  list.forEach((it, i) => {
    it.order = i;
  });
  mod.items = list;
  touch();
  emit("plan");
}

export function appendFragment(fragment, moduleId) {
  const page = currentPage();
  if (!page || !fragment) return null;
  pushUndo("插入片段");
  const mod = {
    id: uid("mod"),
    type: fragment.type,
    title: fragment.name || fragment.title || MODULE_TYPE_LABEL[fragment.type],
    order: Math.max(0, ...(page.modules ?? []).map((m) => m.order ?? 0)) + 1,
    enabled: true,
    fragmentId: fragment.id,
    items: [],
  };
  page.modules.push(mod);
  touch();
  select({ pageId: page.id, moduleId: mod.id });
  emit("plan");
  return mod;
}

export function detachFragment(moduleId) {
  const page = currentPage();
  const mod = (page?.modules ?? []).find((m) => m.id === moduleId);
  if (!mod?.fragmentId) return;
  pushUndo("脱离片段");
  delete mod.fragmentId;
  delete mod.overrides;
  touch();
  emit("plan");
}

export const MODULE_TYPE_LABEL = {
  hero: "英雄区",
  "rich-text": "富文本",
  "card-grid": "卡片网格",
  faq: "问答",
  stats: "数据条",
  cta: "行动号召",
  gallery: "图片网格",
  trust: "信任背书",
  "logo-wall": "Logo 墙",
  process: "流程步骤",
  form: "表单导语",
};

export const MODULE_TYPE_DESC = {
  hero: "首屏一句话 + 一个动作",
  "rich-text": "正文段落与列表",
  "card-grid": "产品 / 案例 / 洞察卡片",
  faq: "一问一答，AI 最爱引用",
  stats: "数字 + 标签",
  cta: "一条行动号召",
  gallery: "图片并排",
  trust: "资质、认证、合作方",
  "logo-wall": "客户 logo 墙",
  process: "第 1 步 / 第 2 步",
  form: "表单前的说明",
};

/* ── 片段在哪些页面被引用（旧界面完全看不到这件事）────── */
export function fragmentUsage(fragmentId) {
  const out = [];
  for (const pg of state.plan?.pages ?? []) {
    for (const m of pg.modules ?? []) {
      if (m.fragmentId === fragmentId) out.push({ pageId: pg.id, pageTitle: pg.title, pagePath: pg.path, moduleId: m.id });
    }
  }
  return out;
}

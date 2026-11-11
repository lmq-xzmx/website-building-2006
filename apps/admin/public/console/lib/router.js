/**
 * 路由 —— 七个作业区，hash 驱动。
 *
 * 用 hash 而不是 history：后台是单文件服务，刷新任意深链都该能开。
 * 视图之间不互相 import，只通过 go() 说话，避免循环依赖。
 */

export const VIEWS = [
  { id: "overview", label: "概览", icon: "home", title: "一屏看清今天要做什么" },
  { id: "content", label: "内容", icon: "layers", title: "页面 · 模块 · 条目" },
  { id: "templates", label: "模版", icon: "copy", title: "模版定结构，实例填内容，生成前台页面" },
  { id: "media", label: "素材", icon: "image", title: "图片资产" },
  { id: "components", label: "组件", icon: "block", title: "可复用片段" },
  { id: "wechat", label: "分发", icon: "send", title: "排成公众号文章" },
  // 「上线记录」而不是「发布」——
  // 这一项管的是**档案**（发过什么、怎么退回去），不是发布动作。
  // 发布动作在顶栏，全站只有那一个。名字分开，意图才不会混。
  { id: "release", label: "上线记录", icon: "clock", title: "发过什么 · 怎么退回去" },
  { id: "appearance", label: "外观", icon: "palette", title: "版式与色板" },
];

export const VIEW_IDS = VIEWS.map((v) => v.id);

const subs = new Set();
let current = null;

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [view, qs] = raw.split("?");
  const id = VIEW_IDS.includes(view) ? view : "overview";
  const params = new URLSearchParams(qs ?? "");
  return { view: id, params };
}

export function onRoute(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function go(view, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const hash = `#/${view}${qs ? `?${qs}` : ""}`;
  if (location.hash === hash) {
    dispatch();
    return;
  }
  location.hash = hash;
}

export function currentView() {
  return current;
}

export function start() {
  window.addEventListener("hashchange", dispatch);
  dispatch();
}

function dispatch() {
  const next = parseHash();
  current = next.view;
  for (const fn of subs) fn(next);
}

/**
 * API 层 —— 所有网络请求只从这里发出。
 *
 * 为什么单独一层：旧界面把 fetch 散在七个面板里，错误处理各写一遍
 * （有的 alert、有的 toast、有的静默），出问题难查。
 * 这里统一：失败抛 ApiError，调用方只关心「成功后的数据」。
 */

export class ApiError extends Error {
  constructor(message, { status = 0, body = null, permission = "" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.permission = permission;
  }
}

async function request(path, { method = "GET", body, raw = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError("连不上后台服务 —— 检查服务是否还在跑", { status: 0 });
  }

  if (raw) return res;

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 240) };
  }

  if (!res.ok) {
    const msg =
      res.status === 401
        ? "登录已过期，请刷新页面重新登录"
        : data?.error || `请求失败（${res.status}）`;
    throw new ApiError(msg, { status: res.status, body: data, permission: data?.permission ?? "" });
  }
  return data;
}

const enc = encodeURIComponent;

export const api = {
  sites: () => request("/api/sites"),

  kb: ({ kbId, refresh } = {}) => {
    const qs = new URLSearchParams();
    if (kbId) qs.set("kbId", kbId);
    if (refresh) qs.set("refresh", "1");
    const q = qs.toString();
    return request(`/api/kb${q ? `?${q}` : ""}`);
  },
  kbRefresh: () => request("/api/kb/refresh", { method: "POST" }),
  kbItem: (id) => request(`/api/kb/item/${enc(id)}`),

  modules: (site) => request(`/api/sites/${enc(site)}/modules`),
  /** 已构建站点里的页面地址（编排外的固定页也在里面） */
  sitePages: (site) => request(`/api/sites/${enc(site)}/pages`),
  saveModules: (site, plan) => request(`/api/sites/${enc(site)}/modules`, { method: "PUT", body: plan }),
  previewModules: (site, plan) =>
    request(`/api/sites/${enc(site)}/modules/preview`, { method: "POST", body: plan }),
  publishModules: (site, opts = {}) =>
    request(`/api/sites/${enc(site)}/modules/publish${opts.rebuild === false ? "?rebuild=0" : ""}`, {
      method: "POST",
    }),
  review: (site, payload) =>
    request(`/api/sites/${enc(site)}/modules/review`, { method: "POST", body: payload }),

  /** 旧版固定槽位（plan.json） */
  plan: (site) => request(`/api/sites/${enc(site)}/plan`),
  savePlan: (site, plan) => request(`/api/sites/${enc(site)}/plan`, { method: "PUT", body: plan }),
  previewPlan: (site) => request(`/api/sites/${enc(site)}/preview`, { method: "POST" }),
  publishPlan: (site) => request(`/api/sites/${enc(site)}/publish`, { method: "POST" }),

  media: (site) => request(`/api/sites/${enc(site)}/media`),
  uploadMedia: (site, payload) => request(`/api/sites/${enc(site)}/media`, { method: "POST", body: payload }),
  patchMedia: (site, id, patch) =>
    request(`/api/sites/${enc(site)}/media/${enc(id)}`, { method: "PUT", body: patch }),
  delMedia: (site, id) => request(`/api/sites/${enc(site)}/media/${enc(id)}`, { method: "DELETE" }),

  fragments: (site) => request(`/api/sites/${enc(site)}/fragments`),
  createFragment: (site, payload) =>
    request(`/api/sites/${enc(site)}/fragments`, { method: "POST", body: payload }),
  updateFragment: (site, id, patch) =>
    request(`/api/sites/${enc(site)}/fragments/${enc(id)}`, { method: "PUT", body: patch }),
  delFragment: (site, id) =>
    request(`/api/sites/${enc(site)}/fragments/${enc(id)}`, { method: "DELETE" }),

  templates: (site) => request(`/api/sites/${enc(site)}/templates`),
  createTemplate: (site, payload) =>
    request(`/api/sites/${enc(site)}/templates`, { method: "POST", body: payload }),
  updateTemplate: (site, id, patch) =>
    request(`/api/sites/${enc(site)}/templates/${enc(id)}`, { method: "PUT", body: patch }),
  delTemplate: (site, id) =>
    request(`/api/sites/${enc(site)}/templates/${enc(id)}`, { method: "DELETE" }),
  createInstance: (site, payload) =>
    request(`/api/sites/${enc(site)}/template-instances`, { method: "POST", body: payload }),
  updateInstance: (site, id, patch) =>
    request(`/api/sites/${enc(site)}/template-instances/${enc(id)}`, { method: "PUT", body: patch }),
  delInstance: (site, id) =>
    request(`/api/sites/${enc(site)}/template-instances/${enc(id)}`, { method: "DELETE" }),
  generateInstance: (site, id) =>
    request(`/api/sites/${enc(site)}/template-instances/${enc(id)}/generate`, { method: "POST" }),

  history: (site) => request(`/api/sites/${enc(site)}/history`),
  version: (site, id) => request(`/api/sites/${enc(site)}/history/${enc(id)}`),
  diff: (site, versionId) =>
    request(`/api/sites/${enc(site)}/history/diff`, { method: "POST", body: { versionId } }),
  rollback: (site, versionId) =>
    request(`/api/sites/${enc(site)}/history/rollback`, { method: "POST", body: { versionId } }),

  wechat: (payload) => request("/api/wechat/render", { method: "POST", body: payload }),
};

/** 媒体文件的可见地址（后台把站点 media 目录挂在 /media/<site>/ 下） */
export function mediaUrl(siteId, url) {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  if (url.startsWith("/media/")) return `/media/${enc(siteId)}/${enc(url.slice(7))}`;
  return url;
}

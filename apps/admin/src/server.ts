/**
 * 内容后台 —— HTTP 服务。
 *
 * 它是**建站工具链的一部分**，不是独立系统：
 *   知识库（只读） → 后台编排 → plan.json → 构建合并 → 静态站
 *
 * 权限边界（与 geo-kit 的 sync 模块一致）：
 *   - 知识库**只读** —— 后台不写、不删知识条目
 *   - 手写内容包**只读** —— 后台只写 plan.json 和生成的产物
 *   - 知识库内容进站必须**经人工编排** —— 不会自动灌进站点
 *
 * 端口 5105（5100 段已登记给 website-building）。
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  PostgresKnowledgeSource,
  applyPlan,
  emptyPlan,
  isValidPath,
  materializeModulePlan,
  materializePlan,
  modulePlanStats,
  planStats,
  readModulePlan,
  readPlan,
  renderModuleModule,
  renderPlanModule,
  validateModulePlan,
  validatePlan,
  writeModulePlan,
  writePlan,
  type ContentPlan,
  type KnowledgeItem,
  type ModulePlan,
} from "@geokit/geo-kit";

// ── 片段（可复用组件）与版本历史 ─────────────────────────
//
// 这两块都是「后台管的机器可写层」：
//   fragments.json      片段库（一份内容多处引用）
//   history/<版本号>.json 编排快照（发布留档、可对比、可回滚）

import {
  diffPlans,
  moduleToFragment,
  readFragmentLibrary,
  readVersionIndex,
  readVersionPlan,
  rollbackToVersion,
  snapshotPlan,
  validateFragment,
  writeFragmentLibrary,
  type FragmentMap,
} from "@geokit/geo-kit";

import { DATABASE_URL, HAS_DB, HOST, PORT, SITES_DIR, listSites } from "./config.ts";
import { rebuildSite } from "./build.ts";
import { writeFile, rm } from "node:fs/promises";
import {
  ensureMediaDir,
  mediaDir,
  newMediaId,
  readMediaLibrary,
  safeMediaName,
  validateMediaUpload,
  writeMediaLibrary,
  MEDIA_DIR,
  type MediaAsset,
} from "@geokit/geo-kit";
import { renderPage } from "./ui.ts";
import {
  can,
  denyMessage,
  permissionsOf,
  ROLE_PERMISSIONS,
  type Permission,
} from "./rbac.ts";
import {
  AUTH_ENABLED,
  CASDOOR_CLIENT_ID,
  CASDOOR_CLIENT_SECRET,
  CASDOOR_ENDPOINT,
  CASDOOR_EXTERNAL_ENDPOINT,
  CASDOOR_ORGANIZATION,
  CASDOOR_REDIRECT_URI,
} from "./config.ts";
import {
  docToWechatHtml,
  docToWechatText,
  wechatArticleHtml,
  type WechatTheme,
} from "@geokit/geo-kit";
import type { RichTextDoc } from "@geokit/geo-kit";
import {
  authorizeUrl,
  exchangeCode,
  fetchUserInfo,
  toUser,
  verifyJwt,
  CasdoorError,
  type CasdoorSettings,
} from "./casdoor.ts";
import {
  clearSessionCookie,
  currentUser,
  setSessionCookie,
  signSession,
  type SessionUser,
} from "./session.ts";
import { randomBytes } from "node:crypto";

// ── Casdoor 设置 ────────────────────────────────────────

const casdoorSettings: CasdoorSettings = {
  externalEndpoint: CASDOOR_EXTERNAL_ENDPOINT,
  endpoint: CASDOOR_ENDPOINT,
  clientId: CASDOOR_CLIENT_ID,
  clientSecret: CASDOOR_CLIENT_SECRET,
  organization: CASDOOR_ORGANIZATION,
  redirectUri: CASDOOR_REDIRECT_URI,
};

// 授权流程的一次性 state（防 CSRF）—— 进程内存，单实例部署够用
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 5 * 60_000;

function issueState(): string {
  const state = randomBytes(24).toString("base64url");
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  // 顺手清过期
  for (const [k, exp] of pendingStates) {
    if (exp < Date.now()) pendingStates.delete(k);
  }
  return state;
}

function consumeState(state: string): boolean {
  const exp = pendingStates.get(state);
  pendingStates.delete(state);
  return exp !== undefined && exp > Date.now();
}

// ── 登录守卫 ────────────────────────────────────────────

function redirectToLogin(res: ServerResponse, path: string): void {
  const state = issueState();
  // 记住用户想去哪，登录完送回去
  nextPaths.set(state, path);
  res.writeHead(302, { Location: authorizeUrl(casdoorSettings, state) });
  res.end();
}

/** state → 想去的原始路径 */
const nextPaths = new Map<string, string>();

// ── 数据源 ──────────────────────────────────────────────
// 只读连接。进程启动时建一次，请求复用。

let source: PostgresKnowledgeSource | null = null;

async function getSource(): Promise<PostgresKnowledgeSource | null> {
  if (!HAS_DB) return null;
  if (!source) {
    source = new PostgresKnowledgeSource({ connectionString: DATABASE_URL });
  }
  return source;
}

async function closeSource(): Promise<void> {
  if (source) {
    await source.close();
    source = null;
  }
}

// ── 知识库缓存 ──────────────────────────────────────────
// 知识库变动不频繁，但后台会反复拉。缓存 30 秒，避免每次翻页都打库。

let kbCache: { at: number; bases: unknown[]; itemsByKb: Map<string, KnowledgeItem[]> } | null = null;
const KB_TTL = 30_000;

async function loadKnowledge(force = false) {
  if (!force && kbCache && Date.now() - kbCache.at < KB_TTL) return kbCache;

  const src = await getSource();
  if (!src) return null;

  const bases = await src.listBases();
  const itemsByKb = new Map<string, KnowledgeItem[]>();

  // 隐含的 default 库 —— 早期入库的条目挂在这里，但 knowledge_bases 表无对应行。
  const kbIds = [...bases.map((b) => b.id), "default"];
  for (const id of kbIds) {
    itemsByKb.set(id, await src.listItems(id));
  }

  kbCache = { at: Date.now(), bases, itemsByKb };
  return kbCache;
}

// ── HTTP 工具 ───────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function siteDir(id: string): string | null {
  // 防目录穿越 —— siteId 只能是单层目录名
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return resolve(SITES_DIR, id);
}

/**
 * 读片段库并转成查找表。
 *
 * 编排里引用片段时，物化与校验都要按**展开后的内容**走，
 * 所以两条链路都得拿到同一份片段表。
 */
async function loadFragments(
  dir: string,
  siteId: string,
): Promise<{ lib: Awaited<ReturnType<typeof readFragmentLibrary>>; map: FragmentMap }> {
  const lib = await readFragmentLibrary(dir, siteId);
  const map: FragmentMap = new Map(lib.fragments.map((f) => [f.id, f]));
  return { lib, map };
}

/** 操作者 —— 有会话用会话里的用户名，没有就记「本地」 */
function actorOf(user: { name?: string; displayName?: string } | null): string {
  return user?.name?.trim() || user?.displayName?.trim() || "本地";
}

// ── 路由 ────────────────────────────────────────────────

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  try {
    // GET /healthz —— 部署探活（**不鉴权**，healthcheck 用）
    //
    // 不查数据库：知识库不可用时后台仍能启动、能展示界面，
    // 只是编排功能不可用。这种情况不该判定为「服务不健康」。
    if (req.method === "GET" && path === "/healthz") {
      json(res, 200, { ok: true, db: HAS_DB ? "configured" : "unconfigured" });
      return;
    }

    // ── Casdoor 登录流程（鉴权开启时才有意义）────────────
    //
    // 完整链路：
    //   未登录访问后台 → 302 到 Casdoor 授权页（带 state）
    //   → Casdoor 回跳 /oauth2/callback?code=...&state=...
    //   → 核销 state（防 CSRF/重放）→ code 换 access_token
    //   → **本地 JWKS 验签**（不走 introspect，见 casdoor.ts）
    //   → 组织校验 → 签发本地会话 cookie → 送回原页面

    // GET /oauth2/callback —— Casdoor 回跳
    if (req.method === "GET" && path === "/oauth2/callback") {
      if (!AUTH_ENABLED) {
        text(res, 404, "鉴权未开启");
        return;
      }
      const err = url.searchParams.get("error");
      if (err) {
        text(res, 400, `Casdoor 授权被拒绝：${err}`);
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") ?? "";
      if (!code || !consumeState(state)) {
        text(res, 400, "state 无效或已过期（可能被重放），请重新登录");
        return;
      }
      try {
        const accessToken = await exchangeCode(casdoorSettings, code);
        const claims = await verifyJwt(casdoorSettings, accessToken);
        const info = await fetchUserInfo(casdoorSettings, accessToken);
        const user = toUser(claims, info, CASDOOR_ORGANIZATION);
        setSessionCookie(res, signSession(user));
        const next = nextPaths.get(state) ?? "/";
        nextPaths.delete(state);
        res.writeHead(302, { Location: next });
        res.end();
      } catch (e) {
        if (e instanceof CasdoorError) {
          json(res, e.statusCode, { error: e.message, detail: e.detail });
        } else {
          throw e;
        }
      }
      return;
    }

    // GET /logout —— 清会话（Casdoor 侧的单点登出不在此处理）
    if (req.method === "GET" && path === "/logout") {
      clearSessionCookie(res);
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }

    // ── 登录守卫 ────────────────────────────────────────
    //
    // /healthz 与登录流程已在上面放行；其余路径在 AUTH_ENABLED 时都要会话。
    // API 请求回 401 JSON（fetch 要的是可判定的状态码，不是 302）；
    // 页面请求 302 去登录。
    const user = AUTH_ENABLED ? currentUser(req) : null;
    if (AUTH_ENABLED && !user) {
      if (path.startsWith("/api/")) {
        json(res, 401, { error: "未登录" });
        return;
      }
      if (req.method === "GET") {
        redirectToLogin(res, path);
        return;
      }
      text(res, 401, "未登录");
      return;
    }

    // ── 权限 ────────────────────────────────────────────
    //
    // 认证解决「你是谁」，权限解决「你能干什么」。
    // 未开鉴权（开发模式）= 全权限，否则开发机根本没法用。
    const perms: Set<Permission> = AUTH_ENABLED
      ? permissionsOf(user)
      : new Set<Permission>(ROLE_PERMISSIONS.admin);

    /** 权限不足就 403 —— 直接返回 false 让调用方收尾 */
    const requirePerm = (perm: Permission): boolean => {
      if (perms.has(perm)) return true;
      json(res, 403, { error: denyMessage(perm), permission: perm });
      return false;
    };

    // GET / 和 /admin —— 后台界面（把当前用户注入给界面显示）
    if (req.method === "GET" && (path === "/" || path === "/admin")) {
      const html = await renderPage(user ?? undefined, [...perms]);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }

    // GET /api/sites —— 站点列表
    if (req.method === "GET" && path === "/api/sites") {
      json(res, 200, { sites: await listSites() });
      return;
    }

    // GET /api/kb —— 知识库（库 + 条目）
    if (req.method === "GET" && path === "/api/kb") {
      if (!HAS_DB) {
        json(res, 503, {
          error: "未配置知识库连接串",
          hint: "设置 KNOWLEDGE_DATABASE_URL 后重启后台",
        });
        return;
      }
      const kb = await loadKnowledge(url.searchParams.get("refresh") === "1");
      if (!kb) {
        json(res, 503, { error: "知识库不可用" });
        return;
      }
      const kbId = url.searchParams.get("kbId");
      const items = kbId
        ? (kb.itemsByKb.get(kbId) ?? [])
        : [...kb.itemsByKb.values()].flat();

      // 列表接口不返回正文 —— 正文按需单独取，避免几百 KB 的响应
      json(res, 200, {
        bases: kb.bases,
        items: items.map((i) => ({
          id: i.id,
          kb_id: i.kb_id,
          title: i.title,
          summary: i.summary,
          tags: i.tags,
          sync_status: i.sync_status,
          source_type: i.source_type,
          updated_at: i.updated_at,
          content_length: i.content?.length ?? 0,
        })),
      });
      return;
    }

    // GET /api/kb/item/:id —— 条目全文（编排时要看正文）
    const itemMatch = path.match(/^\/api\/kb\/item\/([^/]+)$/);
    if (req.method === "GET" && itemMatch) {
      const kb = await loadKnowledge();
      if (!kb) {
        json(res, 503, { error: "知识库不可用" });
        return;
      }
      const id = decodeURIComponent(itemMatch[1]);
      for (const items of kb.itemsByKb.values()) {
        const found = items.find((i) => i.id === id);
        if (found) {
          json(res, 200, found);
          return;
        }
      }
      json(res, 404, { error: "条目不存在" });
      return;
    }

    // GET /api/sites/:id/plan —— 读计划
    const planGet = path.match(/^\/api\/sites\/([^/]+)\/plan$/);
    if (req.method === "GET" && planGet) {
      const dir = siteDir(planGet[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const plan = await readPlan(dir, planGet[1]);
      json(res, 200, { plan, stats: planStats(plan) });
      return;
    }

    // PUT /api/sites/:id/plan —— 写计划
    const planPut = path.match(/^\/api\/sites\/([^/]+)\/plan$/);
    if (req.method === "PUT" && planPut) {
      const dir = siteDir(planPut[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const body = await readBody(req);
      let plan: ContentPlan;
      try {
        plan = JSON.parse(body) as ContentPlan;
      } catch {
        json(res, 400, { error: "计划不是合法 JSON" });
        return;
      }
      if (!Array.isArray(plan.entries)) {
        json(res, 400, { error: "计划缺少 entries" });
        return;
      }
      plan.version = 1;
      plan.siteId = planPut[1];
      plan.updatedAt = new Date().toISOString();

      await writePlan(dir, plan);
      json(res, 200, { ok: true, stats: planStats(plan) });
      return;
    }

    // ── 模块编排（页面 → 模块 → 条目）────────────────────
    //
    // 路由设计：整份编排一个 PUT（后台界面自己维护整棵树），
    // 单条增删改查走同一份 JSON —— 避免多个写入口互相覆盖。
    // 对后台这种「一次编辑、整体保存」的工具，整体 PUT 最不容易出错。

    // GET /api/sites/:id/modules —— 读模块编排
    const modulesGet = path.match(/^\/api\/sites\/([^/]+)\/modules$/);
    if (req.method === "GET" && modulesGet) {
      const dir = siteDir(modulesGet[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const plan = await readModulePlan(dir, modulesGet[1]);
      const { map } = await loadFragments(dir, modulesGet[1]);
      json(res, 200, {
        plan,
        stats: modulePlanStats(plan, map),
        // 片段表一起给 —— 后台的模块面板要显示「引用片段」与「脱离引用」
        fragments: [...map.values()],
      });
      return;
    }

    // PUT /api/sites/:id/modules —— 写模块编排（整份）
    const modulesPut = path.match(/^\/api\/sites\/([^/]+)\/modules$/);
    if (req.method === "PUT" && modulesPut) {
      if (!requirePerm("content.edit")) return;
      const dir = siteDir(modulesPut[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const body = await readBody(req);
      let plan: ModulePlan;
      try {
        plan = JSON.parse(body) as ModulePlan;
      } catch {
        json(res, 400, { error: "编排不是合法 JSON" });
        return;
      }
      if (!Array.isArray(plan.pages)) {
        json(res, 400, { error: "编排缺少 pages" });
        return;
      }
      plan.version = 1;
      plan.siteId = modulesPut[1];
      plan.updatedAt = new Date().toISOString();

      // 路径合法性 —— 防目录穿越与非法路由
      const badPath = plan.pages.find((p) => !isValidPath(p.path));
      if (badPath) {
        json(res, 400, { error: `页面路径非法：${badPath.path}` });
        return;
      }

      await writeModulePlan(dir, plan);
      const { map } = await loadFragments(dir, modulesPut[1]);
      json(res, 200, { ok: true, stats: modulePlanStats(plan, map) });
      return;
    }

    // POST /api/sites/:id/modules/review —— 审核状态变更
    //
    // 三种动作，对应三种权限：
    //   pending   提交审核   —— content.edit 就够（编辑自己提交）
    //   approved  通过       —— content.review
    //   rejected  驳回       —— content.review
    //
    // 「通过/驳回」只有审核员能做，「提交」编辑自己做 ——
    // 这就是编辑与审核分权的落点。
    const modulesReview = path.match(/^\/api\/sites\/([^/]+)\/modules\/review$/);
    if (req.method === "POST" && modulesReview) {
      const body = await readBody(req);
      let payload: {
        pageId?: string;
        moduleId?: string;
        itemId?: string;
        decision?: "pending" | "approved" | "rejected";
        note?: string;
      };
      try {
        payload = JSON.parse(body) as typeof payload;
      } catch {
        json(res, 400, { error: "请求不是合法 JSON" });
        return;
      }
      const decision = payload.decision;
      if (!decision || !["pending", "approved", "rejected"].includes(decision)) {
        json(res, 400, { error: "审核动作必须是 pending / approved / rejected" });
        return;
      }
      // 提交审核是编辑自己的动作；通过与驳回要审核权限
      if (decision !== "pending" && !requirePerm("content.review")) return;
      if (!requirePerm("content.edit")) return;

      const dir = siteDir(modulesReview[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const plan = await readModulePlan(dir, modulesReview[1]);
      let hit = 0;
      for (const page of plan.pages ?? []) {
        if (payload.pageId && page.id !== payload.pageId) continue;
        for (const mod of page.modules ?? []) {
          if (payload.moduleId && mod.id !== payload.moduleId) continue;
          for (const item of mod.items ?? []) {
            if (payload.itemId && item.id !== payload.itemId) continue;
            item.review = decision;
            hit++;
          }
        }
      }
      if (!hit) {
        json(res, 404, { error: "没找到要审核的内容" });
        return;
      }
      plan.updatedAt = new Date().toISOString();
      await writeModulePlan(dir, plan);
      json(res, 200, { ok: true, decision, count: hit });
      return;
    }

    // POST /api/sites/:id/modules/preview —— 预览（不落盘）
    const modulesPreview = path.match(/^\/api\/sites\/([^/]+)\/modules\/preview$/);
    if (req.method === "POST" && modulesPreview) {
      if (!requirePerm("content.edit")) return;
      const dir = siteDir(modulesPreview[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const kb = await loadKnowledge();
      if (!kb) {
        json(res, 503, { error: "知识库不可用" });
        return;
      }
      const allItems = new Map<string, KnowledgeItem>();
      for (const items of kb.itemsByKb.values()) {
        for (const i of items) allItems.set(i.id, i);
      }

      const body = await readBody(req);
      let plan: ModulePlan;
      try {
        plan = JSON.parse(body) as ModulePlan;
      } catch {
        json(res, 400, { error: "编排不是合法 JSON" });
        return;
      }
      if (!Array.isArray(plan.pages)) {
        json(res, 400, { error: "编排缺少 pages" });
        return;
      }

      const { map } = await loadFragments(dir, modulesPreview[1]);
      const { pages, skipped } = materializeModulePlan(plan, allItems, map);
      json(res, 200, {
        pages,
        skipped,
        problems: validateModulePlan(plan, allItems, map),
        stats: modulePlanStats(plan, map),
      });
      return;
    }

    // POST /api/sites/:id/modules/publish —— 物化 + 落盘
    //
    // 产出 content/modules.generated.ts —— 构建时与手写内容包合并。
    // **不碰 site.ts**（分层铁律）。
    const modulesPublish = path.match(
      /^\/api\/sites\/([^/]+)\/modules\/publish$/,
    );
    if (req.method === "POST" && modulesPublish) {
      if (!requirePerm("content.publish")) return;
      const dir = siteDir(modulesPublish[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const kb = await loadKnowledge(true);
      if (!kb) {
        json(res, 503, { error: "知识库不可用" });
        return;
      }
      const allItems = new Map<string, KnowledgeItem>();
      for (const items of kb.itemsByKb.values()) {
        for (const i of items) allItems.set(i.id, i);
      }

      const plan = await readModulePlan(dir, modulesPublish[1]);
      const { map } = await loadFragments(dir, modulesPublish[1]);
      const problems = validateModulePlan(plan, allItems, map);
      const { pages, skipped } = materializeModulePlan(plan, allItems, map);

      // 有 error 级问题就不落盘 —— 发布空壳比不发布更糟
      const errors = problems.filter((p) => p.level === "error");
      if (errors.length > 0) {
        json(res, 400, {
          error: `有 ${errors.length} 个问题未解决 —— 已阻止发布`,
          problems,
          skipped,
        });
        return;
      }

      // ── 留档：把这一版编排存成版本 ────────────────────
      //
      // 为什么要留：**发布是覆盖写** modules.json，
      // 出错只能靠 git 回滚 —— 那太粗（会把别的站点一起带走）。
      // 快照让「回到上一版」变成后台里的一个动作。
      //
      // 留档失败**不阻止发布** —— 版本是辅助功能，
      // 不能因为它坏了就把客户的内容卡住。
      let version: { id: string; createdAt: string } | null = null;
      try {
        const entry = await snapshotPlan(dir, modulesPublish[1], plan, {
          author: actorOf(user),
          reason: "发布",
        });
        version = { id: entry.id, createdAt: entry.createdAt };
      } catch (err) {
        console.error("版本留档失败：", err);
      }

      const { writeFile } = await import("node:fs/promises");
      const outPath = resolve(dir, "content/modules.generated.ts");
      const module = renderModuleModule(
        plan,
        pages,
        new Date().toISOString(),
      );
      await writeFile(outPath, module, "utf8");

      // 顺手把编排本身也写回（发布即定稿）
      plan.updatedAt = new Date().toISOString();
      await writeModulePlan(dir, plan);

      // ── 第二步：重建站点 ─────────────────────────────
      //
      // 物化只是更新了**数据源**（modules.generated.ts）。
      // 静态站伺服的是 out/ 里的 HTML —— 那是 next build 生成的，
      // 不重建的话访客看到的还是旧内容。
      //
      // 「发布」对用户意味着「我改的东西上线了」—— 只物化不重建不算发布完。
      //
      // 跳过的场景：?rebuild=0（只想存产物，自己去构建机重建）
      const skipRebuild = url.searchParams.get("rebuild") === "0";
      let rebuild: Awaited<ReturnType<typeof rebuildSite>> | null = null;

      if (!skipRebuild) {
        rebuild = await rebuildSite(modulesPublish[1]);
      }

      json(res, 200, {
        ok: true,
        problems,
        skipped,
        stats: modulePlanStats(plan, map),
        written: outPath,
        pages: pages.length,
        // 本次发布留下的版本号 —— 出错时去「版本」标签页回滚
        version,
        // 重建结果 —— 失败不算发布失败（产物已落盘），
        // 但必须明确告诉用户「站点还没更新」
        rebuild,
      });
      return;
    }

    // POST /api/sites/:id/publish —— 物化 + 校验
    const publish = path.match(/^\/api\/sites\/([^/]+)\/publish$/);
    if (req.method === "POST" && publish) {
      const dir = siteDir(publish[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const kb = await loadKnowledge(true);
      if (!kb) {
        json(res, 503, { error: "知识库不可用" });
        return;
      }

      const plan = await readPlan(dir, publish[1]);
      const allItems = new Map<string, KnowledgeItem>();
      for (const items of kb.itemsByKb.values()) {
        for (const i of items) allItems.set(i.id, i);
      }

      const problems = validatePlan(plan, allItems);

      // 读手写内容包 —— 只读
      let base;
      try {
        const mod = await import(
          `file://${resolve(dir, "content/site.ts")}?t=${Date.now()}`
        );
        base = (mod.site ?? mod.default) as Parameters<typeof applyPlan>[0];
      } catch (err) {
        json(res, 500, {
          error: `读不到内容包：${err instanceof Error ? err.message : String(err)}`,
        });
        return;
      }

      const { content, skipped } = materializePlan(base, plan, allItems);
      const module = renderPlanModule(plan, content, new Date().toISOString());

      // 写生成的产物（不碰 site.ts）
      const { writeFile } = await import("node:fs/promises");
      const outPath = resolve(dir, "content/plan.generated.ts");
      await writeFile(outPath, module, "utf8");

      json(res, 200, {
        ok: problems.length === 0,
        problems,
        skipped,
        stats: planStats(plan),
        written: outPath,
      });
      return;
    }

    // POST /api/sites/:id/preview —— 预览合并结果（不落盘）
    const preview = path.match(/^\/api\/sites\/([^/]+)\/preview$/);
    if (req.method === "POST" && preview) {
      const dir = siteDir(preview[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const kb = await loadKnowledge();
      if (!kb) {
        json(res, 503, { error: "知识库不可用" });
        return;
      }
      const plan = await readPlan(dir, preview[1]);
      const allItems = new Map<string, KnowledgeItem>();
      for (const items of kb.itemsByKb.values()) {
        for (const i of items) allItems.set(i.id, i);
      }
      const mod = await import(
        `file://${resolve(dir, "content/site.ts")}?t=${Date.now()}`
      );
      const base = (mod.site ?? mod.default) as Parameters<typeof applyPlan>[0];
      const { content, planned, skipped } = applyPlan(base, plan, allItems);

      json(res, 200, {
        // 合并后的完整内容（手写 + 计划）
        insights: content.insights ?? [],
        faq: content.faq ?? [],
        products: content.products ?? [],
        cases: content.cases ?? [],
        // **只有计划产生的内容** —— 后台只对这部分的缺口负责。
        // 手写内容是人工写的，不该出现在「需补齐」清单里。
        planned,
        skipped,
        problems: validatePlan(plan, allItems),
      });
      return;
    }

    // POST /api/kb/refresh —— 强制刷新缓存
    if (req.method === "POST" && path === "/api/kb/refresh") {
      kbCache = null;
      await loadKnowledge(true);
      json(res, 200, { ok: true });
      return;
    }

    // ── 媒体库 ─────────────────────────────────────────
    //
    // 图片等静态资源的统一管理。
    // 文件落在站点 public/media/ —— 构建时随 public/ 进静态站，
    // 所以零额外配置就能被访问。清单落在 media.json。

    // GET /api/sites/:id/media —— 列出资产
    const mediaGet = path.match(/^\/api\/sites\/([^/]+)\/media$/);
    if (req.method === "GET" && mediaGet) {
      const dir = siteDir(mediaGet[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const lib = await readMediaLibrary(dir, mediaGet[1]);
      json(res, 200, { assets: lib.assets, updatedAt: lib.updatedAt });
      return;
    }

    // POST /api/sites/:id/media —— 上传（base64 JSON，不用 multipart）
    const mediaPost = path.match(/^\/api\/sites\/([^/]+)\/media$/);
    if (req.method === "POST" && mediaPost) {
      if (!requirePerm("content.edit")) return;
      const dir = siteDir(mediaPost[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const body = await readBody(req);
      let payload: {
        filename?: string;
        mime?: string;
        data?: string;
        alt?: string;
        caption?: string;
        category?: string;
      };
      try {
        payload = JSON.parse(body) as typeof payload;
      } catch {
        json(res, 400, { error: "请求不是合法 JSON" });
        return;
      }

      const dataUrl = payload.data ?? "";
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      if (!base64) {
        json(res, 400, { error: "缺文件数据" });
        return;
      }

      // MIME 由浏览器给出，但**以文件扩展名为准**（有些客户端伪造 MIME）
      const filename = payload.filename ?? "upload";
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const mimeByExt: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        svg: "image/svg+xml",
        avif: "image/avif",
      };
      const mime = mimeByExt[ext] ?? payload.mime ?? "";

      const buf = Buffer.from(base64, "base64");
      const problems = validateMediaUpload({
        filename,
        mime,
        size: buf.length,
        alt: payload.alt,
      });
      // alt 缺失只是提醒，其余是硬性拒绝
      const errors = problems.filter((p) => !p.includes("替代文本"));
      if (errors.length) {
        json(res, 400, { error: errors.join("；"), problems });
        return;
      }

      const id = newMediaId();
      const name = safeMediaName(filename);
      const mediaRoot = await ensureMediaDir(dir);
      const filePath = resolve(mediaRoot, name);
      await writeFile(filePath, buf);

      const asset: MediaAsset = {
        id,
        url: `/${MEDIA_DIR}/${name}`,
        filename,
        mime,
        size: buf.length,
        alt: payload.alt ?? "",
        caption: payload.caption,
        category: payload.category,
        uploadedAt: new Date().toISOString(),
      };

      const lib = await readMediaLibrary(dir, mediaPost[1]);
      lib.assets.push(asset);
      lib.updatedAt = new Date().toISOString();
      await writeMediaLibrary(dir, lib);

      json(res, 200, { ok: true, asset, warnings: problems });
      return;
    }

    // PUT /api/sites/:id/media/:assetId —— 改 alt / 说明 / 分类
    const mediaPut = path.match(/^\/api\/sites\/([^/]+)\/media\/([^/]+)$/);
    if (req.method === "PUT" && mediaPut) {
      if (!requirePerm("content.edit")) return;
      const dir = siteDir(mediaPut[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const body = await readBody(req);
      let patch: Partial<MediaAsset>;
      try {
        patch = JSON.parse(body) as Partial<MediaAsset>;
      } catch {
        json(res, 400, { error: "请求不是合法 JSON" });
        return;
      }
      const lib = await readMediaLibrary(dir, mediaPut[1]);
      const asset = lib.assets.find((a) => a.id === mediaPut[2]);
      if (!asset) {
        json(res, 404, { error: "资产不存在" });
        return;
      }
      if (patch.alt !== undefined) asset.alt = patch.alt;
      if (patch.caption !== undefined) asset.caption = patch.caption;
      if (patch.category !== undefined) asset.category = patch.category;
      if (patch.filename !== undefined) asset.filename = patch.filename;
      lib.updatedAt = new Date().toISOString();
      await writeMediaLibrary(dir, lib);
      json(res, 200, { ok: true, asset });
      return;
    }

    // DELETE /api/sites/:id/media/:assetId —— 删资产（连文件一起删）
    const mediaDel = path.match(/^\/api\/sites\/([^/]+)\/media\/([^/]+)$/);
    if (req.method === "DELETE" && mediaDel) {
      if (!requirePerm("content.edit")) return;
      const dir = siteDir(mediaDel[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const lib = await readMediaLibrary(dir, mediaDel[1]);
      const idx = lib.assets.findIndex((a) => a.id === mediaDel[2]);
      if (idx < 0) {
        json(res, 404, { error: "资产不存在" });
        return;
      }
      const asset = lib.assets[idx];
      lib.assets.splice(idx, 1);
      lib.updatedAt = new Date().toISOString();
      await writeMediaLibrary(dir, lib);

      // 文件删掉（不在清单里的孤儿文件不管）
      try {
        await rm(resolve(mediaDir(dir), asset.url.split("/").pop() ?? ""), {
          force: true,
        });
      } catch {
        /* 文件删不掉不阻塞 —— 清单已更新 */
      }
      json(res, 200, { ok: true });
      return;
    }

    // ── 可复用片段（片段 = 可复用的模块）────────────────
    //
    // 一份内容多处引用 —— 「公司简介」「联系方式」「常见问题」这类
    // 在企业门户里反复出现的内容。复制粘贴会让客户改一次要改三处，
    // 漏一处线上就自相矛盾（AI 抓取时当成两个实体）。
    //
    // 片段落在 sites/<id>/fragments.json —— 与 modules.json 同级。

    // GET /api/sites/:id/fragments —— 列出片段
    const fragmentsGet = path.match(/^\/api\/sites\/([^/]+)\/fragments$/);
    if (req.method === "GET" && fragmentsGet) {
      const dir = siteDir(fragmentsGet[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const lib = await readFragmentLibrary(dir, fragmentsGet[1]);
      // 片段也要过一遍校验 —— 片段里的条目按现有模块类型的规则查，
      // 不然「引用一个坏片段」会等到发布时才炸。
      const kb = await loadKnowledge();
      const allItems = new Map<string, KnowledgeItem>();
      if (kb) {
        for (const items of kb.itemsByKb.values()) {
          for (const i of items) allItems.set(i.id, i);
        }
      }
      const problems = kb
        ? lib.fragments.flatMap((f) =>
            validateFragment(f, allItems).map((p) => ({ ...p, fragmentId: f.id })),
          )
        : [];
      json(res, 200, {
        fragments: lib.fragments,
        updatedAt: lib.updatedAt,
        problems,
      });
      return;
    }

    // POST /api/sites/:id/fragments —— 从一个模块「存为片段」
    const fragmentsPost = path.match(/^\/api\/sites\/([^/]+)\/fragments$/);
    if (req.method === "POST" && fragmentsPost) {
      if (!requirePerm("content.edit")) return;
      const dir = siteDir(fragmentsPost[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const body = await readBody(req);
      let payload: {
        name?: string;
        description?: string;
        module?: Partial<ModulePlan["pages"][number]["modules"][number]>;
      };
      try {
        payload = JSON.parse(body) as typeof payload;
      } catch {
        json(res, 400, { error: "请求不是合法 JSON" });
        return;
      }
      if (!payload.module) {
        json(res, 400, { error: "缺少模块内容 —— 片段必须从一段真实内容来" });
        return;
      }

      const module = payload.module;
      const fragment = moduleToFragment(
        {
          id: "",
          type: module.type ?? "rich-text",
          title: module.title,
          subtitle: module.subtitle,
          items: module.items ?? [],
          props: module.props,
          order: 0,
          enabled: true,
        },
        payload.name ?? module.title ?? "未命名片段",
        payload.description,
      );

      const lib = await readFragmentLibrary(dir, fragmentsPost[1]);
      lib.fragments.push(fragment);
      lib.updatedAt = new Date().toISOString();
      await writeFragmentLibrary(dir, lib);

      json(res, 200, { ok: true, fragment });
      return;
    }

    // PUT /api/sites/:id/fragments/:fid —— 改名 / 改说明 / 改内容
    const fragmentsPut = path.match(
      /^\/api\/sites\/([^/]+)\/fragments\/([^/]+)$/,
    );
    if (req.method === "PUT" && fragmentsPut) {
      if (!requirePerm("content.edit")) return;
      const dir = siteDir(fragmentsPut[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const body = await readBody(req);
      let patch: {
        name?: string;
        description?: string;
        module?: Partial<ModulePlan["pages"][number]["modules"][number]>;
      };
      try {
        patch = JSON.parse(body) as typeof patch;
      } catch {
        json(res, 400, { error: "请求不是合法 JSON" });
        return;
      }

      const lib = await readFragmentLibrary(dir, fragmentsPut[1]);
      const fragment = lib.fragments.find((f) => f.id === fragmentsPut[2]);
      if (!fragment) {
        json(res, 404, { error: "片段不存在" });
        return;
      }
      if (patch.name !== undefined) fragment.name = patch.name;
      if (patch.description !== undefined) fragment.description = patch.description;
      if (patch.module) {
        const m = patch.module;
        if (m.type) fragment.type = m.type;
        if (m.title !== undefined) fragment.title = m.title;
        if (m.subtitle !== undefined) fragment.subtitle = m.subtitle;
        if (m.items) fragment.items = m.items;
        if (m.props !== undefined) fragment.props = m.props;
      }
      fragment.updatedAt = new Date().toISOString();
      lib.updatedAt = fragment.updatedAt;
      await writeFragmentLibrary(dir, lib);

      json(res, 200, { ok: true, fragment });
      return;
    }

    // DELETE /api/sites/:id/fragments/:fid —— 删片段
    //
    // 被引用着的话要拦一下 —— 直接删会让引用它的页面校验失败。
    // 真的要删就带 ?force=1（后台界面会提示用户先脱离引用）。
    const fragmentsDel = path.match(
      /^\/api\/sites\/([^/]+)\/fragments\/([^/]+)$/,
    );
    if (req.method === "DELETE" && fragmentsDel) {
      if (!requirePerm("content.edit")) return;
      const dir = siteDir(fragmentsDel[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const lib = await readFragmentLibrary(dir, fragmentsDel[1]);
      const idx = lib.fragments.findIndex((f) => f.id === fragmentsDel[2]);
      if (idx < 0) {
        json(res, 404, { error: "片段不存在" });
        return;
      }

      if (url.searchParams.get("force") !== "1") {
        const plan = await readModulePlan(dir, fragmentsDel[1]);
        const used: string[] = [];
        for (const page of plan.pages ?? []) {
          for (const m of page.modules ?? []) {
            if (m.fragmentId === fragmentsDel[2]) {
              used.push(`${page.title || page.path} › ${m.title || m.type}`);
            }
          }
        }
        if (used.length) {
          json(res, 409, {
            error: `片段正在被 ${used.length} 处引用 —— 先改成自有内容再删`,
            used,
          });
          return;
        }
      }

      lib.fragments.splice(idx, 1);
      lib.updatedAt = new Date().toISOString();
      await writeFragmentLibrary(dir, lib);
      json(res, 200, { ok: true });
      return;
    }

    // ── 版本历史（快照 / 对比 / 回滚）────────────────────
    //
    // 每次发布留一份快照在 sites/<id>/history/，
    // 出错时不用靠 git 回滚 —— 那会把别的站点一起带走。

    // POST /api/sites/:id/history/diff —— 对比某版本与当前
    const historyDiff = path.match(/^\/api\/sites\/([^/]+)\/history\/diff$/);
    if (req.method === "POST" && historyDiff) {
      const dir = siteDir(historyDiff[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const body = await readBody(req);
      let payload: { versionId?: string };
      try {
        payload = JSON.parse(body) as typeof payload;
      } catch {
        json(res, 400, { error: "请求不是合法 JSON" });
        return;
      }
      if (!payload.versionId) {
        json(res, 400, { error: "缺少版本号" });
        return;
      }
      const versionPlan = await readVersionPlan(dir, payload.versionId);
      if (!versionPlan) {
        json(res, 404, { error: "版本不存在" });
        return;
      }
      const current = await readModulePlan(dir, historyDiff[1]);
      const diff = diffPlans(versionPlan, current);
      json(res, 200, {
        versionId: payload.versionId,
        diff,
        current: modulePlanStats(current),
      });
      return;
    }

    // POST /api/sites/:id/history/rollback —— 回滚到某个版本
    const historyRollback = path.match(
      /^\/api\/sites\/([^/]+)\/history\/rollback$/,
    );
    if (req.method === "POST" && historyRollback) {
      if (!requirePerm("content.edit")) return;
      const dir = siteDir(historyRollback[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const body = await readBody(req);
      let payload: { versionId?: string };
      try {
        payload = JSON.parse(body) as typeof payload;
      } catch {
        json(res, 400, { error: "请求不是合法 JSON" });
        return;
      }
      if (!payload.versionId) {
        json(res, 400, { error: "缺少版本号" });
        return;
      }
      const index = await readVersionIndex(dir, historyRollback[1]);
      const entry = index.versions.find((v) => v.id === payload.versionId);
      if (!entry) {
        json(res, 404, { error: "版本不存在" });
        return;
      }

      // 回滚的逻辑在 geo-kit 里（版本快照 → 写回编排 → 再留一档）
      const result = await rollbackToVersion(
        dir,
        historyRollback[1],
        payload.versionId,
        { author: actorOf(user) },
      );
      if (!result) {
        json(res, 404, { error: "版本快照已丢失" });
        return;
      }

      json(res, 200, {
        ok: true,
        version: result.version,
        stats: modulePlanStats(result.restored),
        hint: "已恢复编排 —— 点「发布并重建」让站点生效",
      });
      return;
    }

    // GET /api/sites/:id/history —— 版本列表
    const historyList = path.match(/^\/api\/sites\/([^/]+)\/history$/);
    if (req.method === "GET" && historyList) {
      const dir = siteDir(historyList[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const index = await readVersionIndex(dir, historyList[1]);
      json(res, 200, { versions: index.versions, updatedAt: index.updatedAt });
      return;
    }

    // GET /api/sites/:id/history/:vid —— 某个版本（含编排快照）
    const historyGet = path.match(/^\/api\/sites\/([^/]+)\/history\/([^/]+)$/);
    if (req.method === "GET" && historyGet) {
      const dir = siteDir(historyGet[1]);
      if (!dir) {
        json(res, 400, { error: "站点 id 非法" });
        return;
      }
      const index = await readVersionIndex(dir, historyGet[1]);
      const entry = index.versions.find((v) => v.id === historyGet[2]);
      const plan = await readVersionPlan(dir, historyGet[2]);
      if (!entry && !plan) {
        json(res, 404, { error: "版本不存在" });
        return;
      }
      json(res, 200, { entry: entry ?? null, plan });
      return;
    }

    // ── 公众号排版 ─────────────────────────────────────
    //
    // 渲染逻辑放在服务端（geo-kit 里只有一份实现，浏览器端不重复写）。
    // 前端预览与「复制到微信」走同一个接口 —— 所见即所得。
    //
    // bare: 只返回正文（复制到微信时用，标题在微信里单独填）
    // plain: 返回纯文本
    if (req.method === "POST" && path === "/api/wechat/render") {
      const body = await readBody(req);
      let req_: {
        doc?: unknown;
        title?: string;
        author?: string;
        theme?: string;
        bare?: boolean;
        plain?: boolean;
      };
      try {
        req_ = JSON.parse(body) as typeof req_;
      } catch {
        json(res, 400, { error: "请求不是合法 JSON" });
        return;
      }

      const doc = req_.doc as RichTextDoc | undefined;
      const theme = (req_.theme ?? "default") as WechatTheme;

      if (req_.plain) {
        json(res, 200, { text: docToWechatText(doc) });
        return;
      }

      if (req_.bare) {
        // 剥掉外层 section —— 微信编辑器里标题与作者单独填更灵活
        const html = docToWechatHtml(doc, theme);
        json(res, 200, { html });
        return;
      }

      json(res, 200, {
        html: wechatArticleHtml(doc, {
          title: req_.title,
          author: req_.author,
          theme,
        }),
      });
      return;
    }

    json(res, 404, { error: `未知路径 ${req.method} ${path}` });
  } catch (err) {
    json(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── 启动 ────────────────────────────────────────────────

const server = createServer((req, res) => {
  void handle(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`▸ 内容后台：http://${HOST}:${PORT}`);
  console.log(`▸ 站点目录：${SITES_DIR}`);
  console.log(
    HAS_DB
      ? "▸ 知识库：已连接（只读）"
      : "▸ 知识库：未配置 KNOWLEDGE_DATABASE_URL —— 编排功能不可用",
  );
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void closeSource().finally(() => {
      server.close(() => process.exit(0));
    });
  });
}

// 兜底：读不到首页文件时也要能起来
process.on("uncaughtException", (err) => {
  console.error("未捕获异常：", err);
});

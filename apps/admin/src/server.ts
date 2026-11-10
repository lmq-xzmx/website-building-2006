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

import { DATABASE_URL, HAS_DB, HOST, PORT, SITES_DIR, listSites } from "./config.ts";
import { renderPage } from "./ui.ts";
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

    // GET / 和 /admin —— 后台界面（把当前用户注入给界面显示）
    if (req.method === "GET" && (path === "/" || path === "/admin")) {
      const html = await renderPage(user ?? undefined);
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
      json(res, 200, { plan, stats: modulePlanStats(plan) });
      return;
    }

    // PUT /api/sites/:id/modules —— 写模块编排（整份）
    const modulesPut = path.match(/^\/api\/sites\/([^/]+)\/modules$/);
    if (req.method === "PUT" && modulesPut) {
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
      json(res, 200, { ok: true, stats: modulePlanStats(plan) });
      return;
    }

    // POST /api/sites/:id/modules/preview —— 预览（不落盘）
    const modulesPreview = path.match(/^\/api\/sites\/([^/]+)\/modules\/preview$/);
    if (req.method === "POST" && modulesPreview) {
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

      const { pages, skipped } = materializeModulePlan(plan, allItems);
      json(res, 200, {
        pages,
        skipped,
        problems: validateModulePlan(plan, allItems),
        stats: modulePlanStats(plan),
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
      const problems = validateModulePlan(plan, allItems);
      const { pages, skipped } = materializeModulePlan(plan, allItems);

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

      json(res, 200, {
        ok: true,
        problems,
        skipped,
        stats: modulePlanStats(plan),
        written: outPath,
        pages: pages.length,
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

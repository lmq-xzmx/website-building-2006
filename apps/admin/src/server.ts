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
  materializePlan,
  planStats,
  readPlan,
  renderPlanModule,
  validatePlan,
  writePlan,
  type ContentPlan,
  type KnowledgeItem,
} from "@geokit/geo-kit";

import { DATABASE_URL, HAS_DB, HOST, PORT, SITES_DIR, listSites } from "./config.ts";
import { renderPage } from "./ui.ts";

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
    // GET /healthz —— 部署探活
    //
    // 不查数据库：知识库不可用时后台仍能启动、能展示界面，
    // 只是编排功能不可用。这种情况不该判定为「服务不健康」。
    if (req.method === "GET" && path === "/healthz") {
      json(res, 200, { ok: true, db: HAS_DB ? "configured" : "unconfigured" });
      return;
    }

    // GET / —— 后台界面
    if (req.method === "GET" && path === "/") {
      const html = await renderPage();
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

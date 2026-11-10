/**
 * 知识库数据源 —— 从 geo-knowledge 的 Postgres 读取知识条目。
 *
 * 为什么直连数据库而不是走 GEO-K API：
 *   1. API 需要登录态 token（casdoor），同步程序还要处理鉴权刷新；
 *   2. API 是分页的，同步几千条要几十次往返；直连一次查询拿完。
 *   3. 数据库是**只读**访问，同步程序不写入 —— 零污染风险。
 *
 * 数据源可替换：WeKnora 直连、GEO-K API —— 只要实现 KnowledgeSource 接口。
 * 这样同步器的核心逻辑（筛选/映射/去重）与数据获取解耦。
 *
 * ── 两种实现 ────────────────────────────────────────────────
 *   - PostgresKnowledgeSource：形态 A（站点与 GEO-K 同在 457）—— 读 GEO-K 的库
 *   - WeKnoraKnowledgeSource：形态 B / C（站点机没有 GEO-K）—— 直连 WeKnora API
 *
 * WeKnora 实现严格照 contracts/weknora-api/README.md 走：
 *   列库 GET  /api/v1/knowledge-bases
 *   检索 POST /api/v1/knowledge-search
 *   认证头 X-API-Key
 */

import type { KnowledgeBase, KnowledgeItem } from "./knowledge-sync.js";

export type { KnowledgeBase, KnowledgeItem } from "./knowledge-sync.js";

/** 知识库数据源 */
export interface KnowledgeSource {
  /** 列知识库 */
  listBases(): Promise<KnowledgeBase[]>;
  /**
   * 列某库的条目。
   *
   * query 是可选的：PG 实现不需要（直接查表），WeKnora 实现需要
   * （检索式拉取，得有检索词）。加在末尾且可选 → 现有实现不用改。
   */
  listItems(kbId: string, query?: string): Promise<KnowledgeItem[]>;
  /** 关闭连接 */
  close?(): Promise<void>;
  /**
   * 数据源种类 —— 编排层据此走不同的选库策略。
   *
   * 可选：现有实现不写也不影响（走通用路径）。
   */
  readonly kind?: "postgres" | "weknora";
}

/** Postgres 数据源配置 */
export interface PostgresSourceOptions {
  /** 连接串，如 postgres://geo:xxx@localhost:15432/geo_knowledge */
  connectionString: string;
  /** 只读的 pg client 工厂（便于测试注入） */
  createClient?: (connectionString: string) => PgLike | Promise<PgLike>;
}

/** 最小 pg 接口 —— 避免强依赖 pg 的类型 */
export interface PgLike {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
  end(): Promise<void>;
}

/**
 * 构造一个最小 pg client。
 *
 * 动态 import pg —— 它是可选依赖（只有要跑同步才需要），
 * 核心库的其余部分不应该因为缺 pg 而跑不起来。
 * 用 import() 而非 require()：本包是 ESM，require 不可用。
 *
 * 关键：pg 的 Client **必须先 connect()** 才能 query ——
 * 不调 connect 时 query 会挂起，进程静默退出（无错误输出）。
 */
async function defaultCreateClient(connectionString: string): Promise<PgLike> {
  const { Client } = (await import("pg")) as unknown as {
    Client: new (cfg: { connectionString: string }) => PgClient;
  };
  const client = new Client({ connectionString });
  await client.connect();

  return {
    async query<T>(sql: string, params?: unknown[]) {
      const res = await client.query(sql, params);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
    },
    async end() {
      await client.end();
    },
  };
}

/** 把 pg 返回的时间值统一成 ISO 字符串。 */
function toIsoString(v: Date | string | null | undefined): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  return v.toISOString();
}

/** pg Client 的最小接口 */
interface PgClient {
  connect(): Promise<void>;
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: unknown[]; rowCount: number | null }>;
  end(): Promise<void>;
}

/** 只读 SQL —— 明确不写任何数据 */
const SQL_LIST_BASES = `
  SELECT id, name, description, kb_type, item_count
  FROM knowledge_bases
  ORDER BY updated_at DESC
`;

const SQL_LIST_ITEMS = `
  SELECT
    id, kb_id, title, content, summary, tags,
    source_url, source_type, sync_status, weknora_id,
    metadata, updated_at
  FROM knowledge_items
  WHERE kb_id = $1
  ORDER BY updated_at DESC
`;

/**
 * Postgres 数据源实现。
 */
export class PostgresKnowledgeSource implements KnowledgeSource {
  readonly kind = "postgres" as const;
  private client: PgLike | null = null;

  constructor(private readonly options: PostgresSourceOptions) {}

  private async conn(): Promise<PgLike> {
    if (!this.client) {
      const factory = this.options.createClient ?? defaultCreateClient;
      this.client = await factory(this.options.connectionString);
    }
    return this.client;
  }

  async listBases(): Promise<KnowledgeBase[]> {
    const db = await this.conn();
    const res = await db.query<{
      id: string;
      name: string;
      description: string | null;
      kb_type: string | null;
      item_count: number | null;
    }>(SQL_LIST_BASES);

    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? undefined,
      kb_type: r.kb_type ?? undefined,
      item_count: r.item_count ?? undefined,
    }));
  }

  async listItems(kbId: string): Promise<KnowledgeItem[]> {
    const db = await this.conn();
    const res = await db.query<{
      id: string;
      kb_id: string;
      title: string;
      content: string | null;
      summary: string | null;
      tags: string[] | null;
      source_url: string | null;
      source_type: string | null;
      sync_status: string | null;
      weknora_id: string | null;
      metadata: Record<string, unknown> | null;
      updated_at: Date | string | null;
    }>(SQL_LIST_ITEMS, [kbId]);

    return res.rows.map((r) => ({
      id: r.id,
      kb_id: r.kb_id,
      title: r.title,
      content: r.content ?? "",
      summary: r.summary ?? undefined,
      tags: r.tags ?? undefined,
      source_url: r.source_url ?? undefined,
      source_type: r.source_type ?? undefined,
      sync_status: r.sync_status ?? undefined,
      weknora_id: r.weknora_id ?? undefined,
      metadata: r.metadata ?? undefined,
      // pg 默认把 timestamptz 转成 Date 对象 —— 统一成 ISO 字符串，
      // 否则调用方按字符串处理会炸（slice is not a function）
      updated_at: toIsoString(r.updated_at),
    }));
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}

/**
 * ── WeKnora 数据源 ────────────────────────────────────────────
 *
 * 形态 B / C：站点机**没有 GEO-K**，知识在 WeKnora 里 —— 直连 WeKnora API。
 *
 * 契约（唯一事实源 contracts/weknora-api/README.md）：
 *   - 列库：GET  /api/v1/knowledge-bases
 *   - 检索：POST /api/v1/knowledge-search
 *            body  {query, knowledge_base_ids:[...], match_count}
 *   - 认证：X-API-Key 头（租户 API key）
 *   - 响应体包一层 data（检索另有旧版包 results）
 *
 * 三个坑（照契约抄，别自己"优化"）：
 *   1. 库 id 字段是**复数** knowledge_base_ids —— 传单数 knowledge_base_id
 *      会被服务端忽略 → kbIDs 为空 → 403。
 *   2. **禁传 knowledge_ids** —— 受限 key 一律 403，限定范围只能客户端过滤。
 *   3. **多库 + 受限 key = 整批 403** —— 白名单外任一库 → 拒绝**整次请求**。
 *      所以本实现**永远逐库检索**（一次请求一个 kb id），不做多库合并请求。
 *      这也是为什么 listItems(kbId) 一次只查一个库。
 *
 * 超时：检索管线含 rerank，实测 40s → 默认给到 120s。
 *
 * 响应体巨大（metadata 塞了整段 chunk 配置，单条 19KB+）→ 只取需要的字段，
 * 不把原始 metadata 往下传。
 */

/** WeKnora 数据源配置 */
export interface WeKnoraSourceOptions {
  /** WeKnora 基址，如 http://457:3016（容器内 5016） */
  baseUrl: string;
  /** 租户 API key（capabilities 需含 retrieve） */
  apiKey: string;
  /**
   * 允许同步的知识库 id 白名单（可多个）。
   *
   * 空 = 不做客户端白名单（仍受服务端 key 白名单约束）。
   * 非空时，listItems 传入白名单外的库 → 明确报错（不白撞服务端的 403）。
   */
  knowledgeBaseIds?: string[];
  /** 检索词。WeKnora 检索要求非空 query */
  query?: string;
  /** 返回条数上限。服务端 MaxRequestedResults=200，超过会 400 */
  matchCount?: number;
  /** 超时（毫秒）。检索含 rerank 实测 40s → 默认 120s */
  timeoutMs?: number;
  /** 注入 fetch（测试用；生产走 Node 18+ 自带 fetch） */
  fetchImpl?: FetchLike;
}

/** 最小 fetch 接口 —— 便于测试注入，不强依赖 DOM 类型 */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/** 检索默认词 —— WeKnora 要求 query 非空 */
const DEFAULT_QUERY = "企业知识库内容";
/** 默认返回条数（服务端上限 200） */
const DEFAULT_MATCH_COUNT = 100;
/** 默认超时：检索管线含 rerank，实测 40s → 给到 120s */
const DEFAULT_TIMEOUT_MS = 120_000;
/** 服务端 MaxRequestedResults —— 超过就 400 */
const MAX_MATCH_COUNT = 200;

/** WeKnora 检索响应里我们关心的字段（其余 metadata 等一律不要） */
interface WeKnoraSearchHit {
  id?: string;
  content?: string;
  knowledge_id?: string;
  knowledge_title?: string;
  knowledge_description?: string;
  chunk_index?: number;
  start_at?: number;
  score?: number;
}

/** WeKnora 列库响应里我们关心的字段 */
interface WeKnoraKb {
  id?: string;
  name?: string;
  description?: string;
  type?: string;
  knowledge_count?: number;
}

/**
 * WeKnora 数据源实现。
 */
export class WeKnoraKnowledgeSource implements KnowledgeSource {
  readonly kind = "weknora" as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly whitelist: Set<string> | null;
  private readonly query: string;
  private readonly matchCount: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: WeKnoraSourceOptions) {
    if (!options.baseUrl?.trim()) {
      throw new Error("WeKnora 数据源缺少 baseUrl");
    }
    if (!options.apiKey?.trim()) {
      throw new Error("WeKnora 数据源缺少 apiKey（X-API-Key）");
    }
    this.baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
    this.apiKey = options.apiKey.trim();
    const ids = (options.knowledgeBaseIds ?? []).map((s) => s.trim()).filter(Boolean);
    this.whitelist = ids.length > 0 ? new Set(ids) : null;
    this.query = options.query?.trim() || DEFAULT_QUERY;
    const mc = options.matchCount ?? DEFAULT_MATCH_COUNT;
    if (mc <= 0 || mc > MAX_MATCH_COUNT) {
      throw new Error(
        `WeKnora matchCount 必须在 1..${MAX_MATCH_COUNT} 之间（服务端上限），收到 ${mc}`,
      );
    }
    this.matchCount = mc;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init as RequestInit));
  }

  /** 该库是否在客户端白名单内 */
  private allowed(kbId: string): boolean {
    return this.whitelist === null || this.whitelist.has(kbId);
  }

  /**
   * 发请求 —— 统一处理超时与错误。
   *
   * 超时用「竞速 + abort」两件套：
   *   - 竞速保证即便底层 fetch 不理会 signal，也一定会超时返回；
   *   - abort 保证真的把在飞的请求掐掉（不白占连接）。
   */
  private async request(
    path: string,
    method: "GET" | "POST",
    body?: string,
  ): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 超时标记：底层 fetch 在 abort 后抛的是 AbortError，
    // 光靠 error 类型分不清「我们自己超时了」和「别人中止了」—— 用标记区分。
    let timedOut = false;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(
          new Error(
            `WeKnora 请求超时（${this.timeoutMs}ms）：${method} ${path}。检索管线含 rerank，实测约 40s。`,
          ),
        );
        controller.abort();
      }, this.timeoutMs);
    });

    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await Promise.race([
        this.fetchImpl(url, {
          method,
          headers: {
            "X-API-Key": this.apiKey,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body,
          signal: controller.signal,
        }),
        timeout,
      ]);
    } catch (err) {
      if (timedOut) {
        throw new Error(
          `WeKnora 请求超时（${this.timeoutMs}ms）：${method} ${path}。检索管线含 rerank，实测约 40s。`,
        );
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`WeKnora 请求被中止：${method} ${path}`);
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`WeKnora ${method} ${path} → HTTP ${res.status}${detail ? `：${detail}` : ""}`);
    }
    return res.text();
  }

  /** 解析响应体 —— 兼容 data / results 两种包装 */
  private parseEnvelope(raw: string): unknown {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `WeKnora 响应不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (obj.success === false) {
        const msg = obj.message ?? obj.error ?? "未知错误";
        throw new Error(`WeKnora 返回失败：${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
      }
    }
    return parsed;
  }

  /** 取数组载荷：优先 data，其次 results（旧版） */
  private pickArray(parsed: unknown): unknown[] {
    if (!parsed || typeof parsed !== "object") return [];
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.results)) return obj.results;
    return [];
  }

  async listBases(): Promise<KnowledgeBase[]> {
    const raw = await this.request("/api/v1/knowledge-bases", "GET");
    const parsed = this.parseEnvelope(raw);
    const arr = this.pickArray(parsed) as WeKnoraKb[];

    const bases: KnowledgeBase[] = [];
    for (const kb of arr) {
      const id = kb?.id?.trim();
      if (!id) continue;
      if (!this.allowed(id)) continue;
      bases.push({
        id,
        name: kb.name ?? id,
        description: kb.description ?? undefined,
        kb_type: kb.type ?? undefined,
        // WeKnora 列库接口不回填 knowledge_count（只有详情接口 GET
        // /api/v1/knowledge-bases/{id} 回填），所以这里通常是 0。
        // 编排层对 WeKnora 源不靠这个数字选库（选库靠显式 --kb），
        // 避免拿一个恒为 0 的值当"条目数"。
        item_count: typeof kb.knowledge_count === "number" ? kb.knowledge_count : 0,
      });
    }
    return bases;
  }

  async listItems(kbId: string, query?: string): Promise<KnowledgeItem[]> {
    if (!kbId?.trim()) {
      throw new Error("WeKnora listItems 需要知识库 id");
    }
    if (!this.allowed(kbId)) {
      // 客户端白名单外 → 明确报错，不去撞服务端的墙（服务端也会 403）
      throw new Error(
        `知识库 ${kbId} 不在允许同步的范围内（WeKnora KB 白名单：${[...(this.whitelist ?? [])].join("、")}）`,
      );
    }
    const q = query?.trim() || this.query;
    const body = JSON.stringify({
      query: q,
      // 复数字段（契约禁忌 1）—— 且一次只传一个库（契约禁忌 3）
      knowledge_base_ids: [kbId],
      match_count: this.matchCount,
    });

    const raw = await this.request("/api/v1/knowledge-search", "POST", body);
    const parsed = this.parseEnvelope(raw);
    const hits = this.pickArray(parsed) as WeKnoraSearchHit[];

    return groupHitsToItems(hits, kbId);
  }
}

/**
 * 检索命中 → 知识条目。
 *
 * 检索返回的是**chunk**（分片），一个知识条目可能有多个分片。
 * 直接当条目用 → 同一条目的多个分片会变成多篇文章（标题还一样，
 * 会被同步器的标题去重吃掉）。所以按 knowledge_id 聚合：
 *   - id     = knowledge_id（文章 id 稳定，反复同步不会重复）
 *   - title  = knowledge_title
 *   - content= 各分片正文按 chunk_index 拼起来
 *
 * 只取需要的字段：原始 hit 里的 metadata（单条 19KB+）直接丢弃。
 */
export function groupHitsToItems(
  hits: WeKnoraSearchHit[],
  kbId: string,
): KnowledgeItem[] {
  interface Acc {
    id: string;
    title: string;
    summary?: string;
    chunks: Array<{ index: number; start: number; text: string }>;
    score: number;
  }
  const order: string[] = [];
  const acc = new Map<string, Acc>();

  for (const hit of hits) {
    if (!hit) continue;
    const text = typeof hit.content === "string" ? hit.content : "";
    if (!text.trim()) continue;
    // knowledge_id 缺失时退化用 chunk id（仍保证 id 存在且稳定）
    const id = hit.knowledge_id?.trim() || hit.id?.trim() || "";
    if (!id) continue;

    let entry = acc.get(id);
    if (!entry) {
      entry = {
        id,
        title: hit.knowledge_title?.trim() || id,
        summary: hit.knowledge_description?.trim() || undefined,
        chunks: [],
        score: typeof hit.score === "number" ? hit.score : 0,
      };
      acc.set(id, entry);
      order.push(id);
    }
    entry.chunks.push({
      index: typeof hit.chunk_index === "number" ? hit.chunk_index : 0,
      start: typeof hit.start_at === "number" ? hit.start_at : 0,
      text,
    });
    if (typeof hit.score === "number" && hit.score > entry.score) {
      entry.score = hit.score;
    }
  }

  const items: KnowledgeItem[] = [];
  for (const id of order) {
    const entry = acc.get(id)!;
    entry.chunks.sort((a, b) => a.index - b.index || a.start - b.start);
    const content = entry.chunks.map((c) => c.text).join("\n\n");
    if (!content.trim()) continue;
    items.push({
      id: entry.id,
      kb_id: kbId,
      title: entry.title,
      content,
      summary: entry.summary,
      // 无 sync_status：同步器的状态白名单只在值存在时生效，缺省即放行
      source_type: "weknora",
      // 只留一个数字分数，不把 19KB 的 metadata 带下来
      metadata: { score: entry.score },
    });
  }
  return items;
}

/**
 * 内存数据源 —— 测试用，也用于离线预览。
 */
export class MemoryKnowledgeSource implements KnowledgeSource {
  constructor(
    private readonly bases: KnowledgeBase[],
    private readonly itemsByKb: Map<string, KnowledgeItem[]>,
  ) {}

  async listBases(): Promise<KnowledgeBase[]> {
    return this.bases;
  }

  async listItems(kbId: string): Promise<KnowledgeItem[]> {
    return this.itemsByKb.get(kbId) ?? [];
  }
}

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
 */

import type { KnowledgeBase, KnowledgeItem } from "./knowledge-sync.js";

export type { KnowledgeBase, KnowledgeItem } from "./knowledge-sync.js";

/** 知识库数据源 */
export interface KnowledgeSource {
  /** 列知识库 */
  listBases(): Promise<KnowledgeBase[]>;
  /** 列某库的条目 */
  listItems(kbId: string): Promise<KnowledgeItem[]>;
  /** 关闭连接 */
  close?(): Promise<void>;
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

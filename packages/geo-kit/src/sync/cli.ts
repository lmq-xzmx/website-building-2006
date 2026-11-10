/**
 * 同步编排 —— 从数据源拉取 → 同步转换 → 写回知识文章模块。
 *
 * 设计要点：**写的是独立模块，不是内容包**。
 * 内容包由客户维护，同步只更新知识文章 —— 手写内容永远安全。
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  renderKnowledgeModule,
  renderSyncReport,
  syncKnowledgeBase,
  type ContentMapping,
  type SyncResult,
} from "./knowledge-sync.js";
import {
  PostgresKnowledgeSource,
  WeKnoraKnowledgeSource,
  type KnowledgeBase,
  type KnowledgeItem,
  type KnowledgeSource,
  type WeKnoraSourceOptions,
} from "./source.js";

/** 隐含的默认库 id —— 早期入库的条目都挂在这里，但 knowledge_bases 表无对应行。 */
const DEFAULT_KB_ID = "default";

export interface SyncOptions {
  /**
   * 数据库连接串（GEO-K Postgres 源用）。
   *
   * 用 WeKnora 源时不给。
   */
  databaseUrl?: string;
  /** 目标知识库 id（不给则取条目最多的） */
  kbId?: string;
  /** 映射配置 */
  mapping?: ContentMapping;
  /** 数据源注入（测试用） */
  source?: KnowledgeSource;
  /** WeKnora 源配置（给了就用 WeKnora，不给则走 Postgres） */
  weknora?: WeKnoraSourceOptions;
}

export interface SyncOutput {
  result: SyncResult;
  /** 知识文章模块的 TS 源码 */
  module: string;
}

/**
 * 执行一次同步 —— 只产出模块，不改内容包。
 */
export async function runSync(options: SyncOptions): Promise<SyncOutput> {
  const source = options.source ?? buildSource(options);

  try {
    const bases: KnowledgeBase[] = await source.listBases();

    let kb: KnowledgeBase | undefined;
    if (options.kbId) {
      if (source.kind === "weknora") {
        // WeKnora：库可见性由 API key 的白名单决定（服务端强制），
        // 客户端白名单在 WeKnoraKnowledgeSource 内部生效。
        // 所以**不要求**它在 listBases() 里出现 —— 直接用，
        // 拉不到内容时结果自然是空（并给出报告）。
        kb =
          bases.find((b) => b.id === options.kbId) ??
          ({ id: options.kbId, name: options.kbId } as KnowledgeBase);
      } else {
        kb = bases.find((b) => b.id === options.kbId);
        if (!kb) {
          throw new Error(
            `知识库不存在：${options.kbId}。可用：${bases.map((b) => b.name).join("、")}`,
          );
        }
      }
    } else if (source.kind === "weknora") {
      // WeKnora：不猜「条目最多的库」。
      // WeKnora 列库接口不回填 knowledge_count，要比较就得逐库检索 ——
      // 检索含 rerank（实测 40s/次），猜错代价太高。
      // 只有一个库就用它；多个库必须显式指定 --kb。
      if (bases.length === 1) {
        kb = bases[0];
      } else if (bases.length === 0) {
        throw new Error("WeKnora 没有可见的知识库（检查 API key 的 KB 白名单）");
      } else {
        throw new Error(
          `WeKnora 有多个可见知识库，请用 --kb <id> 指定：${bases
            .map((b) => `${b.name}(${b.id})`)
            .join("、")}`,
        );
      }
    } else {
      // 默认选**条目最多的库** —— 内容最丰富，最可能就是要同步的那个。
      // 不取第一个：第一个库往往是随手建的测试库（实测：库里 59 条在 default，
      // 而列表里第一个「小小知识库2」只有 3 条）。
      //
      // 关键：`default` 是**隐含库 id** —— 早期入库的条目都挂在
      // kb_id='default'，但 knowledge_bases 表里没有对应行，
      // 所以 listBases() 看不到它。必须显式补上，否则最大的那批内容同步不到。
      //
      // （这条只对 GEO-K 的 PG 源成立：WeKnora 没有「隐含 default 库」这回事，
      //  去查一个不存在的库只会白白撞一次 403/404。）
      const candidates: KnowledgeBase[] = [...bases];
      if (!candidates.some((b) => b.id === DEFAULT_KB_ID)) {
        const defaultItems = await source.listItems(DEFAULT_KB_ID);
        if (defaultItems.length > 0) {
          candidates.push({
            id: DEFAULT_KB_ID,
            name: "默认知识库",
            description: "未归入具体知识库的条目",
            item_count: defaultItems.length,
          });
        }
      }

      const withCounts = await Promise.all(
        candidates.map(async (b) => ({
          b,
          count: b.item_count ?? (await source.listItems(b.id)).length,
        })),
      );
      withCounts.sort((x, y) => y.count - x.count);
      kb = withCounts[0]?.b;
      if (!kb) throw new Error("没有可用的知识库");
    }

    const items: KnowledgeItem[] = await source.listItems(kb.id);
    const result = syncKnowledgeBase(kb, items, options.mapping);
    const module = renderKnowledgeModule(result, new Date().toISOString());

    return { result, module };
  } finally {
    await source.close?.();
  }
}

/**
 * 按配置构造数据源。
 *
 * 给了 weknora 配置就走 WeKnora（形态 B/C：站点机没有 GEO-K）；
 * 否则走 GEO-K 的 Postgres（形态 A）。
 */
function buildSource(options: SyncOptions): KnowledgeSource {
  if (options.weknora) {
    return new WeKnoraKnowledgeSource(options.weknora);
  }
  if (!options.databaseUrl) {
    throw new Error(
      "未配置数据源：需要 databaseUrl（GEO-K PG）或 weknora（WeKnora API）配置",
    );
  }
  return new PostgresKnowledgeSource({ connectionString: options.databaseUrl });
}

/**
 * 写出知识文章模块。
 */
export async function writeKnowledgeModule(
  path: string,
  module: string,
): Promise<void> {
  await writeFile(resolve(path), module, "utf8");
}

/**
 * 同步报告（CLI 用）。
 */
export { renderSyncReport };
export { applyKnowledgeArticles } from "./knowledge-sync.js";

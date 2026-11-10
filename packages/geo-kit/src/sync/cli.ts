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
  type KnowledgeBase,
  type KnowledgeItem,
  type KnowledgeSource,
} from "./source.js";

/** 隐含的默认库 id —— 早期入库的条目都挂在这里，但 knowledge_bases 表无对应行。 */
const DEFAULT_KB_ID = "default";

export interface SyncOptions {
  /** 数据库连接串 */
  databaseUrl: string;
  /** 目标知识库 id（不给则取条目最多的） */
  kbId?: string;
  /** 映射配置 */
  mapping?: ContentMapping;
  /** 数据源注入（测试用） */
  source?: KnowledgeSource;
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
  const source =
    options.source ??
    new PostgresKnowledgeSource({ connectionString: options.databaseUrl });

  try {
    const bases: KnowledgeBase[] = await source.listBases();

    let kb: KnowledgeBase | undefined;
    if (options.kbId) {
      kb = bases.find((b) => b.id === options.kbId);
      if (!kb) {
        throw new Error(
          `知识库不存在：${options.kbId}。可用：${bases.map((b) => b.name).join("、")}`,
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

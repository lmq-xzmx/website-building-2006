/**
 * 版本历史 —— 编排的快照与回滚。
 *
 * ── 为什么要有 ────────────────────────────────────────
 * 之前的发布是**覆盖写** modules.json：出错了只能靠 git 回滚。
 * 但 git 回滚粗得没法用：
 *   - 回滚的是**整个仓库**，会把别的站点、别的改动一起带走
 *   - 回滚的是**代码**，不是「这一版编排长什么样」
 *   - 客户现场改坏了内容，要立刻恢复 —— 等不起一次 review
 *
 * 版本历史把「编排」当成有生命周期的文档：
 *   每次发布留一份快照 → 出错时点一下回到上一版 → 历史不丢。
 *
 * ── 落盘位置 ──────────────────────────────────────────
 *   sites/<id>/history/index.json   索引（版本号/时间/操作者/统计）
 *   sites/<id>/history/<版本号>.json 快照（整份编排）
 *
 * 注意：这是**应用自己的历史目录**，不是 docker 数据卷 ——
 * 超出保留份数时删最旧的文件是安全的。
 */

/** 一次发布的摘要统计 */
export interface VersionStats {
  /** 页面数 */
  pages: number;
  /** 模块数 */
  modules: number;
  /** 条目数 */
  items: number;
}

/** 版本索引里的一条 */
export interface VersionEntry {
  /** 版本号 —— 时间戳，可读且单调递增 */
  id: string;
  /** 快照时间（ISO） */
  createdAt: string;
  /** 操作者 */
  author: string;
  /** 这次为什么产生 —— 「发布」「回滚到 …」「回滚前状态」 */
  reason: string;
  /** 摘要统计 */
  stats: VersionStats;
}

/** 版本索引 —— 一个站点一份 */
export interface VersionIndex {
  version: 1;
  siteId: string;
  updatedAt: string;
  /** 最新在前 */
  versions: VersionEntry[];
}

/** 空索引 */
export function emptyVersionIndex(siteId: string): VersionIndex {
  return {
    version: 1,
    siteId,
    updatedAt: new Date().toISOString(),
    versions: [],
  };
}

/** 默认保留份数 */
export const DEFAULT_KEEP_VERSIONS = 30;

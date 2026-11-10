/**
 * 可复用片段（组件）—— 一段内容，多处引用。
 *
 * ── 为什么要有 ────────────────────────────────────────
 * 企业门户里反复出现的是**同一类内容**：公司简介、联系方式、
 * 常见问题、合作客户背书。它们出现在首页、关于我们、产品页、联系页……
 *
 * 没有片段时只能复制粘贴，后果是：
 *   - 客户改了一次联系电话，要改三四处，漏一处线上就自相矛盾
 *   - 「联系我们」页的电话和「公司简介」里的电话对不上 —— AI 抓取时当成两个实体
 *   - 页面多了以后没人说得清哪份才是「正版」
 *
 * 片段把「同一段内容」收成**一份**，页面上的模块变成**引用**。
 *
 * ── 与模块的关系 ──────────────────────────────────────
 * 片段的形状就是 PageModule（type/title/items/props）——
 * 所以引用展开后与普通模块**在渲染层完全一样**，
 * 骨架模板不需要为片段加任何分支。
 *
 * 差异只有一处：片段额外有 name/description/时间戳 ——
 * 因为它是一份**被复用的资产**，得像资产那样被命名、被描述、被追溯。
 */

import type { ModuleItem, ModuleType } from "../modules/types.js";

/** 片段 —— 一份可复用的模块内容 */
export interface Fragment {
  /** 片段 id（站点内唯一） */
  id: string;
  /** 片段名 —— 给人看的，「公司简介」「常见问题」 */
  name: string;
  /** 说明 —— 这个片段是干什么的、放在哪些地方用 */
  description?: string;
  /** 模块类型 —— 决定渲染成什么区块 */
  type: ModuleType;
  /** 区块标题 */
  title?: string;
  /** 副标题 */
  subtitle?: string;
  /** 条目 */
  items: ModuleItem[];
  /** 模块级配置（列数、变体等） */
  props?: Record<string, unknown>;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/** 片段库 —— 一个站点一份 */
export interface FragmentLibrary {
  version: 1;
  siteId: string;
  updatedAt: string;
  fragments: Fragment[];
}

/** 空片段库 */
export function emptyFragmentLibrary(siteId: string): FragmentLibrary {
  return {
    version: 1,
    siteId,
    updatedAt: new Date().toISOString(),
    fragments: [],
  };
}

/** 生成片段 id */
export function newFragmentId(): string {
  return `fg_${Math.random().toString(36).slice(2, 10)}`;
}

/** 片段的条目数 */
export function fragmentItemCount(fragment: Fragment): number {
  return fragment.items?.length ?? 0;
}

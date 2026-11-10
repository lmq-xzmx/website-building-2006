/**
 * 模块模型 —— 「页面由模块自由组合」的数据结构。
 *
 * ── 为什么要有这层 ──────────────────────────────────────
 * 之前的模型是**固定页型**：home / products / cases / about / insights / faq。
 * 每个页型在骨架里是一个写死的 Next.js 路由，字段也是写死的
 * （products 只有 name/summary/specs，cases 只有 client/results）。
 * 这导致两件事做不到：
 *   1. 「不同模版的模块组合」—— 没法自由增删改查页面上的模块
 *   2. 「每个模块的内容支持增删改查」—— 模块内的条目结构被页型钉死
 *
 * 新模型把三层拆开：
 *   页面 Page      → 一组模块，**顺序可调、可增删**
 *   模块 Module    → 一组条目，**顺序可调、可增删**
 *   条目 Item      → 内容的最小单位，**两种来源**
 *
 * ── 条目的两种来源 ──────────────────────────────────────
 *   source: "kb"      —— 来自知识库条目（引用 knowledge_items.id）
 *   source: "manual"  —— 后台手工创作（富文本）
 *
 * 这两者在**渲染层是同一种东西**（都是条目），在**编辑层是两条路**。
 * 条目上带 source 标记，合并时知道该去哪儿取正文。
 *
 * ── 与既有内容的关系 ────────────────────────────────────
 * 固定页型（sections/products/cases/...）**保留**，作为「手写内容包」的表达。
 * 模块模型是**新增的一层**，后台用它做编排，产出走同一个构建链路。
 * 两者最终都汇成同一个渲染模型（见 modules/render.ts）。
 */

import type { RichTextDoc } from "../rich-text/types.js";

/** 条目来源 */
export type ItemSource = "kb" | "manual";

/** 模块类型 —— 决定渲染成什么区块 */
export type ModuleType =
  /** 富文本正文块 */
  | "rich-text"
  /** 卡片网格（产品 / 案例 / 洞察共用，靠 props 区分） */
  | "card-grid"
  /** 问答列表 */
  | "faq"
  /** 数据条（数字 + 标签） */
  | "stats"
  /** 英雄区（H1 + 引导语 + CTA） */
  | "hero"
  /** 行动号召条 */
  | "cta"
  /** 图片网格 */
  | "gallery";

export const MODULE_TYPES: ModuleType[] = [
  "rich-text",
  "card-grid",
  "faq",
  "stats",
  "hero",
  "cta",
  "gallery",
];

/** 条目 —— 模块内的内容单位 */
export interface ModuleItem {
  /** 模块内唯一 id（模块内作用域） */
  id: string;
  /** 内容来源 */
  source: ItemSource;
  /** source === "kb" 时：知识库条目 id */
  kbItemId?: string;
  /** 标题（kb 来源可覆盖知识条目的原标题） */
  title?: string;
  /** 摘要 */
  summary?: string;
  /** 正文 —— manual 来源时是富文本；kb 来源时留空（由知识条目正文物化） */
  body?: RichTextDoc;
  /** 标签 */
  tags?: string[];
  /** 图片 */
  image?: string;
  /** 排序权重（小的在前） */
  order: number;
  /** 是否发布。false = 草稿，不进站点 */
  published: boolean;
  /** 附加字段 —— 按模块类型解释 */
  /** card-grid + products：规格表 */
  specs?: Array<{ name: string; value: string; unit?: string }>;
  /** card-grid + cases：客户名 */
  client?: string;
  /** card-grid + cases：量化结果 */
  results?: string[];
  /** faq：问题 */
  question?: string;
  /** faq：答案 */
  answer?: string;
  /** stats：数值 */
  value?: string;
  /** stats：数值单位 */
  unit?: string;
  /** stats：标签 */
  label?: string;
  /** cta：跳转链接 */
  href?: string;
}

/** 模块 —— 页面上的一个区块 */
export interface PageModule {
  /** 页面内唯一 id */
  id: string;
  /** 模块类型 */
  type: ModuleType;
  /** 区块标题 */
  title?: string;
  /** 副标题 */
  subtitle?: string;
  /** 条目 */
  items: ModuleItem[];
  /** 模块级配置（列数、变体等） */
  props?: Record<string, unknown>;
  /** 排序权重（小的在前） */
  order: number;
  /** 是否启用。false = 整块下线 */
  enabled: boolean;
}

/** 页面 —— 一组模块 */
export interface PageDef {
  /** 站点内唯一 id */
  id: string;
  /** 路由路径（相对站点根），如 "/about" */
  path: string;
  /** 页面标题（浏览器标题 / H1 兜底） */
  title: string;
  /** 页面描述 —— 每页必须有自己的一份（AI 区分页面实体） */
  description?: string;
  /** 模块数组 */
  modules: PageModule[];
  /** 排序权重（导航里的顺序） */
  order: number;
  /** 是否发布 */
  published: boolean;
}

/** 模块编排 —— 一个站点一份 */
export interface ModulePlan {
  version: 1;
  siteId: string;
  /** 来源知识库 id */
  kbId: string;
  updatedAt: string;
  pages: PageDef[];
}

/** 空编排 */
export function emptyModulePlan(siteId: string, kbId = "default"): ModulePlan {
  return {
    version: 1,
    siteId,
    kbId,
    updatedAt: new Date().toISOString(),
    pages: [],
  };
}

/** 生成模块内条目 id */
export function newItemId(prefix = "it"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 生成模块 id */
export function newModuleId(prefix = "mod"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 生成页面 id */
export function newPageId(prefix = "pg"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

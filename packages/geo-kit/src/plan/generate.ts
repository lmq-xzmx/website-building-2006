/**
 * 计划物化 —— 把 ContentPlan 渲染成可被构建消费的 TS 模块。
 *
 * 为什么物化成 TS 而不是 JSON：
 *   - 构建目录里的 content/site.ts 是 TS 模块，合并时要 import 计划数据
 *   - 物化在**后台发布时**完成 —— 构建时不需要连数据库
 *   - 产出的文件是纯数据，diff 友好，能进 git，能人工检查
 *
 * 产出的模块形如：
 *   export const planContent = { insights: [...], faq: [...], products: [...], cases: [...] };
 *
 * 合并逻辑在构建脚本里（scripts/build-site.mjs）：
 *   手写 site.ts → site.base.ts，新 site.ts = base + planContent
 * 手写内容因此永远完整保留。
 */

import type { ContentPlan } from "./plan.js";
import { applyPlan } from "./plan.js";
import type { KnowledgeItem } from "../sync/knowledge-sync.js";
import type {
  CaseContent,
  FaqItem,
  InsightContent,
  ProductContent,
  SiteContent,
} from "../types.js";

/** 物化结果 —— 计划落到各槽位的内容 */
export interface MaterializedPlan {
  insights: InsightContent[];
  faq: FaqItem[];
  products: ProductContent[];
  cases: CaseContent[];
}

/**
 * 物化计划。
 *
 * 走 applyPlan 同一套逻辑 —— 保证「后台看到的」与「构建出来的」完全一致。
 */
export function materializePlan(
  base: SiteContent,
  plan: ContentPlan,
  items: Map<string, KnowledgeItem>,
): { content: MaterializedPlan; skipped: Array<{ itemId: string; title: string; reason: string }> } {
  const { planned, skipped } = applyPlan(base, plan, items);
  return { content: planned, skipped };
}

/**
 * 构建期合并 —— 把**已物化**的计划内容叠加到手写内容包上。
 *
 * 与 applyPlan 的区别：
 *   - applyPlan   需要知识条目（KnowledgeItem）—— 后台编排时用
 *   - mergePlanContent 只需要已物化的数据 —— 构建时用（构建机不连数据库）
 *
 * 合并顺序：计划内容在前，手写内容在后。
 * 计划是「本期重点」，应该排在客户自己写的旧文章前面。
 */
export function mergePlanContent(
  base: SiteContent,
  planned: MaterializedPlan,
): SiteContent {
  return {
    ...base,
    insights: [...planned.insights, ...(base.insights ?? [])],
    faq: [...planned.faq, ...(base.faq ?? [])],
    products: [...planned.products, ...(base.products ?? [])],
    cases: [...planned.cases, ...(base.cases ?? [])],
  };
}

/**
 * 渲染计划模块的 TS 源码。
 *
 * 纯数据 + type-only import —— 不引入任何运行期依赖。
 */
export function renderPlanModule(
  plan: ContentPlan,
  materialized: MaterializedPlan,
  syncedAt: string,
): string {
  return `/**
 * 计划内容 —— **由后台发布自动生成，请勿手改**。
 *
 * 来源知识库：${plan.kbId}
 * 生成时间：${syncedAt}
 * 条目数：${plan.entries.filter((e) => e.published).length}（已发布）/ ${plan.entries.length}（含草稿）
 *
 * 手写内容在 content/site.ts 里，两者互不覆盖。
 */

import type { CaseContent, FaqItem, InsightContent, ProductContent } from "@geokit/geo-kit";

export const planContent: {
  insights: InsightContent[];
  faq: FaqItem[];
  products: ProductContent[];
  cases: CaseContent[];
} = ${JSON.stringify(materialized, null, 2)};

export default planContent;
`;
}

/**
 * 内容计划 —— 「后台编排」的数据模型。
 *
 * 背景：网站内容有两个来源
 *   1. **手写内容包**（content/site.ts）—— 定位、卖点、案例、导航。文案人员写。
 *   2. **知识库**（geo_knowledge.knowledge_items）—— 沉淀的专业内容。客户维护。
 *
 * 后台要做的事：**组织**知识库内容 —— 挑条目、定位置、排序、定稿。
 * 结果落成 plan.json（可 review、可 diff、可进 git），
 * 构建时与手写内容包**合并**后渲染。
 *
 * ── 为什么不直接改 site.ts ──────────────────────────────
 * 第一版同步器就是「整体重写 site.ts」，结果把语文教学的内容灌进了 SaaS 站。
 * 根因是**写权限边界错了**：手写内容与机器内容混在一个文件里，
 * 任何自动化写入都可能污染人工编辑。
 *
 * 拆成两层后：
 *   - site.ts  —— 只有人能改，机器永远不碰
 *   - plan.json —— 只有机器能改，人只读
 *   - 构建时合并，两层各自可控
 *
 * ── 条目 → 槽位的映射 ───────────────────────────────────
 * 知识条目是「知识点卡片」：标题 + 结构化正文。不同内容适合不同槽位：
 *   - insights 文章 —— 默认，最自然
 *   - faq 问答 —— 条目本身是陈述体，当问题用要人工改写问句
 *   - products 产品 —— 需要参数表，知识条目没有
 *   - cases 案例 —— 需要客户与量化结果，知识条目没有
 *
 * 所以**只有 insights 是自动映射**，其他槽位必须人工补齐关键字段，
 * 否则渲染出来是空壳。后台在发布时会校验并阻止。
 */

import type {
  CaseContent,
  FaqItem,
  InsightContent,
  ProductContent,
  SiteContent,
} from "../types.js";
import { deriveSummary, structureContent, type KnowledgeItem } from "../sync/knowledge-sync.js";

/** 计划条目可以落到的槽位 */
export type PlanSlot = "insights" | "faq" | "products" | "cases";

export const PLAN_SLOTS: PlanSlot[] = ["insights", "faq", "products", "cases"];

/** 计划里的一个条目 —— 一条知识内容的一次编排决定 */
export interface PlanEntry {
  /** 知识条目的 id（knowledge_items.id） */
  itemId: string;
  /** 落到哪个槽位 */
  slot: PlanSlot;
  /**
   * 排序权重 —— **小的在前**。
   * 同槽位内按此排序；相同则按加入顺序稳定排列。
   */
  order: number;
  /**
   * 是否发布。
   * false = 草稿：编排已经做了，但**不进最终站点**。
   * 这是后台最重要的一步 —— 客户可以先把知识内容摆好，慢慢定稿。
   */
  published: boolean;
  /** 覆盖标题（不填则用知识条目的原标题） */
  title?: string;
  /** 覆盖摘要 */
  summary?: string;
  /** 覆盖标签 */
  tags?: string[];
  /**
   * 人工补充的正文段落 —— 追加在结构化正文之后。
   * 后台允许直接改写这段（但保留原文：AI 引用需要原文的准确性）。
   */
  extraBody?: string[];
  /**
   * 案例专属：客户名。cases 槽位必填。
   */
  client?: string;
  /**
   * 案例专属：量化结果。cases 槽位必填 —— AI 最爱引用数字。
   */
  results?: string[];
  /**
   * 产品专属：规格表。products 槽位必填。
   */
  specs?: Array<{ name: string; value: string; unit?: string }>;
}

/** 内容计划 —— 一个站点一份 */
export interface ContentPlan {
  /** 格式版本 —— 将来改结构时按版本迁移 */
  version: 1;
  /** 站点 id */
  siteId: string;
  /** 来源知识库 id */
  kbId: string;
  /** 最后更新时间 */
  updatedAt: string;
  /** 编排条目 */
  entries: PlanEntry[];
}

/** 空计划 */
export function emptyPlan(siteId: string, kbId = "default"): ContentPlan {
  return {
    version: 1,
    siteId,
    kbId,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

/**
 * 校验计划 —— 返回问题清单（空数组 = 通过）。
 *
 * 后台在发布前必须跑这个。渲染出空壳案例（没有客户、没有数字）比不发布更糟：
 * AI 会引用一个没有依据的案例，比没有案例更可信。
 */
export function validatePlan(
  plan: ContentPlan,
  items: Map<string, KnowledgeItem>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const e of plan.entries) {
    const label = e.title ?? items.get(e.itemId)?.title ?? e.itemId;

    if (seen.has(e.itemId)) {
      problems.push(`「${label}」重复编排了（同一个知识条目出现多次）`);
    }
    seen.add(e.itemId);

    if (!items.has(e.itemId)) {
      problems.push(`「${label}」在知识库里找不到（可能已被删除）`);
      continue;
    }

    const item = items.get(e.itemId)!;
    if (!item.content?.trim() && !e.extraBody?.length) {
      problems.push(`「${label}」正文为空 —— 发布出来是空页面`);
    }

    if (e.slot === "cases") {
      if (!e.client) problems.push(`案例「${label}」缺客户名`);
      if (!e.results?.length) problems.push(`案例「${label}」缺量化结果`);
    }
    if (e.slot === "products") {
      if (!e.specs?.length) problems.push(`产品「${label}」缺规格表`);
    }
    if (e.slot === "faq") {
      // FAQ 是问答对 —— 条目是陈述体，问句必须人工改写
      if (!e.title || !/[？?]$/.test(e.title)) {
        problems.push(`FAQ「${e.title ?? label}」的标题应是问句（以？结尾）`);
      }
    }
  }

  return problems;
}

/** 条目 → 洞察文章 */
function toInsight(e: PlanEntry, item: KnowledgeItem): InsightContent {
  const structured = structureContent(item.content ?? "");
  const body: string[] = [];
  for (const p of structured.paragraphs) body.push(p);
  for (const list of structured.lists) body.push(list.map((li) => `- ${li}`).join("\n"));
  if (e.extraBody?.length) body.push(...e.extraBody);

  return {
    id: e.itemId,
    title: e.title ?? item.title,
    summary: e.summary ?? deriveSummary(item),
    body,
    date: item.updated_at ? item.updated_at.slice(0, 10) : undefined,
    tags: e.tags ?? item.tags ?? undefined,
    readingMinutes: Math.max(1, Math.round((item.content?.length ?? 0) / 400)),
  };
}

/** 条目 → FAQ（问句 + 答案） */
function toFaq(e: PlanEntry, item: KnowledgeItem): FaqItem {
  const structured = structureContent(item.content ?? "");
  const answerParts = [...structured.paragraphs, ...structured.lists.map((l) => l.join("、"))];
  if (e.extraBody?.length) answerParts.push(...e.extraBody);
  return {
    question: e.title ?? item.title,
    answer: e.summary ?? answerParts.join("\n"),
    category: e.tags?.[0] ?? item.tags?.[0],
  };
}

/** 条目 → 产品 */
function toProduct(e: PlanEntry, item: KnowledgeItem): ProductContent {
  const structured = structureContent(item.content ?? "");
  const description = [...structured.paragraphs, ...structured.lists.map((l) => l.join("、"))].join("\n");
  return {
    id: e.itemId,
    name: e.title ?? item.title,
    summary: e.summary ?? deriveSummary(item),
    description: e.extraBody?.length ? `${description}\n\n${e.extraBody.join("\n")}` : description,
    specs: e.specs ?? [],
  };
}

/** 条目 → 案例 */
function toCase(e: PlanEntry, item: KnowledgeItem): CaseContent {
  const structured = structureContent(item.content ?? "");
  const paragraphs = [...structured.paragraphs, ...structured.lists.map((l) => l.join("、"))];
  return {
    id: e.itemId,
    title: e.title ?? item.title,
    client: e.client,
    challenge: paragraphs[0],
    solution: e.extraBody?.join("\n") ?? paragraphs.slice(1).join("\n"),
    results: e.results ?? [],
    date: item.updated_at ? item.updated_at.slice(0, 10) : undefined,
    tags: e.tags ?? item.tags ?? undefined,
  };
}

/** 计划合并结果 */
export interface ApplyPlanResult {
  /** 合并后的完整内容包 */
  content: SiteContent;
  /** 计划**自己**产生的内容（不含手写）—— 物化时用这个 */
  planned: {
    insights: InsightContent[];
    faq: FaqItem[];
    products: ProductContent[];
    cases: CaseContent[];
  };
  /** 被跳过的条目 */
  skipped: Array<{ itemId: string; title: string; reason: string }>;
}

/**
 * 把计划合并进内容包 —— **纯函数，不改原对象**。
 *
 * 合并规则：
 *   - 只合并 published 的条目（草稿不上线）
 *   - 同槽位内：计划的条目在前（order 升序），手写条目在后
 *     —— 计划是「本期重点」，要排在客户自己写的老文章前面
 *   - 计划条目缺失（知识库已删）→ 跳过并计入 skipped
 *
 * 手写内容永远完整保留 —— 这是分层的核心收益。
 */
export function applyPlan(
  base: SiteContent,
  plan: ContentPlan,
  items: Map<string, KnowledgeItem>,
): ApplyPlanResult {
  const skipped: Array<{ itemId: string; title: string; reason: string }> = [];

  const published = plan.entries
    .filter((e) => e.published)
    .sort((a, b) => a.order - b.order);

  const insights: InsightContent[] = [];
  const faq: FaqItem[] = [];
  const products: ProductContent[] = [];
  const cases: CaseContent[] = [];

  for (const e of published) {
    const item = items.get(e.itemId);
    if (!item) {
      skipped.push({
        itemId: e.itemId,
        title: e.title ?? e.itemId,
        reason: "知识库中已不存在该条目",
      });
      continue;
    }
    switch (e.slot) {
      case "insights":
        insights.push(toInsight(e, item));
        break;
      case "faq":
        faq.push(toFaq(e, item));
        break;
      case "products":
        products.push(toProduct(e, item));
        break;
      case "cases":
        cases.push(toCase(e, item));
        break;
    }
  }

  const content: SiteContent = {
    ...base,
    insights: [...insights, ...(base.insights ?? [])],
    faq: [...faq, ...(base.faq ?? [])],
    products: [...products, ...(base.products ?? [])],
    cases: [...cases, ...(base.cases ?? [])],
  };

  return {
    content,
    planned: { insights, faq, products, cases },
    skipped,
  };
}

/** 统计计划概况 —— 后台顶部的数字 */
export function planStats(plan: ContentPlan) {
  // 用普通对象而不是 Map —— Map 序列化到 JSON 会变成空对象
  const bySlot: Record<PlanSlot, { total: number; published: number }> = {
    insights: { total: 0, published: 0 },
    faq: { total: 0, published: 0 },
    products: { total: 0, published: 0 },
    cases: { total: 0, published: 0 },
  };
  for (const e of plan.entries) {
    const s = bySlot[e.slot] ?? (bySlot[e.slot] = { total: 0, published: 0 });
    s.total++;
    if (e.published) s.published++;
  }
  return {
    total: plan.entries.length,
    published: plan.entries.filter((e) => e.published).length,
    drafts: plan.entries.filter((e) => !e.published).length,
    bySlot,
  };
}

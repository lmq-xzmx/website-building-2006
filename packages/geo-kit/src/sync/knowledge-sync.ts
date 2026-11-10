/**
 * 知识库 → 网站内容同步器。
 *
 * 背景：GEO-Knowledge（geo-platform/apps/geo-knowledge）里沉淀了客户的知识条目，
 * 这些内容本来只躺在库里。网站应该自动用上它们 —— 客户更新知识库，网站跟着更新。
 *
 * 数据源（基于 geo-knowledge 的实际模型，调研于 2026-11-27）：
 *   表 knowledge_items：title / content / summary / tags / source_type /
 *                       sync_status / weknora_id / kb_id / metadata / source_url
 *   表 knowledge_bases：id / name / description / kb_type / item_count
 *
 * 筛选规则：
 *   - 只取**同步状态正常**的条目（pushed / pulled / synced_both）。
 *     conflict 与 sync_failed 的条目正文可能是旧的 —— 同步到网站会发错内容，
 *     比不同步更糟。
 *   - 排除空正文。
 *
 * ── 关键设计：同步**不覆盖**内容包 ──────────────────────────
 * 第一版实现是「同步 → 整体重写 content/site.ts」。实测暴露了致命问题：
 * 把语文教学的知识库同步进 SaaS 企业站，整个站变成了语文教学网站。
 *
 * 所以改成：**同步产出独立的知识文章模块**（knowledge-articles.ts），
 * 内容包用 `knowledgeArticles: "<模块路径>"` 显式引用。
 *   - 手写内容永远安全（同步不碰它）
 *   - 客户想接入知识库才有意识地配置一次
 *   - 内容包被同步覆盖的风险归零
 *
 * 内容映射：
 *   知识条目是「知识点卡片」—— 标题 + 结构化正文，最接近网站的**洞察文章**。
 *   不是产品（产品有参数表）、不是案例（案例有客户与量化结果）、
 *   更不是 FAQ（FAQ 是问答对，条目是陈述体）。
 *
 * 幂等：条目 id 作为文章 id 的一部分，同步两次不会产生重复文章。
 */

import type { InsightContent, SiteContent } from "../types.js";

/** 知识条目 —— 对应 geo-knowledge 的 knowledge_items 表 */
export interface KnowledgeItem {
  id: string;
  kb_id: string;
  title: string;
  content: string;
  summary?: string;
  tags?: string[];
  source_url?: string;
  source_type?: string;
  sync_status?: string;
  weknora_id?: string;
  /** metadata JSONB */
  metadata?: Record<string, unknown>;
  updated_at?: string;
}

/** 知识库 —— 对应 knowledge_bases 表 */
export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  kb_type?: string;
  item_count?: number;
}

/** 同步结果 */
export interface SyncResult {
  /** 生成的洞察文章 */
  insights: InsightContent[];
  /** 跳过的条目与原因 */
  skipped: Array<{ id: string; title: string; reason: string }>;
  /** 使用的知识库 */
  kbId: string;
  kbName: string;
  /** 统计 */
  stats: {
    total: number;
    included: number;
    skipped: number;
    /** 标题去重后被合并的条目数 */
    deduped: number;
  };
}

/** 映射配置 —— 客户可以改映射规则 */
export interface ContentMapping {
  /**
   * 条目 → 站点页型。
   * 默认 insights（洞察文章）—— 知识点卡片最接近文章。
   */
  target?: "insights" | "faq" | "products" | "cases" | "articles";
  /**
   * 同步状态白名单。
   * 默认只取同步正常的条目。
   */
  includeSyncStatus?: string[];
  /**
   * 排除的 source_type。
   */
  excludeSourceTypes?: string[];
  /**
   * 只同步某些知识库（多库时选）。空 = 全部。
   */
  kbIds?: string[];
  /**
   * 每篇文章的最大正文长度（字符）。超出的截断。
   * 默认 8000 —— 超过这个长度的文章在网页上阅读体验差。
   */
  maxContentLength?: number;
  /**
   * 标签 → 分类的映射前缀。文章 id 用它，避免跨库撞 id。
   */
  idPrefix?: string;
  /**
   * 只同步标题匹配此模式的条目（正则）。空 = 全部。
   *
   * 用途：客户的知识库里可能混着不相关的业务内容。
   * 例如 SaaS 站只要「部署/合规/SLA」相关的，不要「语文答题方法」。
   */
  titlePattern?: string;
  /**
   * 只同步包含这些标签之一的条目。空 = 不限。
   */
  includeTags?: string[];
}

export const DEFAULT_MAPPING: Required<
  Pick<
    ContentMapping,
    "target" | "includeSyncStatus" | "excludeSourceTypes" | "maxContentLength"
  >
> = {
  target: "insights",
  includeSyncStatus: ["pushed", "pulled", "synced_both", "local_only"],
  excludeSourceTypes: [],
  maxContentLength: 8000,
};

/**
 * 条目正文 → 可上网的正文。
 *
 * 知识库的 content 常是「题型：xxx 【得分点】- ...」这种结构化纯文本。
 * 直接贴到网页很难读，所以做轻度结构化：
 *   - 「题型：xxx」这类前缀行 → 独立段落（前端渲染成小标题样式）
 *   - 以「- 」开头的行 → 列表项
 *   - 其余 → 段落
 *
 * 保留原文（不摘要、不改写）—— AI 引用需要原文的准确性，
 * 改写会引入偏差。结构化只改排版，不改字。
 */
export interface StructuredBody {
  paragraphs: string[];
  lists: string[][];
}

/** 把知识条目正文结构化。 */
export function structureContent(raw: string): StructuredBody {
  const paragraphs: string[] = [];
  const lists: string[][] = [];

  let currentList: string[] = [];
  const flush = () => {
    if (currentList.length > 0) {
      lists.push(currentList);
      currentList = [];
    }
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }

    // 列表项：- xxx / * xxx / • xxx / 1. xxx
    const listMatch = line.match(/^(?:[-*•]|\d+[.、])\s*(.+)$/);
    if (listMatch) {
      currentList.push(listMatch[1].trim());
      continue;
    }

    // 标签行：「题型：xxx」「真题来源：xxx」→ 独立段落
    if (/^[【\[]?[^：:]{2,10}[】\]]?\s*[：:]/.test(line)) {
      flush();
      paragraphs.push(line);
      continue;
    }

    flush();
    paragraphs.push(line);
  }

  flush();
  return { paragraphs, lists };
}

/**
 * 从知识条目正文生成摘要。
 *
 * 优先用条目自带的 summary（AI 提取的）；没有则取首个有实质内容的段落截断。
 * 摘要进 meta description —— 长度控制在 70–170 字符（体检 E2 的口径）。
 */
export function deriveSummary(item: KnowledgeItem, maxLen = 160): string {
  const existing = item.summary?.trim();
  if (existing) {
    return existing.length > maxLen ? `${existing.slice(0, maxLen - 3)}...` : existing;
  }

  const structured = structureContent(item.content ?? "");
  const first = structured.paragraphs.find((p) => p.length > 12) ?? item.title;
  const clean = first.replace(/^[【\[]?[^：:]{2,10}[】\]]?\s*[：:]\s*/, "");
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 3)}...` : clean;
}

/**
 * 条目 id → 文章 id。
 *
 * 必须稳定且唯一：同一知识库条目反复同步不产生新文章；
 * 不同库的条目不撞 id。
 */
export function toArticleId(item: KnowledgeItem, kbId: string, prefix?: string): string {
  const base = item.id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 24) || "item";
  const kbPart = kbId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "kb";
  return prefix ? `${prefix}-${kbPart}-${base}` : `${kbPart}-${base}`;
}

/**
 * 执行同步 —— 核心逻辑（纯函数，便于测试）。
 */
export function syncKnowledgeBase(
  kb: KnowledgeBase,
  items: KnowledgeItem[],
  mapping: ContentMapping = {},
): SyncResult {
  const includeStatus = new Set(
    mapping.includeSyncStatus ?? DEFAULT_MAPPING.includeSyncStatus,
  );
  const excludeTypes = new Set(
    mapping.excludeSourceTypes ?? DEFAULT_MAPPING.excludeSourceTypes,
  );
  const maxLen = mapping.maxContentLength ?? DEFAULT_MAPPING.maxContentLength;
  const titleRe = mapping.titlePattern ? new RegExp(mapping.titlePattern) : null;
  const includeTags = mapping.includeTags?.length ? new Set(mapping.includeTags) : null;

  const insights: InsightContent[] = [];
  const skipped: SyncResult["skipped"] = [];
  const seenTitles = new Map<string, string>();
  let deduped = 0;

  for (const item of items) {
    const title = item.title?.trim();
    if (!title) {
      skipped.push({ id: item.id, title: "", reason: "无标题" });
      continue;
    }

    if (item.sync_status && !includeStatus.has(item.sync_status)) {
      skipped.push({
        id: item.id,
        title,
        reason: `同步状态 ${item.sync_status}（可能是冲突或失败，正文不可信）`,
      });
      continue;
    }

    if (item.source_type && excludeTypes.has(item.source_type)) {
      skipped.push({ id: item.id, title, reason: `来源类型 ${item.source_type} 已排除` });
      continue;
    }

    if (titleRe && !titleRe.test(title)) {
      skipped.push({ id: item.id, title, reason: "标题不匹配过滤规则" });
      continue;
    }

    if (includeTags) {
      const tags = item.tags ?? [];
      const hit = tags.some((t) => includeTags.has(t));
      if (!hit) {
        skipped.push({ id: item.id, title, reason: "标签不匹配过滤规则" });
        continue;
      }
    }

    const content = item.content?.trim() ?? "";
    if (content.length === 0) {
      skipped.push({ id: item.id, title, reason: "正文为空" });
      continue;
    }

    // 标题去重 —— 同名条目（不同库同步来的重复）只留一条
    const titleKey = title.replace(/\s+/g, "");
    const existingId = seenTitles.get(titleKey);
    if (existingId) {
      deduped++;
      skipped.push({ id: item.id, title, reason: `与已有条目「${existingId}」标题重复` });
      continue;
    }

    const structured = structureContent(content);
    const body: string[] = [];
    for (const p of structured.paragraphs) {
      body.push(p);
    }
    for (const list of structured.lists) {
      body.push(list.map((li) => `- ${li}`).join("\n"));
    }

    const truncated =
      body.join("\n").length > maxLen
        ? [...body.slice(0, -1), body[body.length - 1].slice(0, maxLen)]
        : body;

    const articleId = toArticleId(item, kb.id, mapping.idPrefix);
    seenTitles.set(titleKey, articleId);

    insights.push({
      id: articleId,
      title,
      summary: deriveSummary(item),
      body: truncated,
      date: item.updated_at ? item.updated_at.slice(0, 10) : undefined,
      tags: item.tags?.length ? item.tags : undefined,
      readingMinutes: Math.max(1, Math.round(content.length / 400)),
    });
  }

  return {
    insights,
    skipped,
    kbId: kb.id,
    kbName: kb.name,
    stats: {
      total: items.length,
      included: insights.length,
      skipped: skipped.length,
      deduped,
    },
  };
}

/**
 * 生成知识文章模块的 TS 源码。
 *
 * 独立的模块 —— 内容包显式引用它，同步不会碰内容包本身。
 */
export function renderKnowledgeModule(
  result: SyncResult,
  syncedAt: string,
): string {
  const insights = result.insights.map((i) => ({
    id: i.id,
    title: i.title,
    ...(i.summary ? { summary: i.summary } : {}),
    body: i.body,
    ...(i.date ? { date: i.date } : {}),
    ...(i.tags ? { tags: i.tags } : {}),
    ...(i.readingMinutes ? { readingMinutes: i.readingMinutes } : {}),
  }));

  return `/**
 * 知识文章 —— **由 \`geo-kit sync\` 自动生成，请勿手改**。
 *
 * 知识库：${result.kbName}（${result.kbId}）
 * 同步时间：${syncedAt}
 * 文章数：${result.stats.included}
 *
 * 重新生成：\`geo-kit sync <content.ts> --out <此文件>\`
 *
 * 用法：在内容包里引用
 *   import { knowledgeInsights } from "./knowledge-articles";
 *   // 然后 site.insights = knowledgeInsights
 */

import type { InsightContent } from "@geokit/geo-kit";

export const knowledgeInsights: InsightContent[] = ${JSON.stringify(insights, null, 2)};

export default knowledgeInsights;
`;
}

/**
 * 把知识文章合并进站点内容包（内存操作，不写文件）。
 *
 * 这是**显式调用**才会发生的合并 —— 客户在内容包里决定要不要用。
 */
export function applyKnowledgeArticles(
  content: SiteContent,
  insights: InsightContent[],
  options: { replace?: boolean } = {},
): SiteContent {
  const merged = options.replace
    ? insights
    : [...insights, ...(content.insights ?? [])];

  const sections = content.sections.map((s) =>
    s.type === "insights"
      ? {
          ...s,
          body: [
            `以下内容来自知识库，共 ${insights.length} 篇，随知识库更新自动同步。`,
            ...(s.body ?? []).slice(1),
          ],
        }
      : s,
  );

  return { ...content, sections, insights: merged };
}

/**
 * 生成同步报告（给人看的）。
 */
export function renderSyncReport(result: SyncResult): string {
  const lines: string[] = [];
  lines.push(`知识库同步 — ${result.kbName}`);
  lines.push(
    `条目 ${result.stats.total} 条 → 采用 ${result.stats.included} 条，跳过 ${result.stats.skipped} 条（其中标题重复 ${result.stats.deduped} 条）`,
  );
  lines.push("");

  if (result.insights.length > 0) {
    lines.push("已采用：");
    for (const i of result.insights.slice(0, 20)) {
      lines.push(`  · ${i.title}`);
    }
    if (result.insights.length > 20) {
      lines.push(`  … 另有 ${result.insights.length - 20} 条`);
    }
    lines.push("");
  }

  if (result.skipped.length > 0) {
    lines.push("已跳过：");
    const byReason = new Map<string, typeof result.skipped>();
    for (const s of result.skipped) {
      const list = byReason.get(s.reason) ?? [];
      list.push(s);
      byReason.set(s.reason, list);
    }
    for (const [reason, list] of byReason) {
      lines.push(`  · ${reason} —— ${list.length} 条`);
      for (const s of list.slice(0, 3)) {
        lines.push(`      ${s.title}`);
      }
    }
  }

  return lines.join("\n");
}

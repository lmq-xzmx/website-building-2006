/**
 * 模块编排物化 —— 把「编排」+「知识库」变成「可直接渲染的内容」。
 *
 * 与 plan 的 applyPlan 同一个原则：
 *   **后台看到的 = 构建出来的**。
 * 所以物化逻辑只有这一份，后台预览、发布、构建全都调它。
 *
 * 物化做的事：
 *   1. 条目 source=kb → 取知识条目的正文，转成富文本（知识库正文是纯文本）
 *   2. 条目 source=manual → 用后台写的富文本
 *   3. 过滤掉草稿条目、停用的模块、未发布的页面
 *   4. 排序（order 升序）
 */

import type { KnowledgeItem } from "../sync/knowledge-sync.js";
import { structureContent } from "../sync/knowledge-sync.js";
import { docToParagraphs, readingMinutes } from "../rich-text/convert.js";
import type { RichTextDoc, RichTextNode } from "../rich-text/types.js";
import type {
  ContentItem,
  ContentModule,
  PageContent,
} from "../types.js";
import type { ModuleItem, ModulePlan, PageDef, PageModule } from "./types.js";

/** 物化后的条目 —— 与渲染层 ContentItem 同形 */
export type MaterializedItem = ContentItem;
/** 物化后的模块 */
export type MaterializedModule = ContentModule;
/** 物化后的页面 */
export type MaterializedPage = PageContent;

/** 纯文本 → 富文本文档 */
export function textToDoc(text: string): RichTextDoc {
  const structured = structureContent(text ?? "");
  const content: RichTextNode[] = [];

  for (const p of structured.paragraphs) {
    content.push({ type: "paragraph", content: [{ type: "text", text: p }] });
  }
  for (const list of structured.lists) {
    if (!list.length) continue;
    content.push({
      type: "bulletList",
      content: list.map((li) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: li }] }],
      })),
    });
  }

  if (!content.length) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

/** 知识条目 → 物化条目 */
function materializeKbItem(
  item: ModuleItem,
  kb: KnowledgeItem,
): MaterializedItem {
  const body = item.body ?? textToDoc(kb.content ?? "");
  const paragraphs = docToParagraphs(body);
  const title = item.title ?? kb.title;

  const out: MaterializedItem = {
    id: item.id,
    source: "kb",
    title,
    summary: item.summary ?? kb.summary,
    body,
    paragraphs,
    tags: item.tags ?? kb.tags ?? undefined,
    image: item.image,
  };

  if (item.specs) out.specs = item.specs;
  if (item.client) out.client = item.client;
  if (item.results) out.results = item.results;
  if (item.question) out.question = item.question;
  if (item.answer) out.answer = item.answer;
  if (item.value) out.value = item.value;
  if (item.unit) out.unit = item.unit;
  if (item.label) out.label = item.label;
  if (item.alt) out.alt = item.alt;
  if (item.caption) out.caption = item.caption;
  if (item.step !== undefined) out.step = item.step;

  // 案例：客户名与量化结果可以从知识条目里补（后台手填优先）
  if (!out.client) {
    const m = kb.content?.match(/客户[：:]\s*(.+)/);
    if (m?.[1]) out.client = m[1].trim();
  }

  out.readingMinutes = readingMinutes(body);
  return out;
}

/** 手工条目 → 物化条目 */
function materializeManualItem(item: ModuleItem): MaterializedItem {
  const body = item.body ?? { type: "doc", content: [{ type: "paragraph" }] };
  const paragraphs = docToParagraphs(body);

  const out: MaterializedItem = {
    id: item.id,
    source: "manual",
    title: item.title ?? "",
    summary: item.summary,
    body,
    paragraphs,
    tags: item.tags,
    image: item.image,
  };

  if (item.specs) out.specs = item.specs;
  if (item.client) out.client = item.client;
  if (item.results) out.results = item.results;
  if (item.question) out.question = item.question;
  if (item.answer) out.answer = item.answer;
  if (item.value) out.value = item.value;
  if (item.unit) out.unit = item.unit;
  if (item.label) out.label = item.label;
  if (item.alt) out.alt = item.alt;
  if (item.caption) out.caption = item.caption;
  if (item.step !== undefined) out.step = item.step;

  out.readingMinutes = readingMinutes(body);
  return out;
}

/** 物化一个条目 */
export function materializeItem(
  item: ModuleItem,
  items: Map<string, KnowledgeItem>,
): MaterializedItem | null {
  if (item.source === "kb") {
    if (!item.kbItemId) return null;
    const kb = items.get(item.kbItemId);
    if (!kb) return null;
    return materializeKbItem(item, kb);
  }
  return materializeManualItem(item);
}

/**
 * 定时发布是否已生效。
 *
 * 未到时间 = 还没发布（等同草稿）。
 * 用构建时刻判断 —— 所以**不需要后台定时任务**，
 * 每次发布/构建时算一次，站点到点自动切换。
 */
export function isPublishDue(publishAt: string | undefined, now: Date): boolean {
  if (!publishAt) return true;
  const t = Date.parse(publishAt);
  if (Number.isNaN(t)) return true; // 时间串坏了 → 当作立即发布，不卡住发布
  return t <= now.getTime();
}

/**
 * 排序：置顶的在前，其余按 order 升序。
 *
 * 置顶优先于 order —— 运营把一条标成置顶，是要它排最前，
 * 不该被 order 覆盖掉。
 */
export function compareForDisplay<T extends { order: number; sticky?: boolean }>(
  a: T,
  b: T,
): number {
  const sa = a.sticky ? 0 : 1;
  const sb = b.sticky ? 0 : 1;
  if (sa !== sb) return sa - sb;
  return a.order - b.order;
}

/** 物化一个模块 */
export function materializeModule(
  module: PageModule,
  items: Map<string, KnowledgeItem>,
  now: Date = new Date(),
): MaterializedModule {
  const sorted = [...(module.items ?? [])].sort(compareForDisplay);
  const materialized: MaterializedItem[] = [];

  for (const item of sorted) {
    if (!item.published) continue;
    // 定时发布未到 → 当作还没发布
    if (!isPublishDue(item.publishAt, now)) continue;
    const m = materializeItem(item, items);
    if (m) materialized.push(m);
  }

  return {
    id: module.id,
    type: module.type,
    title: module.title,
    subtitle: module.subtitle,
    props: module.props,
    items: materialized,
  };
}

/** 物化一个页面 */
export function materializePage(
  page: PageDef,
  items: Map<string, KnowledgeItem>,
  now: Date = new Date(),
): MaterializedPage {
  const sorted = [...(page.modules ?? [])].sort(compareForDisplay);
  const modules: MaterializedModule[] = [];

  for (const module of sorted) {
    if (!module.enabled) continue;
    // 模块自身的定时发布
    if (!isPublishDue(module.publishAt, now)) continue;
    modules.push(materializeModule(module, items, now));
  }

  return {
    id: page.id,
    path: page.path,
    title: page.title,
    description: page.description,
    modules,
  };
}

/** 物化整个编排 */
export function materializeModulePlan(
  plan: ModulePlan,
  items: Map<string, KnowledgeItem>,
): {
  pages: MaterializedPage[];
  skipped: Array<{ pageId: string; moduleId: string; itemId: string; reason: string }>;
} {  const skipped: Array<{
    pageId: string;
    moduleId: string;
    itemId: string;
    reason: string;
  }> = [];

  const pages: MaterializedPage[] = [];
  const sorted = [...plan.pages].sort((a, b) => a.order - b.order);

  for (const page of sorted) {
    if (!page.published) continue;

    // 先检查有没有条目会掉（知识库已删）
    for (const module of page.modules ?? []) {
      for (const item of module.items ?? []) {
        if (item.source === "kb" && item.kbItemId && !items.has(item.kbItemId)) {
          skipped.push({
            pageId: page.id,
            moduleId: module.id,
            itemId: item.id,
            reason: "知识库中已不存在该条目",
          });
        }
      }
    }

    pages.push(materializePage(page, items));
  }

  return { pages, skipped };
}

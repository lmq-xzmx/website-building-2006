/**
 * 实例 → 页面 —— 模版的「生成」能力。
 *
 * 一个已发布实例按模版布局展开成一个 PageDef：
 *   heading 块 → hero 模块（H1 = 实例名，引导语 = 第一个 text 字段的摘要行）
 *   text 块    → rich-text 模块（字段值按行拆段落）
 *   metrics 块 → stats 模块（value/unit/label 三元组）
 *   bullets 块 → rich-text 模块（数组项渲染成要点列表）
 *   cta 块     → cta 模块（指向联系页）
 *
 * 展开走的是**既有模块模型** —— 骨架模板零改动。
 *
 * 幂等：生成的页面带 generatedFrom = 实例 id，
 * 重复生成是更新同一页（slug 变了就挪路径），不产生重复页面。
 */

import { isDocEmpty } from "../rich-text/types.js";
import { textToDoc } from "../modules/materialize.js";
import type { PageDef, PageModule, ModuleItem } from "../modules/types.js";
import { normalizePath } from "../modules/validate.js";
import {
  instancePath,
  type ContentTemplate,
  type TemplateInstance,
  type TemplateLibrary,
  type TemplateValue,
} from "./types.js";

/** 新页面/模块的 id 生成 —— 与模块模型同款随机段 */
function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 把字符串字段值拆成 ProseMirror 文档（按行分段；空行分段落） */
function fieldToDoc(v: TemplateValue): ReturnType<typeof textToDoc> {
  const text = typeof v === "string" ? v.trim() : "";
  if (!text) return textToDoc("");
  return textToDoc(text);
}

/** 从实例的 values 里取第一个「能当引导语」的短文本 */
function leadOf(tpl: ContentTemplate, ins: TemplateInstance): string {
  const field = tpl.fields.find((f) => f.type === "text" || f.type === "longtext");
  if (!field) return "";
  const v = ins.values?.[field.key];
  if (typeof v !== "string") return "";
  // 引导语只要第一行 —— 全文进正文块
  return v.trim().split(/\n/)[0]?.trim() ?? "";
}

/** 一个布局块 → 模块（没有内容就返回 null，跳过） */
function blockToModule(
  tpl: ContentTemplate,
  ins: TemplateInstance,
  block: ContentTemplate["page"]["blocks"][number],
): PageModule | null {
  const base = { order: 0, enabled: true, published: true };
  const withItems = (items: ModuleItem[], extra: Partial<PageModule> = {}): PageModule => ({
    ...base,
    id: rid("mod"),
    type: "rich-text",
    items,
    ...extra,
  });

  switch (block.kind) {
    case "heading": {
      const lead = leadOf(tpl, ins);
      return {
        ...base,
        id: rid("mod"),
        type: "hero",
        title: block.title,
        items: [
          {
            id: rid("it"),
            source: "manual",
            title: ins.name,
            summary: lead,
            body: textToDoc(lead),
            order: 0,
            published: true,
          },
        ],
      };
    }
    case "text": {
      if (!block.field) return null;
      const doc = fieldToDoc(ins.values?.[block.field] ?? "");
      if (isDocEmpty(doc)) return null; // 空文档就不渲染这个块
      return withItems(
        [
          {
            id: rid("it"),
            source: "manual",
            title: block.title ?? "",
            body: doc,
            order: 0,
            published: true,
          },
        ],
        { type: "rich-text", title: block.title },
      );
    }
    case "metrics": {
      if (!block.field) return null;
      const v = ins.values?.[block.field];
      if (!Array.isArray(v) || !v.length) return null;
      return {
        ...base,
        id: rid("mod"),
        type: "stats",
        title: block.title,
        items: v.map((m, i) => ({
          id: rid("it"),
          source: "manual",
          value: m.value,
          unit: m.unit,
          label: m.label ?? "",
          order: i,
          published: true,
        })),
      };
    }
    case "bullets": {
      if (!block.field) return null;
      const v = ins.values?.[block.field];
      if (!Array.isArray(v) || !v.length) return null;
      const lines = v.map((s) => `- ${String(s)}`).join("\n");
      return withItems(
        [
          {
            id: rid("it"),
            source: "manual",
            title: block.title ?? "",
            body: textToDoc(lines),
            order: 0,
            published: true,
          },
        ],
        { title: block.title },
      );
    }
    case "cta": {
      return {
        ...base,
        id: rid("mod"),
        type: "cta",
        title: block.title ?? "想聊聊你的场景？",
        items: [
          {
            id: rid("it"),
            source: "manual",
            title: block.title ?? "想聊聊你的场景？",
            summary: "留下需求，解决方案工程师会在 1 个工作日内联系你。",
            href: "/contact",
            order: 0,
            published: true,
          },
        ],
      };
    }
    default:
      return null;
  }
}

/**
 * 把一个实例展开成 PageDef。
 * 返回 null = 内容不完整（模版缺字段值），不生成空壳页。
 */
export function materializeInstance(
  tpl: ContentTemplate,
  ins: TemplateInstance,
): PageDef | null {
  const modules: PageModule[] = [];
  for (const block of tpl.page.blocks ?? []) {
    const m = blockToModule(tpl, ins, block);
    if (m) {
      m.order = modules.length;
      modules.push(m);
    }
  }
  if (!modules.length) return null;
  // 只有标题和 CTA、没有任何实质内容块（正文/指标/要点）= 空壳页 —— 不生成。
  // 发布空壳比不发布更糟：AI 会引用一个没有依据的页面。
  const hasContent = modules.some(
    (m) => m.type === "rich-text" || m.type === "stats",
  );
  if (!hasContent) return null;

  return {
    id: ins.generatedPageId ?? rid("pg"),
    path: normalizePath(instancePath(tpl, ins)),
    title: ins.name,
    description: leadOf(tpl, ins) || ins.name,
    modules,
    order: ins.order ?? 100,
    published: ins.published,
    generatedFrom: ins.id,
  };
}

/**
 * 把整个模版库的实例**更新**进编排：
 *   - 已发布的实例 → 生成/更新页面
 *   - 草稿或已删除的实例 → 摘掉对应页面
 *
 * 「更新」按 generatedFrom 匹配 —— 实例是唯一事实源，
 * 手动改过生成页的内容会在下一次生成时被覆盖（页面顶部有标注提示）。
 */
export function generateTemplatePages(
  plan: { pages: Array<PageDef> },
  lib: TemplateLibrary,
): { pages: Array<PageDef>; generated: number; removed: number } {
  const tplById = new Map(lib.templates.map((t) => [t.id, t]));
  const liveIds = new Set<string>();

  const generated: PageDef[] = [];
  for (const ins of lib.instances ?? []) {
    if (!ins.published) continue;
    const tpl = tplById.get(ins.templateId);
    if (!tpl) continue;
    const page = materializeInstance(tpl, ins);
    if (!page) continue;
    liveIds.add(ins.id);
    generated.push(page);
  }

  // 编排里既有的生成页：还活着的更新，死掉的摘除
  const kept = (plan.pages ?? []).filter((p) => {
    if (!p.generatedFrom) return true;
    return liveIds.has(p.generatedFrom);
  });
  // 去掉旧的生成页（由 generated 全量替换 —— 内容与路径都可能变）
  const manual = kept.filter((p) => !p.generatedFrom);
  const removed = (plan.pages ?? []).length - manual.length;

  const pages = [...manual, ...generated].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { pages, generated: generated.length, removed };
}

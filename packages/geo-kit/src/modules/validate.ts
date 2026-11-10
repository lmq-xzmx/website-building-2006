/**
 * 模块编排的校验 —— 与 plan 的 validatePlan 同思路。
 *
 * 原则：**发布出空壳比不发布更糟**。
 * AI 会引用一个没有依据的案例，比没有案例更可信 —— 这是幻觉的温床。
 * 所以缺关键字段的条目一律拦住。
 */

import type { KnowledgeItem } from "../sync/knowledge-sync.js";
import { isDocEmpty } from "../rich-text/types.js";
import type { ModuleItem, ModulePlan, PageModule } from "./types.js";

export interface ValidationProblem {
  /** 定位：页面 → 模块 → 条目 */
  pageId: string;
  pageTitle: string;
  moduleId: string;
  moduleTitle: string;
  itemId: string;
  itemTitle: string;
  /** 问题描述 */
  message: string;
  /** 严重级：error = 阻止发布；warn = 允许但提醒 */
  level: "error" | "warn";
}

function itemLabel(item: ModuleItem): string {
  return item.title ?? item.question ?? item.label ?? item.kbItemId ?? item.id;
}

/** 校验单个条目 */
function validateItem(
  item: ModuleItem,
  module: PageModule,
  items: Map<string, KnowledgeItem>,
): ValidationProblem[] {
  const out: ValidationProblem[] = [];
  const label = itemLabel(item);

  const push = (message: string, level: "error" | "warn" = "error") => {
    out.push({
      pageId: "",
      pageTitle: "",
      moduleId: module.id,
      moduleTitle: module.title ?? module.type,
      itemId: item.id,
      itemTitle: label,
      message,
      level,
    });
  };

  if (item.source === "kb") {
    if (!item.kbItemId) {
      push("来源是知识库，但没有指定知识条目");
      return out;
    }
    const kb = items.get(item.kbItemId);
    if (!kb) {
      push("知识库中找不到该条目（可能已被删除）");
      return out;
    }
    if (!kb.content?.trim() && !item.body) {
      push("正文为空 —— 发布出来是空页面");
    }
    if (module.type === "card-grid" && !item.summary && !kb.summary) {
      push("缺摘要 —— 卡片网格没有摘要会很单薄", "warn");
    }
  } else {
    // 手工创作
    //
    // 「正文为空」只对**以正文为主**的模块成立。
    // stats / cta 这类模块的内容就是数值与标签，没有正文是正常的 ——
    // 校验过严会把正确的内容拦下来，用户就再也不信校验了。
    const bodyless = module.type === "stats" || module.type === "cta";
    if (!bodyless && isDocEmpty(item.body) && !item.summary && !item.answer) {
      push("手工条目正文为空");
    }
  }

  // 按模块类型的必填项
  switch (module.type) {
    case "card-grid": {
      const kind = String(module.props?.kind ?? "");
      if (kind === "cases") {
        if (!item.client) push("案例缺客户名");
        if (!item.results?.length) push("案例缺量化结果");
      }
      if (kind === "products" && !item.specs?.length) {
        push("产品缺规格表");
      }
      break;
    }
    case "faq": {
      const q = item.question ?? item.title;
      if (!q) push("FAQ 缺问题");
      else if (!/[？?]$/.test(q)) push("FAQ 问题应是问句（以？结尾）");
      if (!item.answer) push("FAQ 缺答案");
      break;
    }
    case "stats": {
      if (!item.value) push("数据条缺数值");
      if (!item.label) push("数据条缺标签");
      break;
    }
    case "hero": {
      if (!item.title) push("英雄区缺 H1 —— 缺了 AI 就没有可摘的定位句");
      break;
    }
    case "cta": {
      if (!item.title) push("行动号召缺标题");
      if (!item.href) push("行动号召缺跳转链接");
      break;
    }
    default:
      break;
  }

  return out;
}

/** 校验整个编排 */
export function validateModulePlan(
  plan: ModulePlan,
  items: Map<string, KnowledgeItem>,
): ValidationProblem[] {
  const out: ValidationProblem[] = [];
  const seenPaths = new Set<string>();
  const seenPageIds = new Set<string>();

  for (const page of plan.pages) {
    if (seenPageIds.has(page.id)) {
      out.push({
        pageId: page.id,
        pageTitle: page.title,
        moduleId: "",
        moduleTitle: "",
        itemId: "",
        itemTitle: page.title,
        message: "页面 id 重复",
        level: "error",
      });
    }
    seenPageIds.add(page.id);

    if (page.published) {
      const path = normalizePath(page.path);
      if (seenPaths.has(path)) {
        out.push({
          pageId: page.id,
          pageTitle: page.title,
          moduleId: "",
          moduleTitle: "",
          itemId: "",
          itemTitle: page.title,
          message: `路由路径重复：${path}`,
          level: "error",
        });
      }
      seenPaths.add(path);

      if (!page.description?.trim()) {
        out.push({
          pageId: page.id,
          pageTitle: page.title,
          moduleId: "",
          moduleTitle: "",
          itemId: "",
          itemTitle: page.title,
          message: "页面缺 description —— 每页必须有自己的一份，否则 AI 无法区分页面实体",
          level: "warn",
        });
      }

      // page.modules 可能缺失 —— 编排是外部输入，不能假设结构完整
      const enabled = (page.modules ?? []).filter((m) => m.enabled);
      if (enabled.length === 0) {
        out.push({
          pageId: page.id,
          pageTitle: page.title,
          moduleId: "",
          moduleTitle: "",
          itemId: "",
          itemTitle: page.title,
          message: "页面没有任何启用的模块 —— 发布会得到一个空页",
          level: "error",
        });
      }
    }

    for (const module of page.modules ?? []) {
      for (const item of module.items ?? []) {
        if (!item.published) continue;
        const problems = validateItem(item, module, items);
        for (const p of problems) {
          p.pageId = page.id;
          p.pageTitle = page.title;
          out.push(p);
        }
      }
    }
  }

  return out;
}

/** 路径规范化 —— 统一前导斜杠、去尾斜杠（根路径除外） */
export function normalizePath(path: string): string {
  let p = (path ?? "").trim();
  if (!p) return "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p;
}

/** 校验路径合法性 —— 防目录穿越 */
export function isValidPath(path: string): boolean {
  const p = normalizePath(path);
  if (p === "/") return true;
  return /^\/[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(p) && !p.includes("..");
}

/** 汇总统计 —— 后台顶部的数字 */
export function modulePlanStats(plan: ModulePlan) {
  let pages = 0;
  let modules = 0;
  let items = 0;
  let publishedItems = 0;
  let kbItems = 0;
  let manualItems = 0;
  const byType: Record<string, { total: number; published: number }> = {};

  for (const page of plan.pages) {
    if (!page.published) continue;
    pages++;
    for (const module of page.modules) {
      if (!module.enabled) continue;
      modules++;
      const t = (byType[module.type] ??= { total: 0, published: 0 });
      t.total++;
      for (const item of module.items) {
        items++;
        if (item.source === "kb") kbItems++;
        else manualItems++;
        if (item.published) {
          publishedItems++;
          t.published++;
        }
      }
    }
  }

  return {
    pages,
    modules,
    items,
    publishedItems,
    draftItems: items - publishedItems,
    kbItems,
    manualItems,
    byType,
  };
}

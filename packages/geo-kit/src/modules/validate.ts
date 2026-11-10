/**
 * 模块编排的校验 —— 与 plan 的 validatePlan 同思路。
 *
 * 原则：**发布出空壳比不发布更糟**。
 * AI 会引用一个没有依据的案例，比没有案例更可信 —— 这是幻觉的温床。
 * 所以缺关键字段的条目一律拦住。
 */

import type { KnowledgeItem } from "../sync/knowledge-sync.js";
import { isDocEmpty } from "../rich-text/types.js";
import { resolveFragmentModule, type FragmentMap } from "../fragments/apply.js";
import type { Fragment } from "../fragments/types.js";
import type { FormFieldDef, ModuleItem, ModulePlan, PageDef, PageModule } from "./types.js";

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
    // trust / logo-wall / form 同理 —— 它们的内容就是图与字段，不是正文。
    const bodyless =
      module.type === "stats" ||
      module.type === "cta" ||
      module.type === "trust" ||
      module.type === "logo-wall" ||
      module.type === "form";
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
    case "trust": {
      // 信任背书是「拿证据说话」—— 没有图或没有说明就是空壳，
      // 发布出去反而削弱信任。
      if (!item.title) push("信任背书缺标题 —— 说的是哪项资质/哪份数据");
      if (!item.image) push("信任背书缺图片 —— 资质证书/数据来源要有原件");
      if (!item.alt?.trim()) {
        push("信任背书图片缺 alt —— 无障碍与 AI 识图都靠它", "warn");
      }
      break;
    }
    case "logo-wall": {
      if (!item.image) push("客户 logo 缺图片");
      if (!item.title?.trim()) push("客户 logo 缺客户名 —— 只是一张图说明不了是谁");
      if (!item.alt?.trim()) {
        push("客户 logo 缺 alt —— 写清客户名，屏幕阅读器才读得出", "warn");
      }
      break;
    }
    case "process": {
      if (!item.title) push("流程步骤缺标题");
      if (item.step === undefined) push("流程步骤缺序号 —— 步骤的先后顺序是流程的核心信息");
      if (isDocEmpty(item.body) && !item.summary) {
        push("流程步骤缺说明 —— 只剩标题等于没讲清楚这一步做什么");
      }
      break;
    }
    case "form": {
      // 条目只负责说明「提交之后会发生什么」，
      // 字段定义放在模块 props 里 —— 那边单独校验。
      if (!item.title) push("表单模块缺提交结果说明 —— 用户要知道提交后会怎样");
      break;
    }
    default:
      break;
  }

  return out;
}

/**
 * 表单模块的字段校验。
 *
 * 为什么单独一层：字段是**模块级**配置（props.fields），
 * 而「必填项有多少」直接决定转化摩擦 —— 必须在模块这一层看，
 * 摊到条目上就看不出表单一共要用户填几个。
 */
function validateFormModule(module: PageModule, page: PageDef): ValidationProblem[] {
  const out: ValidationProblem[] = [];
  const push = (message: string, level: "error" | "warn" = "error") => {
    out.push({
      pageId: page.id,
      pageTitle: page.title,
      moduleId: module.id,
      moduleTitle: module.title ?? module.type,
      itemId: "",
      itemTitle: module.title ?? module.type,
      message,
      level,
    });
  };

  const raw = module.props?.fields;
  const fields: FormFieldDef[] = Array.isArray(raw) ? (raw as FormFieldDef[]) : [];
  if (fields.length === 0) {
    push("表单没有定义字段 —— 渲染出来是空表单");
    return out;
  }

  const required = fields.filter((f) => f?.required);
  if (required.length === 0) {
    push("表单没有必填项 —— 收不到任何有效线索", "warn");
  } else if (required.length > 5) {
    push(`表单必填字段 ${required.length} 个 —— 每多一个必填就多一道流失，控制在 3–5 个`);
  }

  for (const f of fields) {
    if (!f?.name) push("表单字段缺 name —— 提交时不知道这个值叫什么");
    if (!f?.label) push("表单字段缺标签 —— 用户看不懂要填什么", "warn");
  }

  return out;
}

/**
 * 校验片段本体。
 *
 * 片段的条目按**现有模块类型的规则**校验 —— 片段就是模块，
 * 「公司简介」片段里的段落跟页面上的模块段落没有区别。
 * 差别只有一条：片段必须**有内容** —— 空片段引用出去就是空区块。
 */
export function validateFragment(
  fragment: Fragment,
  items: Map<string, KnowledgeItem>,
): ValidationProblem[] {
  const out: ValidationProblem[] = [];
  const pseudo: PageModule = {
    id: fragment.id,
    type: fragment.type,
    title: fragment.name,
    props: fragment.props,
    items: fragment.items ?? [],
    order: 0,
    enabled: true,
  };
  const fakePage: PageDef = {
    id: "",
    path: "",
    title: fragment.name,
    modules: [],
    order: 0,
    published: false,
  };

  if (!fragment.name?.trim()) {
    out.push({
      pageId: "",
      pageTitle: "",
      moduleId: fragment.id,
      moduleTitle: fragment.id,
      itemId: "",
      itemTitle: fragment.id,
      message: "片段没有名字 —— 列表里分不清谁是谁",
      level: "error",
    });
  }

  if (!fragment.items?.length) {
    out.push({
      pageId: "",
      pageTitle: "",
      moduleId: fragment.id,
      moduleTitle: fragment.name,
      itemId: "",
      itemTitle: fragment.name,
      message: "片段没有条目 —— 引用它的页面会渲染出一个空区块",
      level: "error",
    });
  }

  if (fragment.type === "form") {
    out.push(...validateFormModule(pseudo, fakePage));
  }

  for (const item of fragment.items ?? []) {
    if (!item.published) continue;
    for (const p of validateItem(item, pseudo, items)) out.push(p);
  }

  return out;
}

/**
 * 校验整个编排。
 *
 * fragments 传入时，引用片段的模块按**展开后的内容**校验 ——
 * 片段里的条目同样要满足类型规则，引用一个坏片段不能蒙混过关。
 */
export function validateModulePlan(
  plan: ModulePlan,
  items: Map<string, KnowledgeItem>,
  fragments?: FragmentMap,
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

    for (const raw of page.modules ?? []) {
      // 引用片段的模块：内容在片段里 —— 校验展开后的内容
      let module = raw;
      if (raw.fragmentId) {
        const fragment = fragments?.get(raw.fragmentId);
        if (!fragment) {
          out.push({
            pageId: page.id,
            pageTitle: page.title,
            moduleId: raw.id,
            moduleTitle: raw.title ?? raw.type,
            itemId: "",
            itemTitle: raw.title ?? raw.type,
            message: "引用的片段不存在（可能已被删除）—— 请改成自有内容或换一个片段",
            level: "error",
          });
          continue;
        }
        module = resolveFragmentModule(raw, fragment);
      }

      // 表单的字段定义是**模块级**的 —— 必填项数量直接决定转化摩擦，
      // 所以在模块这一层校验，不摊到条目上。
      if (module.type === "form") {
        out.push(...validateFormModule(module, page));
      }
      for (const item of module.items ?? []) {
        if (!item.published) continue;
        // 审核状态 —— 待审与被驳回的内容**不许发布**。
        //
        // 为什么拦在发布这一层而不是物化那一层：
        //   物化跳过它们就够（不会进站），但那样发布者会以为发布成功了 ——
        //   「站上没有这条」比「发布被拦住并说明原因」难查得多。
        if (item.review === "pending") {
          out.push({
            pageId: page.id,
            pageTitle: page.title,
            moduleId: module.id,
            moduleTitle: module.title ?? module.type,
            itemId: item.id,
            itemTitle: item.title ?? item.question ?? "",
            message: "内容待审核 —— 请先让审核员通过再发布",
            level: "error",
          });
          continue;
        }
        if (item.review === "rejected") {
          out.push({
            pageId: page.id,
            pageTitle: page.title,
            moduleId: module.id,
            moduleTitle: module.title ?? module.type,
            itemId: item.id,
            itemTitle: item.title ?? item.question ?? "",
            message: "内容被驳回 —— 改完重新提交审核再发布",
            level: "error",
          });
          continue;
        }
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
export function modulePlanStats(
  plan: ModulePlan,
  fragments?: FragmentMap,
) {
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
    for (const raw of page.modules) {
      if (!raw.enabled) continue;
      // 引用片段的模块要按**展开后**的条目算 ——
      // 否则统计会显示「0 条」，后台看着像模块是空的。
      const module = raw.fragmentId
        ? resolveFragmentModule(raw, fragments?.get(raw.fragmentId))
        : raw;
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

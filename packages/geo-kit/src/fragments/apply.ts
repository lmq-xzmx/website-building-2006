/**
 * 片段的展开与转换 —— 引用与本体之间的那层胶水。
 *
 * ── 三件事 ────────────────────────────────────────────
 *   1. 展开：引用型模块 + 片段 → 一个内容完整的普通模块
 *   2. 存为片段：普通模块 → 片段（内容搬过去）
 *   3. 脱离引用：引用型模块 → 普通模块（内容拷一份，改成自有内容）
 *
 * ── 展开后的模块为什么与普通模块无差别 ────────────────
 *   渲染层只认 type/title/items/props ——
 *   展开把这四样填齐，骨架模板**不需要知道片段的存在**。
 *   所以新加一种片段类型不用改模板。
 */

import type {
  FragmentItemOverride,
  ModuleItem,
  PageModule,
} from "../modules/types.js";
import { newFragmentId, type Fragment } from "./types.js";

/** 片段查找表 */
export type FragmentMap = Map<string, Fragment>;

/** 深拷贝一份 JSON 值 —— 避免片段与模块共享同一份对象引用 */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/**
 * 条目覆盖里真正会被写回的字段。
 *
 * 为什么要白名单：
 *   `hidden` 是**指令**不是内容（意思是「这条不要」），
 *   直接展开进条目会多出一个垃圾字段；
 *   其余字段原样覆盖。
 */
const ITEM_OVERRIDE_FIELDS = [
  "title",
  "summary",
  "body",
  "image",
  "question",
  "answer",
  "value",
  "unit",
  "label",
  "href",
  "client",
  "results",
  "specs",
  "alt",
  "caption",
  "step",
  "published",
] as const;

/** 把一条覆盖应用到条目上 */
function applyItemOverride(item: ModuleItem, ov: FragmentItemOverride): ModuleItem {
  const out: ModuleItem = { ...item };
  for (const f of ITEM_OVERRIDE_FIELDS) {
    const v = ov[f];
    if (v !== undefined) {
      // 结果/规格是数组 —— 整体替换，不做深合并
      (out as unknown as Record<string, unknown>)[f] = clone(v);
    }
  }
  return out;
}

/**
 * 展开一个模块引用 —— 片段内容 + 局部覆盖。
 *
 * 优先级（从高到低）：
 *   1. 引用点显式写的 overrides
 *   2. 引用点模块自身带的 title/subtitle（当成本地覆盖）
 *   3. 片段本体的内容
 *
 * 片段不存在时**原样返回** —— 展开失败不该让整页渲染崩掉，
 * 真正要拦住的是发布（见 modules/validate.ts 的 error 级问题）。
 */
export function resolveFragmentModule(
  module: PageModule,
  fragment: Fragment | undefined,
): PageModule {
  if (!module.fragmentId) return module;
  if (!fragment) return module;

  const ov = module.overrides ?? {};
  const overridesByItem = new Map<string, FragmentItemOverride>();
  for (const io of ov.items ?? []) {
    if (io?.itemId) overridesByItem.set(io.itemId, io);
  }

  const items: ModuleItem[] = [];
  for (const item of fragment.items ?? []) {
    const io = overridesByItem.get(item.id);
    if (!io) {
      items.push(clone(item));
      continue;
    }
    if (io.hidden) continue; // 这一处不要这条
    items.push(applyItemOverride(clone(item), io));
  }

  // 引用点本地追加的条目 —— 只在这一处出现，不进片段本体。
  for (const extra of module.extraItems ?? []) {
    items.push(clone(extra));
  }

  return {
    ...module,
    type: fragment.type,
    title: ov.title ?? module.title ?? fragment.title,
    subtitle: ov.subtitle ?? module.subtitle ?? fragment.subtitle,
    props: { ...(fragment.props ?? {}), ...(ov.props ?? {}) },
    items,
  };
}

/**
 * 展开整份编排里的所有片段引用。
 *
 * 返回一份新的编排 —— 原编排不动（后台要看到「引用」这个事实，
 * 不能被展开结果盖掉）。
 */
export function expandFragmentPlan(
  plan: { pages: Array<{ modules: PageModule[] }> },
  fragments: FragmentMap,
): { pages: Array<{ modules: PageModule[] }> } {
  return {
    ...plan,
    pages: plan.pages.map((page) => ({
      ...page,
      modules: (page.modules ?? []).map((m) =>
        resolveFragmentModule(m, m.fragmentId ? fragments.get(m.fragmentId) : undefined),
      ),
    })),
  };
}

/**
 * 普通模块 → 片段。
 *
 * 条目 id **原样保留** —— 覆盖是按条目 id 定位的，
 * 保留 id 才能让引用点覆盖到正确的条目。
 */
export function moduleToFragment(
  module: PageModule,
  name: string,
  description?: string,
): Fragment {
  const now = new Date().toISOString();
  return {
    id: newFragmentId(),
    name: name.trim() || module.title?.trim() || "未命名片段",
    description: description?.trim() || undefined,
    type: module.type,
    title: module.title,
    subtitle: module.subtitle,
    items: clone(module.items ?? []),
    props: clone(module.props),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 脱离引用 —— 把片段内容拷成模块的自有内容。
 *
 * 拷贝而不是共享：脱离之后这一处就该与片段**无关**，
 * 片段再改也不影响这里（这正是「脱离」的意义）。
 */
export function detachFragmentModule(
  module: PageModule,
  fragment: Fragment | undefined,
): PageModule {
  if (!module.fragmentId) return module;
  if (!fragment) {
    // 片段没了 —— 只能把引用标记去掉，内容仍然是空的
    const { fragmentId: _f, overrides: _o, ...rest } = module;
    return { ...rest, items: clone(module.items ?? []) };
  }

  const resolved = resolveFragmentModule(module, fragment);
  const { fragmentId: _f, overrides: _o, ...rest } = resolved;
  return {
    ...rest,
    items: clone(resolved.items ?? []),
  };
}

/**
 * 片段 → 一个独立的模块（内容拷一份）。
 *
 * 用于「插入片段」时不想用引用关系的场合 ——
 * 其实后台的插入默认走引用，这个函数留给 API 直接造模块用。
 */
export function fragmentToModule(
  fragment: Fragment,
  init: { id: string; order: number; enabled?: boolean },
): PageModule {
  return {
    id: init.id,
    type: fragment.type,
    title: fragment.title,
    subtitle: fragment.subtitle,
    items: clone(fragment.items ?? []),
    props: clone(fragment.props),
    order: init.order,
    enabled: init.enabled ?? true,
  };
}

/** 编排里引用了哪些片段 —— 后台用来提示「删片段前先看谁在用」 */
export function fragmentUsage(
  plan: { pages: Array<{ id: string; title: string; modules: PageModule[] }> },
): Map<string, Array<{ pageId: string; pageTitle: string; moduleId: string }>> {
  const usage = new Map<string, Array<{ pageId: string; pageTitle: string; moduleId: string }>>();
  for (const page of plan.pages ?? []) {
    for (const m of page.modules ?? []) {
      if (!m.fragmentId) continue;
      const list = usage.get(m.fragmentId) ?? [];
      list.push({ pageId: page.id, pageTitle: page.title, moduleId: m.id });
      usage.set(m.fragmentId, list);
    }
  }
  return usage;
}

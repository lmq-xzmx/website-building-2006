/**
 * 编排差异 —— 两份编排之间的**人类可读**对比。
 *
 * 为什么不用 git diff：
 *   - modules.json 是整份覆盖写，git diff 出来全是「整块替换」，看不出改了什么
 *   - 用户要问的是「哪个页面的哪个模块的哪条改了」，不是「第 120 行变了」
 *
 * 所以这里按**语义层级**比：页面 → 模块 → 条目，
 * 每条差异说清楚「哪里、什么字段、从什么变成什么」。
 *
 * 对比方向：base（旧）→ target（新）。
 * 「新增」= 只在 target 里，「删除」= 只在 base 里。
 */

import type { ModuleItem, ModulePlan, PageDef, PageModule } from "../modules/types.js";

export type DiffKind = "added" | "removed" | "changed";
export type DiffScope = "page" | "module" | "item";

/** 一条差异 */
export interface DiffEntry {
  kind: DiffKind;
  scope: DiffScope;
  /** 定位 —— 「首页 › 产品网格 › 某某产品」 */
  path: string;
  /** 变化描述 */
  detail: string;
}

/** 差异结果 */
export interface PlanDiff {
  entries: DiffEntry[];
  summary: {
    added: number;
    removed: number;
    changed: number;
  };
}

/** 字段的可读形式 —— 字符串加引号，一眼看出改了哪段文字 */
function fmtField(v: unknown): string {
  if (v === undefined || v === null || v === "") return "（空）";
  if (typeof v === "boolean") return v ? "是" : "否";
  if (typeof v === "object") return JSON.stringify(v);
  return `「${String(v)}」`;
}

/** 条目的显示名 */
function itemLabel(item: ModuleItem): string {
  return item.title ?? item.question ?? item.label ?? item.id;
}

/** 模块的显示名 */
function moduleLabel(m: PageModule): string {
  return m.title ?? m.type;
}

/** 页面的显示名 */
function pageLabel(p: PageDef): string {
  return p.title ?? p.path ?? p.id;
}

/** 逐字段比较 —— 返回变化描述数组 */
function compareFields(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  fields: Array<[key: string, label: string]>,
): string[] {
  const out: string[] = [];
  for (const [key, label] of fields) {
    const va = a[key];
    const vb = b[key];
    if (JSON.stringify(va ?? null) === JSON.stringify(vb ?? null)) continue;
    out.push(`${label}：${fmtField(va)} → ${fmtField(vb)}`);
  }
  return out;
}

const PAGE_FIELDS: Array<[string, string]> = [
  ["title", "标题"],
  ["path", "路径"],
  ["description", "描述"],
  ["published", "发布"],
  ["order", "排序"],
  ["inNav", "导航显示"],
  ["parentId", "父页面"],
  ["publishAt", "定时发布"],
];

const MODULE_FIELDS: Array<[string, string]> = [
  ["type", "类型"],
  ["title", "标题"],
  ["subtitle", "副标题"],
  ["order", "排序"],
  ["enabled", "启用"],
  ["publishAt", "定时发布"],
  ["fragmentId", "引用片段"],
];

const ITEM_FIELDS: Array<[string, string]> = [
  ["source", "来源"],
  ["kbItemId", "知识条目"],
  ["title", "标题"],
  ["summary", "摘要"],
  ["question", "问题"],
  ["answer", "答案"],
  ["image", "图片"],
  ["published", "发布"],
  ["order", "排序"],
  ["client", "客户名"],
  ["value", "数值"],
  ["label", "标签"],
  ["href", "链接"],
  ["alt", "替代文本"],
  ["caption", "图注"],
  ["step", "序号"],
];

/**
 * 比较两份编排。
 *
 * 用 id 做键 —— id 是稳定的身份，标题会变、路径会改，
 * 用标题做键会把「改标题」误判成「删一个加一个」。
 */
export function diffPlans(base: ModulePlan, target: ModulePlan): PlanDiff {
  const entries: DiffEntry[] = [];

  const basePages = new Map((base.pages ?? []).map((p) => [p.id, p]));
  const targetPages = new Map((target.pages ?? []).map((p) => [p.id, p]));

  for (const [id, p] of targetPages) {
    const old = basePages.get(id);
    if (!old) {
      const mods = (p.modules ?? []).length;
      const items = (p.modules ?? []).reduce((n, m) => n + (m.items ?? []).length, 0);
      entries.push({
        kind: "added",
        scope: "page",
        path: pageLabel(p),
        detail: `新增页面（${mods} 个模块 / ${items} 条条目）`,
      });
      continue;
    }
    const changes = compareFields(
      old as unknown as Record<string, unknown>,
      p as unknown as Record<string, unknown>,
      PAGE_FIELDS,
    );
    if (changes.length) {
      entries.push({
        kind: "changed",
        scope: "page",
        path: pageLabel(p),
        detail: changes.join("；"),
      });
    }
  }

  for (const [id, p] of basePages) {
    if (!targetPages.has(id)) {
      entries.push({
        kind: "removed",
        scope: "page",
        path: pageLabel(p),
        detail: "删除页面",
      });
    }
  }

  // ── 模块 ──────────────────────────────────────────────
  for (const [pid, tp] of targetPages) {
    const bp = basePages.get(pid);
    const baseMods = new Map((bp?.modules ?? []).map((m) => [m.id, m]));
    const targetMods = new Map((tp.modules ?? []).map((m) => [m.id, m]));

    for (const [mid, m] of targetMods) {
      const old = baseMods.get(mid);
      const where = `${pageLabel(tp)} › ${moduleLabel(m)}`;
      if (!old) {
        entries.push({
          kind: "added",
          scope: "module",
          path: where,
          detail: `新增模块（${(m.items ?? []).length} 条条目）`,
        });
        continue;
      }
      const changes = compareFields(
        old as unknown as Record<string, unknown>,
        m as unknown as Record<string, unknown>,
        MODULE_FIELDS,
      );
      if (changes.length) {
        entries.push({
          kind: "changed",
          scope: "module",
          path: where,
          detail: changes.join("；"),
        });
      }
    }

    for (const [mid, m] of baseMods) {
      if (!targetMods.has(mid)) {
        entries.push({
          kind: "removed",
          scope: "module",
          path: `${pageLabel(bp!)} › ${moduleLabel(m)}`,
          detail: "删除模块",
        });
      }
    }

    // ── 条目 ────────────────────────────────────────────
    for (const [mid, tm] of targetMods) {
      const bm = baseMods.get(mid);
      const baseItems = new Map((bm?.items ?? []).map((i) => [i.id, i]));
      const targetItems = new Map((tm.items ?? []).map((i) => [i.id, i]));

      for (const [iid, item] of targetItems) {
        const old = baseItems.get(iid);
        const where = `${pageLabel(tp)} › ${moduleLabel(tm)} › ${itemLabel(item)}`;
        if (!old) {
          entries.push({
            kind: "added",
            scope: "item",
            path: where,
            detail: "新增条目",
          });
          continue;
        }
        const changes = compareFields(
          old as unknown as Record<string, unknown>,
          item as unknown as Record<string, unknown>,
          ITEM_FIELDS,
        );
        // 正文单独比 —— 富文本 JSON 太长，不进逐字段描述，
        // 但正文变了是重要事实，要说清楚。
        if (JSON.stringify(old.body ?? null) !== JSON.stringify(item.body ?? null)) {
          changes.push("正文：已修改");
        }
        if (changes.length) {
          entries.push({
            kind: "changed",
            scope: "item",
            path: where,
            detail: changes.join("；"),
          });
        }
      }

      for (const [iid, item] of baseItems) {
        if (!targetItems.has(iid)) {
          entries.push({
            kind: "removed",
            scope: "item",
            path: `${pageLabel(tp)} › ${moduleLabel(tm)} › ${itemLabel(item)}`,
            detail: "删除条目",
          });
        }
      }
    }
  }

  const summary = {
    added: entries.filter((e) => e.kind === "added").length,
    removed: entries.filter((e) => e.kind === "removed").length,
    changed: entries.filter((e) => e.kind === "changed").length,
  };

  return { entries, summary };
}

/** 差异的纯文本形式 —— 便于日志、导出、命令行查看 */
export function renderPlanDiff(diff: PlanDiff): string {
  if (!diff.entries.length) return "（与对比版本一致，没有差异）";
  const mark = { added: "+", removed: "-", changed: "~" };
  return diff.entries
    .map((e) => `${mark[e.kind]} ${e.path} —— ${e.detail}`)
    .join("\n");
}

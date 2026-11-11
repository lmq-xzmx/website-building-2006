/**
 * 内容模版 —— 「模版定结构，实例填内容」。
 *
 * ── 为什么要有这一层 ──────────────────────────────────
 * 模块模型解决了「页面由什么组成」，但没回答「一类内容长什么样」：
 *   案例该有客户、挑战、方案、量化结果；
 *   产品该有定位、规格、卖点；
 *   文章该有导语、正文、要点。
 * 这些结构此前只存在于 site.ts 的写死字段里（人写、机器不碰）——
 * 后台没法为「一类内容」做增删改查，更没法按结构生成新页面。
 *
 * 模版层把「结构」独立出来：
 *   模版 Template    —— 字段 schema + 页面布局（怎么渲染成前台页面）
 *   实例 Instance    —— 按模版填的内容（可发布、可生成页面）
 *
 * ── 与模块模型的关系 ──────────────────────────────────
 * 实例**生成**页面：物化时把实例按模版布局展开成 PageDef 的模块数组，
 * 走既有的 catch-all 路由渲染 —— 骨架模板不需要为模版加任何分支。
 * 生成的页面带 generatedFrom 标记（指向实例 id），
 * 重复生成是**更新**而不是新建 —— 实例是内容的唯一事实源。
 */

/** 字段类型 —— 决定后台编辑器渲染成什么控件 */
export type TemplateFieldType =
  /** 单行文本 */
  | "text"
  /** 长文本（多行） */
  | "longtext"
  /** 富文本（ProseMirror JSON 或纯文本段落） */
  | "richtext"
  /** 图片（媒体库路径或外链） */
  | "image"
  /** 量化指标数组（value/unit/label）—— 渲染成数据条 */
  | "metrics"
  /** 字符串数组 —— 渲染成要点列表 */
  | "list";

/** 模版字段 */
export interface TemplateField {
  /** 字段名（实例 values 的 key） */
  key: string;
  /** 展示名 */
  label: string;
  type: TemplateFieldType;
  /** 是否必填 */
  required?: boolean;
  /** 占位提示 */
  placeholder?: string;
}

/** 页面布局块 —— 实例生成页面时，一个块展开成一个模块 */
export interface TemplateBlock {
  /** 块形态（映射到模块类型） */
  kind:
    | /** 大标题 + 引导语（hero）—— 用 name 与 summary 字段 */
    "heading"
    /** 富文本正文（用指定字段） */
    | "text"
    /** 量化指标（用指定 metrics 字段） */
    | "metrics"
    /** 要点列表（用指定 list 字段） */
    | "bullets"
    /** 行动号召（指向联系页） */
    | "cta";
  /** 用实例的哪个字段（heading/cta 不需要） */
  field?: string;
  /** 块标题（渲染成模块标题，可省） */
  title?: string;
}

/** 内容模版 */
export interface ContentTemplate {
  /** 模版 id（站点内唯一） */
  id: string;
  /** 模版名 */
  name: string;
  /** 说明 —— 这类内容用在什么场景 */
  description?: string;
  /** 字段 schema */
  fields: TemplateField[];
  /** 生成页面的布局 */
  page: {
    /** 生成页面的路径前缀，如 /stories、/products */
    pathPrefix: string;
    /** 块序列 */
    blocks: TemplateBlock[];
  };
  createdAt: string;
  updatedAt: string;
}

/** 实例的字段值 */
export type TemplateValue = string | Array<{ value: string; unit?: string; label?: string }>;

/** 模版实例 —— 按模版填的一份内容 */
export interface TemplateInstance {
  /** 实例 id */
  id: string;
  /** 属于哪个模版 */
  templateId: string;
  /** 实例名（后台列表显示用） */
  name: string;
  /** 页面 slug（生成页面路径 = pathPrefix + "/" + slug） */
  slug: string;
  /** 字段值 —— key 对应模版 fields[].key */
  values: Record<string, TemplateValue>;
  /** 是否发布（false = 草稿，不生成页面） */
  published: boolean;
  /** 排序权重 */
  order: number;
  /** 生成出的页面 id（重新生成时更新同一页） */
  generatedPageId?: string;
  createdAt: string;
  updatedAt: string;
}

/** 模版库 —— 一个站点一份 */
export interface TemplateLibrary {
  version: 1;
  siteId: string;
  updatedAt: string;
  templates: ContentTemplate[];
  instances: TemplateInstance[];
}

export function emptyTemplateLibrary(siteId: string): TemplateLibrary {
  return {
    version: 1,
    siteId,
    updatedAt: new Date().toISOString(),
    templates: [],
    instances: [],
  };
}

export function newTemplateId(): string {
  return `tpl_${Math.random().toString(36).slice(2, 10)}`;
}

export function newInstanceId(): string {
  return `ins_${Math.random().toString(36).slice(2, 10)}`;
}

/** 实例生成页面的路由路径 */
export function instancePath(tpl: ContentTemplate, ins: TemplateInstance): string {
  const prefix = tpl.page.pathPrefix.replace(/\/+$/, "");
  return `${prefix}/${ins.slug.replace(/^\/+/, "")}`;
}

/** 实例的字段校验 —— 返回问题清单（空数组 = 通过） */
export function validateInstance(
  tpl: ContentTemplate,
  ins: TemplateInstance,
): string[] {
  const out: string[] = [];
  for (const field of tpl.fields) {
    const v = ins.values?.[field.key];
    const empty =
      v === undefined ||
      v === null ||
      v === "" ||
      (Array.isArray(v) && v.length === 0);
    if (field.required && empty) {
      out.push(`「${field.label}」是必填项`);
      continue;
    }
    if (empty) continue;
    // metrics / list 必须是数组
    if ((field.type === "metrics" || field.type === "list") && !Array.isArray(v)) {
      out.push(`「${field.label}」应为数组`);
    }
    if (
      field.type === "metrics" &&
      Array.isArray(v) &&
      v.some((m) => !m || typeof m.value !== "string" || !m.value.trim())
    ) {
      out.push(`「${field.label}」每条指标都要有数值`);
    }
  }
  if (!ins.slug || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(ins.slug)) {
    out.push("slug 只能是字母、数字、连字符，且以字母或数字开头");
  }
  return out;
}

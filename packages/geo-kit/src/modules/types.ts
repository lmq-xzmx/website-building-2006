/**
 * 模块模型 —— 「页面由模块自由组合」的数据结构。
 *
 * ── 为什么要有这层 ──────────────────────────────────────
 * 之前的模型是**固定页型**：home / products / cases / about / insights / faq。
 * 每个页型在骨架里是一个写死的 Next.js 路由，字段也是写死的
 * （products 只有 name/summary/specs，cases 只有 client/results）。
 * 这导致两件事做不到：
 *   1. 「不同模版的模块组合」—— 没法自由增删改查页面上的模块
 *   2. 「每个模块的内容支持增删改查」—— 模块内的条目结构被页型钉死
 *
 * 新模型把三层拆开：
 *   页面 Page      → 一组模块，**顺序可调、可增删**
 *   模块 Module    → 一组条目，**顺序可调、可增删**
 *   条目 Item      → 内容的最小单位，**两种来源**
 *
 * ── 条目的两种来源 ──────────────────────────────────────
 *   source: "kb"      —— 来自知识库条目（引用 knowledge_items.id）
 *   source: "manual"  —— 后台手工创作（富文本）
 *
 * 这两者在**渲染层是同一种东西**（都是条目），在**编辑层是两条路**。
 * 条目上带 source 标记，合并时知道该去哪儿取正文。
 *
 * ── 与既有内容的关系 ────────────────────────────────────
 * 固定页型（sections/products/cases/...）**保留**，作为「手写内容包」的表达。
 * 模块模型是**新增的一层**，后台用它做编排，产出走同一个构建链路。
 * 两者最终都汇成同一个渲染模型（见 modules/render.ts）。
 */

import type { RichTextDoc } from "../rich-text/types.js";

/** 条目来源 */
export type ItemSource = "kb" | "manual";

/**
 * 审核状态。
 *
 * - pending  待审 —— 编辑提交了，审核员还没看
 * - approved 已通过 —— 可以进站
 * - rejected 已驳回 —— 要改，改完重新提交
 */
export type ItemReview = "pending" | "approved" | "rejected";

/** 模块类型 —— 决定渲染成什么区块 */
export type ModuleType =
  /** 富文本正文块 */
  | "rich-text"
  /** 卡片网格（产品 / 案例 / 洞察共用，靠 props 区分） */
  | "card-grid"
  /** 问答列表 */
  | "faq"
  /** 数据条（数字 + 标签） */
  | "stats"
  /** 英雄区（H1 + 引导语 + CTA） */
  | "hero"
  /** 行动号召条 */
  | "cta"
  /** 图片网格 */
  | "gallery"
  /** 信任背书（资质认证 / 合作客户 / 数据证明） */
  | "trust"
  /** 客户 logo 墙 */
  | "logo-wall"
  /** 流程步骤 */
  | "process"
  /** 零摩擦表单（字段定义在模块 props 里） */
  | "form";

export const MODULE_TYPES: ModuleType[] = [
  "rich-text",
  "card-grid",
  "faq",
  "stats",
  "hero",
  "cta",
  "gallery",
  "trust",
  "logo-wall",
  "process",
  "form",
];

/** 条目 —— 模块内的内容单位 */
export interface ModuleItem {
  /** 模块内唯一 id（模块内作用域） */
  id: string;
  /** 内容来源 */
  source: ItemSource;
  /** source === "kb" 时：知识库条目 id */
  kbItemId?: string;
  /** 标题（kb 来源可覆盖知识条目的原标题） */
  title?: string;
  /** 摘要 */
  summary?: string;
  /** 正文 —— manual 来源时是富文本；kb 来源时留空（由知识条目正文物化） */
  body?: RichTextDoc;
  /** 标签 */
  tags?: string[];
  /** 图片 */
  image?: string;
  /** 排序权重（小的在前） */
  order: number;
  /** 是否发布。false = 草稿，不进站点 */
  published: boolean;
  /**
   * 定时发布 —— ISO 时间串。
   *
   * 未到时间 = 还没发布（等同草稿）；到点自动生效。
   * 物化时按当前时间判断，所以**不需要后台定时任务** ——
   * 每次构建/发布时算一次，站点就自动切换了。
   */
  publishAt?: string;
  /**
   * 置顶 —— 同类条目里排最前。
   * 用于「最新公告」「推荐案例」这类运营位。
   */
  sticky?: boolean;
  /**
   * 审核状态 —— 编辑与审核分权。
   *
   * 为什么要有：
   *   以前的发布是「谁改谁发布」—— 编辑手滑就把没写完的内容推上线了。
   *   分权之后，编辑提交（pending），审核员通过（approved）或驳回（rejected），
   *   只有 approved 的内容能进站。
   *
   * 缺这个字段 = 历史内容（没有审核流程时建的），
   * 按已通过处理 —— 不让老内容一夜之间全变成「待审」。
   */
  review?: ItemReview;
  /** 附加字段 —— 按模块类型解释 */
  /** card-grid + products：规格表 */
  specs?: Array<{ name: string; value: string; unit?: string }>;
  /** card-grid + cases：客户名 */
  client?: string;
  /** card-grid + cases：量化结果 */
  results?: string[];
  /** faq：问题 */
  question?: string;
  /** faq：答案 */
  answer?: string;
  /** stats：数值 */
  value?: string;
  /** stats：数值单位 */
  unit?: string;
  /** stats：标签 */
  label?: string;
  /** cta：跳转链接 */
  href?: string;
  /** trust / logo-wall：图片替代文本 —— 无障碍与 AI 识图都靠它 */
  alt?: string;
  /** trust：图注 —— 资质/数据/合作方的补充说明 */
  caption?: string;
  /** process：步骤序号 */
  step?: number;
}

/**
 * form 模块的字段定义。
 *
 * 为什么放在模块 props 而不是条目里：
 *   表单是**一个**整体 —— 字段列表、必填规则、提交动作都属于表单本身，
 *   条目只负责说明「提交之后会发生什么」。
 */
export interface FormFieldDef {
  /** 字段名（提交时的 key） */
  name: string;
  /** 字段标签 */
  label: string;
  /** 输入类型 */
  type?: "text" | "tel" | "email" | "url" | "textarea" | "select";
  /** 是否必填 —— 必填项总数必须控制在 3–5 个 */
  required?: boolean;
  /** select 的可选项 */
  options?: string[];
  /** 占位提示 */
  placeholder?: string;
}

/**
 * 片段引用的**条目级覆盖**。
 *
 * 为什么条目也要能覆盖：
 *   同一个「公司简介」片段，放在首页可以完整放，
 *   放在「关于我们」页可能只想留两段 —— 但**不能复制一份片段**，
 *   复制之后两边各改各的，片段就废了。
 *   覆盖是「这一处例外」，改的是引用点，不是片段本体。
 */
export interface FragmentItemOverride {
  /** 片段内的条目 id */
  itemId: string;
  title?: string;
  summary?: string;
  body?: RichTextDoc;
  image?: string;
  question?: string;
  answer?: string;
  value?: string;
  unit?: string;
  label?: string;
  href?: string;
  client?: string;
  results?: string[];
  specs?: Array<{ name: string; value: string; unit?: string }>;
  alt?: string;
  caption?: string;
  step?: number;
  /** 是否发布 —— 默认沿用片段里的 */
  published?: boolean;
  /** 这一处不要这条（隐藏） */
  hidden?: boolean;
  /**
   * 这一处的审核状态 —— 默认沿用片段里的。
   *
   * 为什么审核也要能覆盖：
   *   审核状态是**内容的状态**，片段本体被多处引用。
   *   片段本体审过一次，所有引用点一起过 —— 这是对的。
   *   但引用点改了这条的字段（比如换了标题），改出来的内容是**新内容**，
   *   得单独审一次，不能拿片段本体的「已通过」顶替。
   */
  review?: ItemReview;
}

/**
 * 片段引用的**模块级覆盖**。
 *
 * 覆盖的是「引用点」而不是片段本体 —— 片段改了，所有引用点跟着改，
 * 只有明确写了覆盖的字段不动。这是「一份内容多处复用」的关键：
 * 复用不等于锁死。
 */
export interface FragmentOverrides {
  /** 覆盖片段的标题 */
  title?: string;
  /** 覆盖片段的副标题 */
  subtitle?: string;
  /** 覆盖片段的 props（浅合并） */
  props?: Record<string, unknown>;
  /** 条目级覆盖 */
  items?: FragmentItemOverride[];
}

/** 模块 —— 页面上的一个区块 */
export interface PageModule {
  /** 页面内唯一 id */
  id: string;
  /** 模块类型 */
  type: ModuleType;
  /** 区块标题 */
  title?: string;
  /** 副标题 */
  subtitle?: string;
  /** 条目 */
  items: ModuleItem[];
  /** 模块级配置（列数、变体等） */
  props?: Record<string, unknown>;
  /** 排序权重（小的在前） */
  order: number;
  /** 是否启用。false = 整块下线 */
  enabled: boolean;
  /**
   * 本地追加的条目 —— 只在这一处出现，不进片段本体。
   *
   * 为什么需要：引用型模块（fragmentId）的条目来自片段，
   * 覆盖（overrides）只能改/藏片段里已有的条目 ——
   * 「这一处要多一条」表达不了。
   *
   * 典型场景：页脚那块「联系我们」是公共片段，
   * 但某个页面还要多列一个「合作邮箱」—— 只在这一页有。
   */
  extraItems?: ModuleItem[];
  /** 定时发布 —— ISO 时间串，未到不生效 */
  publishAt?: string;
  /** 置顶 —— 同页面里排最前 */
  sticky?: boolean;
  /**
   * 引用的片段 id。
   *
   * 存在时，本模块是**片段的引用**而不是内容本体：
   *   - `items` 不保存内容 —— 内容在片段里（见 fragments/）
   *   - `overrides` 保存这一处的局部覆盖
   *   - 物化时展开成普通模块，渲染层看不出差别
   *
   * 为什么不在模块里直接存内容：
   *   同一段「公司简介」要出现在多个页面 —— 复制三份的话，
   *   客户改了电话要改三处，改漏一处就是线上不一致的联系方式。
   */
  fragmentId?: string;
  /** 片段引用的局部覆盖 */
  overrides?: FragmentOverrides;
}

/** 页面 —— 一组模块 */
export interface PageDef {
  /** 站点内唯一 id */
  id: string;
  /** 路由路径（相对站点根），如 "/about" */
  path: string;
  /** 页面标题（浏览器标题 / H1 兜底） */
  title: string;
  /** 页面描述 —— 每页必须有自己的一份（AI 区分页面实体） */
  description?: string;
  /** 模块数组 */
  modules: PageModule[];
  /** 排序权重（导航里的顺序） */
  order: number;
  /** 是否发布 */
  published: boolean;
  /**
   * 父页面 id —— 构成**栏目树**。
   *
   * 企业门户的典型结构：
   *   产品服务（父）
   *     ├ 数据集成网关
   *     ├ 数据工坊
   *     └ 规则引擎
   * 导航可以按树生成，子页面也能在父页里做「相关链接」。
   *
   * 空 = 顶级栏目。指向不存在的页面 = 视作顶级（不报错，
   * 免得删了父页面就整棵子树崩掉）。
   */
  parentId?: string;
  /** 导航里是否显示（默认跟随 published） */
  inNav?: boolean;
  /** 定时发布 —— ISO 时间串，未到不生效 */
  publishAt?: string;
  /** 置顶 —— 导航里排最前 */
  sticky?: boolean;
  /**
   * 生成标记 —— 这个页面由哪个模版实例生成（templates.json 里的实例 id）。
   * 生成页是实例的「投影」：实例是唯一事实源，重新生成会覆盖本页的内容。
   * 手写编排的页面没有这个字段。
   */
  generatedFrom?: string;
}

/** 模块编排 —— 一个站点一份 */
export interface ModulePlan {
  version: 1;
  siteId: string;
  /** 来源知识库 id */
  kbId: string;
  updatedAt: string;
  pages: PageDef[];
  /**
   * 站点级外观配置 —— 后台可选的布局与主题。
   *
   * 为什么放这里而不是 site.ts：
   *   site.ts 是**人写、机器不碰**的内容包（分层铁律）。
   *   外观是「客户想要什么样子」的决策，属于后台管辖的范围，
   *   而且换外观不该动内容包 —— 改内容包要走代码评审，太重。
   *
   * 与手写 theme 的关系：**后台的设置覆盖手写的**（同 plan 与内容包的关系）。
   */
  appearance?: SiteAppearance;
}

/** 站点级外观配置 */
export interface SiteAppearance {
  /** 布局变体 —— 客户一眼能看出不同的那一层 */
  layout?: "centered" | "split" | "editorial" | "bold";
  /** 信息密度 */
  density?: "comfortable" | "compact";
  /** 质感（圆角、阴影的调性） */
  style?: "modern" | "classic" | "minimal";
  /** 色板变体 */
  variant?: "default" | "forest" | "slate" | "amber";
  /** 覆盖主色（十六进制） */
  primaryColor?: string;
  /** 覆盖强调色 */
  accentColor?: string;
}

/** 空编排 */
export function emptyModulePlan(siteId: string, kbId = "default"): ModulePlan {
  return {
    version: 1,
    siteId,
    kbId,
    updatedAt: new Date().toISOString(),
    pages: [],
  };
}

/** 生成模块内条目 id */
export function newItemId(prefix = "it"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 生成模块 id */
export function newModuleId(prefix = "mod"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 生成页面 id */
export function newPageId(prefix = "pg"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

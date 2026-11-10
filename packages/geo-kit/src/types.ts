/**
 * geo-kit 核心类型定义。
 *
 * 设计原则（ADR-000 决策 1）：
 *   本包**框架无关** —— 不 import 任何 React/Astro/Next 的 API。
 *   只依赖纯数据 + 标准库。将来加 Astro 模板时核心逻辑零改动。
 */

import type { RichTextDoc } from "./rich-text/types.js";

/** 平台类型 —— 与 geo-platform 的 platform 枚举保持一致的语义子集 */
export type Platform =
  | "douyin"
  | "xiaohongshu"
  | "weibo"
  | "bilibili"
  | "tencent"
  | "zhihu"
  | "weixin_gzh"
  | "web";

/** 站点语言 —— 中文站与英文站的检查口径不同 */
export type SiteLocale = "zh-CN" | "en-US";

/**
 * 内容包 —— 客户站的全部内容来源。
 *
 * 这是 ADR-000 决策 2 的载体：**内容即配置**。
 * 模板（骨架）只负责把这份配置渲染成页面；
 * geo-kit 只负责从这份配置派生 JSON-LD / llms.txt / 内容索引 / GEO 体检。
 *
 * 因此内容包必须**纯数据** —— 不能含函数、不能含框架组件。
 */
export interface SiteContent {
  /** 站点标识（用于内容索引的文件名、构建产物目录名） */
  siteId: string;
  /** 站点显示名 */
  name: string;
  /** 一句话定位 —— 用于 llms.txt 的 blockquote、meta description */
  description: string;
  /** 站点 URL（不含尾部斜杠） */
  url: string;
  locale: SiteLocale;
  /** 默认语言标记 */
  language?: string;

  /** 视觉主题 —— 骨架的设计令牌变体 */
  theme?: SiteTheme;

  /** 组织主体信息 —— Organization / WebSite Schema 的来源 */
  organization: OrganizationContent;

  /** 页面区块 —— 页型的最小单位 */
  sections: SectionContent[];

  /** 产品/服务列表 */
  products?: ProductContent[];

  /** 案例/客户故事 */
  cases?: CaseContent[];

  /** 洞察/文章（Insights 页型） */
  insights?: InsightContent[];

  /** FAQ —— FAQPage Schema 与 llms.txt 的重要来源 */
  faq?: FaqItem[];

  /** 站点级导航（页型路由） */
  navigation?: NavItem[];

  /**
   * 模块化页面 —— 「页面由模块自由组合」的渲染结果。
   *
   * 与固定页型（sections / products / cases...）**并存**：
   *   - 固定页型是骨架里写死的路由，字段固定
   *   - pages 是后台编排出来的，模块可增删改查、条目可增删改查
   *
   * 两套都能用；骨架优先渲染 pages（更灵活），没有的页型走老逻辑。
   */
  pages?: PageContent[];

  /** 社交账号 —— schema sameAs 的来源 */
  social?: SocialLink[];

  /** 联系信息 */
  contact?: ContactContent;

  /** 站点 logo / 图片 */
  assets?: AssetContent;
}

export interface OrganizationContent {
  name: string;
  legalName?: string;
  url?: string;
  logo?: string;
  description?: string;
  foundingDate?: string;
  /** 所属行业（行业内容包提供） */
  industry?: string;
  /** 员工规模区间，如 "51-200" */
  numberOfEmployees?: string;
  /** 统一社会信用代码（国内站可识别性） */
  taxID?: string;
  /** 地址 */
  address?: PostalAddress;
  /** 联系方式 */
  contactPoint?: ContactPoint;
}

/**
 * 视觉主题 —— 骨架的设计令牌变体。
 *
 * 「千行万业」意味着客户站不能长得千篇一律。主题只改**令牌**，
 * 不改组件 —— 换主题的边际成本接近零。
 *
 * 三层机制（从浅到深）：
 *   1. **variant** —— 色板（forest / slate / amber）
 *   2. **style**   —— 质感（圆角、阴影、边框的调性）
 *   3. **layout**  —— 布局形态（版心宽度、字体气质、区块节奏）
 *
 * 前两层只改「皮肤」，第三层改「体格」——
 * 布局变体才是客户一眼能看出不同的那一层。
 */
export interface SiteTheme {
  /** 主题变体名：default / forest / slate / amber */
  variant?: "default" | "forest" | "slate" | "amber";
  /** 跟随系统深色模式（默认 true） */
  respectColorScheme?: boolean;
  /** 覆盖主色 —— 十六进制，如 "#7c3aed" */
  primaryColor?: string;
  /** 覆盖强调色 */
  accentColor?: string;
  /** 站点风格：modern（圆角、阴影）/ classic（方正、边框）/ minimal（大留白） */
  style?: "modern" | "classic" | "minimal";
  /**
   * 布局变体 —— 决定站点的「体格」。
   *
   * - centered  窄栏居中，传统 B2B（默认）
   * - split     左右分栏、模块交替，产品/SaaS 味
   * - editorial 杂志编排，衬线标题、大留白，咨询/律所/内容站味
   * - bold      大胆撞色，超大标题与色块，消费/初创味
   */
  layout?: "centered" | "split" | "editorial" | "bold";
  /**
   * 信息密度：comfortable（舒展，默认）/ compact（紧凑）。
   * 同样内容密度不同 —— 参数表多的行业适合 compact。
   */
  density?: "comfortable" | "compact";
}

export interface PostalAddress {
  streetAddress?: string;
  addressLocality: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry: string;
}

export interface ContactPoint {
  contactType: "sales" | "customer service" | "technical support" | "general";
  telephone?: string;
  email?: string;
  availableLanguage?: string[];
  areaServed?: string;
}

export interface ContactContent {
  email?: string;
  telephone?: string;
  address?: PostalAddress;
  /** 询盘表单提交端点（Phase 3 接 CRM） */
  inquiryEndpoint?: string;
}

export interface SocialLink {
  /** schema.org 社交平台标识，如 "https://twitter.com/x" */
  platform: string;
  url: string;
  /** 展示名 */
  name?: string;
}

/** 页面区块 —— 内容包的基本单位 */
export interface SectionContent {
  /** 区块标识（英文 kebab-case，用于路由与内容索引） */
  id: string;
  /** 页型标识：home / products / cases / about / contact / insights / faq / custom */
  type: SectionType;
  /** 展示标题 */
  title: string;
  /** 副标题/引导语 */
  subtitle?: string;
  /** 正文段落 —— GEO 可引用性的主要载体 */
  body?: string[];
  /** 要点列表 —— 适合做成 list，AI 易抽取 */
  bullets?: string[];
  /** 该区块对应的路由路径（相对站点根） */
  path?: string;
  /** 区块级结构化数据类型（覆盖默认推断） */
  schemaType?: SchemaType;
  /** FAQ 专用：问答对挂在区块上 */
  faq?: FaqItem[];
  /** 图片 */
  images?: string[];
  /** CTA */
  cta?: CtaContent;
  /** 排序权重 */
  order?: number;
  /** 该区块是否纳入 llms.txt 索引（默认 true） */
  indexed?: boolean;
}

export type SectionType =
  | "home"
  | "products"
  | "cases"
  | "about"
  | "contact"
  | "insights"
  | "faq"
  | "custom";

export interface CtaContent {
  label: string;
  href: string;
  /** 次要 CTA */
  secondary?: { label: string; href: string };
}

export interface ProductContent {
  id: string;
  name: string;
  /** 产品一句话定位 */
  summary?: string;
  description?: string;
  /** 产品参数 —— 参数表是 AI 高频引用的结构化数据 */
  specs?: ProductSpec[];
  /** 核心卖点 */
  highlights?: string[];
  /** 型号列表 */
  models?: string[];
  image?: string;
  /** 分类 */
  category?: string;
  price?: string;
  availability?: string;
}

export interface ProductSpec {
  name: string;
  value: string;
  unit?: string;
}

export interface CaseContent {
  id: string;
  title: string;
  client?: string;
  industry?: string;
  challenge?: string;
  solution?: string;
  /** 量化结果 —— AI 最爱引用的数字 */
  results?: string[];
  image?: string;
  date?: string;
  tags?: string[];
}

export interface InsightContent {
  id: string;
  title: string;
  /** 摘要 */
  summary?: string;
  body?: string[];
  date?: string;
  author?: string;
  tags?: string[];
  image?: string;
  /** 预计阅读时长（分钟） */
  readingMinutes?: number;
}

export interface FaqItem {
  question: string;
  answer: string;
  /** 分类（用于 llms.txt 分组与 FAQPage 标记） */
  category?: string;
}

export interface NavItem {
  label: string;
  href: string;
  /** 页型锚点 */
  sectionId?: string;
}

export interface AssetContent {
  logo?: string;
  ogImage?: string;
  favicon?: string;
}

// ── 模块化页面（渲染层）──────────────────────────────────
//
// 这是「编排」物化后的形态：正文已是富文本，条目已排序，草稿已剔除。
// 骨架直接渲染这些结构 —— 后台看到的 = 页面渲染出来的。

/** 渲染层的模块类型 —— 与编排层的 ModuleType 对应 */
export type ContentModuleType =
  | "rich-text"
  | "card-grid"
  | "faq"
  | "stats"
  | "hero"
  | "cta"
  | "gallery";

/** 渲染层的条目 */
export interface ContentItem {
  id: string;
  /** 来源 —— kb = 来自知识库；manual = 后台手工创作 */
  source: "kb" | "manual";
  title: string;
  summary?: string;
  /** 富文本文档（ProseMirror JSON） */
  body: RichTextDoc;
  /** 降级后的纯文本段落 —— GEO 指标按它算 */
  paragraphs: string[];
  tags?: string[];
  image?: string;
  specs?: Array<{ name: string; value: string; unit?: string }>;
  client?: string;
  results?: string[];
  question?: string;
  answer?: string;
  value?: string;
  unit?: string;
  label?: string;
  href?: string;
  readingMinutes?: number;
}

/** 渲染层的模块 */
export interface ContentModule {
  id: string;
  type: ContentModuleType;
  title?: string;
  subtitle?: string;
  props?: Record<string, unknown>;
  items: ContentItem[];
}

/** 渲染层的页面 */
export interface PageContent {
  id: string;
  /** 路由路径 */
  path: string;
  title: string;
  description?: string;
  modules: ContentModule[];
}

/** schema.org 类型（白名单 —— 只允许明确无歧义的类型） */
export type SchemaType =
  | "Organization"
  | "WebSite"
  | "LocalBusiness"
  | "Product"
  | "Article"
  | "BlogPosting"
  | "BlogPage"
  | "FAQPage"
  | "BreadcrumbList"
  | "WebPage"
  | "ContactPage"
  | "AboutPage"
  | "ItemList"
  | "CollectionPage";

/** 站点级构建产物 —— geo-kit 的输出 */
export interface SiteArtifacts {
  /** JSON-LD 脚本内容（每条一个 <script type="application/ld+json">） */
  jsonLd: JsonLdScript[];
  /** llms.txt 全文 */
  llmsTxt: string;
  /** llms-full.txt 全文（可选） */
  llmsFullTxt?: string;
  /** robots.txt 全文 */
  robotsTxt: string;
  /** sitemap.xml 全文 */
  sitemapXml: string;
  /** 内容索引 —— 供 llms.txt / MCP / 体检共用 */
  index: ContentIndex;
}

export interface JsonLdScript {
  /** 脚本的 @type */
  type: SchemaType | string;
  /** 完整的 JSON-LD 对象（不含外层 script 标签） */
  data: Record<string, unknown>;
  /** 注入位置 */
  target: "head" | "body";
}

export interface ContentIndex {
  siteId: string;
  url: string;
  /** 按区块归类的条目 */
  entries: IndexEntry[];
  /** 能力清单 —— ADR-002 的 MCP 前置条件 */
  capabilities: Capability[];
}

export interface IndexEntry {
  /** 区块 id */
  sectionId: string;
  type: SectionType;
  title: string;
  /** 描述（llms.txt 用） */
  description: string;
  path: string;
  url: string;
  /** 所属分类（llms.txt 的 ## 分组） */
  category: string;
  /** 可引用性信号摘要 */
  quotable: QuotableSignals;
  /** 是否有 FAQ */
  hasFaq: boolean;
}

export interface QuotableSignals {
  /** 段落数 */
  paragraphs: number;
  /** 含具体数字的段落数 */
  withNumbers: number;
  /** 含引用的段落数 */
  withCitations: number;
  /** 是否答案先行 */
  answerFirst: boolean;
  /** 术语数 */
  technicalTerms: number;
}

export interface Capability {
  /** 能力标识，如 "content.query" / "product.lookup" */
  id: string;
  /** 人类可读描述 */
  description: string;
  /** 关联的区块 id */
  sectionIds: string[];
  /** 是否可写（Phase 3 询盘写入） */
  mutating: boolean;
}

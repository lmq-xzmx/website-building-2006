/**
 * 内容索引层 —— 从内容包派生机器可读索引。
 *
 * 这是 ADR-002 定的 Phase 0 交付物，也是整个架构的关键中间层：
 *
 *   内容包 (SiteContent)
 *        ↓  buildContentIndex()
 *   内容索引 (ContentIndex)
 *        ├→ llms.txt 生成（DimB）
 *        ├→ GEO 体检的可检查项来源
 *        └→ Phase 3 的 MCP 工具清单（能力清单 capabilities）
 *
 * 为什么要这一层（而不是各生成器各读一遍内容包）：
 *   1. llms.txt 与 MCP 需要**同一份**分类与能力定义 —— 派生一次，天然一致；
 *   2. 分类不是手写枚举，从区块类型 + 显式分类派生，新增区块零配置；
 *   3. 索引是**纯数据**，不依赖任何框架 —— ADR-002 的 MCP 静态端点直接复用它；
 *   4. 体检的「内容可抽取性」检查要读段落级信号，在索引阶段算一次最省。
 */

import type {
  Capability,
  ContentIndex,
  IndexEntry,
  QuotableSignals,
  SectionContent,
  SectionType,
  SiteContent,
} from "./types.js";

/** 页型 → llms.txt 的分类名。分类名是给人看的，用中文。 */
const CATEGORY_BY_TYPE: Record<SectionType, string> = {
  home: "首页",
  products: "产品与服务",
  cases: "客户案例",
  about: "关于我们",
  contact: "联系我们",
  insights: "洞察与文章",
  faq: "常见问题",
  custom: "其他内容",
};

/**
 * 分类顺序 —— llms.txt 里 ## 分组的排列次序。
 *
 * 首页在前（AI 读 llms.txt 通常先看站点定位），联系与 FAQ 在后（但不能省，
 * FAQ 是 AI 最爱的格式）。
 */
const CATEGORY_ORDER: SectionType[] = [
  "home",
  "products",
  "cases",
  "insights",
  "about",
  "faq",
  "contact",
  "custom",
];

/** 数字识别 —— 判定段落是否含可引用的具体数字。 */
const NUMBER_RE = /\d/;

/**
 * 引述识别 —— 判定段落是否含引用/出处标记。
 *
 * 刻意宽松：只要出现「据/根据/来源/参考/见/出自」或引号包裹的短语即算，
 * 因为可引用性判定宁可宽一档（进 missing 的代价远小于错判）。
 */
const CITATION_RE =
  /(据|根据|来源|参考|出自|引自|见\s*[:：]|\"|「|"|according to|according to|source\s*[:：]|cited)/i;

/**
 * 答案先行识别 —— 段落开头是否直接给结论。
 *
 * 判据：首句短（≤60 字符）且含数字，或以明确结论词开头。
 * 对应 citability 的 Answer-First Structure（影响力 +25%）。
 */
const ANSWER_FIRST_LEAD =
  /^(是|有|不|无|我们|公司|本产品|该|这|可以|提供|支持|专注于|专注于|致力于|[A-Z][a-z]+ (is|are|provides|offers|supports))/;
const ANSWER_FIRST_MAX_LEAD_LEN = 60;

/** 术语识别 —— 中英混合词或技术复合词 */
const TERM_RE = /([A-Za-z][A-Za-z0-9]*[-+][A-Za-z0-9]+)|([A-Z]{2,})|(\b[a-z]+[A-Z][a-zA-Z]*\b)/;

/**
 * 抽取段落的可引用性信号。
 *
 * 对应 geo-optimizer 的 citability 方法中的可自动化部分：
 * Statistics Addition(+33%) / Cite Sources(+27%) / Answer-First(+25%) / Technical Terms(+18%)。
 * 纯正则判定，不调 LLM —— 建站时每个页面都要算，必须便宜且确定。
 */
export function extractQuotableSignals(
  paragraphs: string[] | undefined,
  bullets?: string[],
): QuotableSignals {
  const all = [...(paragraphs ?? []), ...(bullets ?? [])].filter((p) => p.trim().length > 0);
  if (all.length === 0) {
    return {
      paragraphs: 0,
      withNumbers: 0,
      withCitations: 0,
      answerFirst: false,
      technicalTerms: 0,
    };
  }

  let withNumbers = 0;
  let withCitations = 0;
  let technicalTerms = 0;

  for (const p of all) {
    if (NUMBER_RE.test(p)) withNumbers++;
    if (CITATION_RE.test(p)) withCitations++;
    const terms = p.match(TERM_RE);
    if (terms && terms.length > 0) technicalTerms += terms.length;
  }

  // 答案先行只看正文首段 —— bullet 列表天然不是答案先行结构
  const first = (paragraphs ?? []).find((p) => p.trim().length > 0) ?? "";
  const lead = first.split(/[。！？.!?\n]/)[0] ?? "";
  const answerFirst =
    lead.length > 0 &&
    lead.length <= ANSWER_FIRST_MAX_LEAD_LEN &&
    (ANSWER_FIRST_LEAD.test(lead.trim()) || NUMBER_RE.test(lead));

  return {
    paragraphs: all.length,
    withNumbers,
    withCitations,
    answerFirst,
    technicalTerms,
  };
}

/** 区块 → 路由路径。 */
export function sectionPath(section: SectionContent): string {
  if (section.path) return section.path;
  switch (section.type) {
    case "home":
      return "/";
    case "products":
      return "/products";
    case "cases":
      return "/cases";
    case "about":
      return "/about";
    case "contact":
      return "/contact";
    case "insights":
      return "/insights";
    case "faq":
      return "/faq";
    default:
      return `/${section.id}`;
  }
}

/** 区块 → llms.txt 分类名。 */
export function sectionCategory(section: SectionContent): string {
  return CATEGORY_BY_TYPE[section.type] ?? CATEGORY_BY_TYPE.custom;
}

/** 拼接站点 URL 与路径。 */
export function absoluteUrl(site: SiteContent, path: string): string {
  const base = site.url.replace(/\/+$/, "");
  if (path === "/") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * 区块描述 —— llms.txt 列表项旁的一句话。
 *
 * 优先用 subtitle（人写的定位语），没有就用 body 首句截断，
 * 都没有就用 title —— 保证每条索引都有描述（llms.txt 规范要求）。
 */
function sectionDescription(section: SectionContent): string {
  if (section.subtitle) return section.subtitle;
  const firstBody = (section.body ?? []).find((b) => b.trim().length > 0);
  if (firstBody) {
    const t = firstBody.trim();
    return t.length > 160 ? `${t.slice(0, 157)}...` : t;
  }
  const bullet = (section.bullets ?? []).find((b) => b.trim().length > 0);
  if (bullet) return bullet.trim();
  return section.title;
}

/**
 * 能力清单 —— ADR-002 的 DimG 可调用性前置条件。
 *
 * 从内容包派生「AI 能调用什么」：
 *   - 每个区块 → 一个内容查询能力
 *   - 产品/案例/文章 → 更细的查询能力
 *   - contact 区块有 inquiryEndpoint → 可写的询盘能力（Phase 3）
 *
 * 现在只是**声明式清单**（供体检检查 + Phase 3 生成 MCP 工具）。
 */
function buildCapabilities(content: SiteContent): Capability[] {
  const caps: Capability[] = [];

  for (const s of content.sections) {
    caps.push({
      id: `content.${s.type}.${s.id}`,
      description: `查询「${s.title}」区块的内容`,
      sectionIds: [s.id],
      mutating: false,
    });
  }

  if (content.products?.length) {
    caps.push({
      id: "product.lookup",
      description: "按名称/型号查询产品参数与规格",
      sectionIds: content.sections.filter((s) => s.type === "products").map((s) => s.id),
      mutating: false,
    });
  }

  if (content.cases?.length) {
    caps.push({
      id: "case.lookup",
      description: "查询客户案例与量化结果",
      sectionIds: content.sections.filter((s) => s.type === "cases").map((s) => s.id),
      mutating: false,
    });
  }

  if (content.insights?.length) {
    caps.push({
      id: "insight.lookup",
      description: "查询洞察文章正文",
      sectionIds: content.sections.filter((s) => s.type === "insights").map((s) => s.id),
      mutating: false,
    });
  }

  // FAQ 能力：站点级 FAQ 或区块级 FAQ 任一存在即可
  const faqSectionIds = content.sections
    .filter((s) => s.type === "faq" || (s.faq?.length ?? 0) > 0)
    .map((s) => s.id);
  if ((content.faq?.length ?? 0) > 0 || faqSectionIds.length > 0) {
    caps.push({
      id: "faq.query",
      description: "查询常见问题问答对",
      sectionIds: faqSectionIds,
      mutating: false,
    });
  }

  const contactSection = content.sections.find((s) => s.type === "contact");
  if (contactSection) {
    caps.push({
      id: "inquiry.submit",
      description: "提交询盘表单",
      sectionIds: [contactSection.id],
      mutating: true,
    });
  }

  return caps;
}

/**
 * 构建内容索引 —— 整个 geo-kit 的中间层入口。
 *
 * 纯函数：同样的内容包永远得到同样的索引（便于快照测试与构建可复现）。
 */
export function buildContentIndex(content: SiteContent): ContentIndex {
  const entries: IndexEntry[] = [];

  for (const s of content.sections) {
    if (s.indexed === false) continue;
    const path = sectionPath(s);
    entries.push({
      sectionId: s.id,
      type: s.type,
      title: s.title,
      description: sectionDescription(s),
      path,
      url: absoluteUrl(content, path),
      category: sectionCategory(s),
      quotable: extractQuotableSignals(s.body, s.bullets),
      hasFaq: (s.faq?.length ?? 0) > 0 || (content.faq?.length ?? 0) > 0,
    });
  }

  return {
    siteId: content.siteId,
    url: content.url,
    entries,
    capabilities: buildCapabilities(content),
  };
}

/** 按分类分组索引条目，分类按 CATEGORY_ORDER 排序。 */
export function groupIndexByCategory(
  index: ContentIndex,
): Array<{ category: string; type: SectionType; entries: IndexEntry[] }> {
  const byType = new Map<SectionType, IndexEntry[]>();
  for (const e of index.entries) {
    const list = byType.get(e.type) ?? [];
    list.push(e);
    byType.set(e.type, list);
  }

  const groups: Array<{ category: string; type: SectionType; entries: IndexEntry[] }> = [];
  for (const type of CATEGORY_ORDER) {
    const entries = byType.get(type);
    if (entries && entries.length > 0) {
      groups.push({ category: CATEGORY_BY_TYPE[type], type, entries });
    }
  }
  return groups;
}

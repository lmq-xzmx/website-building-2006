/**
 * 站内搜索 —— 构建期索引 + 客户端纯函数检索。
 *
 * ── 为什么要有这一层 ─────────────────────────────────────
 * 静态导出站没有服务端，「站内搜索」只能是**构建期建索引 + 浏览器端过滤**：
 *   构建期：把最终页面的内容（模块编排 + 手写内容包合并后的产物）拍平成一份 JSON；
 *   运行期：浏览器 fetch 这份 JSON，本地做关键词匹配 —— 不请求任何后端。
 *
 * 这与 geo-kit 其余部分的取向一致：
 *   内容即配置 → 索引是配置的派生物 → 构建期算一次，运行期零成本。
 *
 * ── 两条铁律 ─────────────────────────────────────────────
 *   1. **纯函数**：buildSearchIndex(content) 与 searchIndex(items, query) 都是
 *      纯函数 —— 同样的输入永远得到同样的输出（可快照测试、可复现构建）。
 *   2. **零依赖**：本文件只 import 同包内的类型与富文本转换，
 *      不碰 cheerio / pg —— 浏览器端可以直接用（见 package.json 的 "./search" 导出）。
 *
 * ── 为什么索引的是「条目」而不是「页面」 ─────────────────
 * 十几个页面的企业站，真正被搜的是**条目**：某个产品、某条案例、
 * 某个 FAQ 答案是哪一条。页面级索引只能告诉访客「在 /products 页」，
 * 条目级索引才能直接给出答案与上下文片段。
 */

import { docToPlainText } from "./rich-text/convert.js";
import { sectionPath } from "./content-index.js";
import type { ContentItem, SiteContent } from "./types.js";

/** 索引项 —— 一条可被搜到的内容 */
export interface SearchIndexEntry {
  /** 站内唯一 id */
  id: string;
  /** 页面路径（相对站点根，可带 #锚点） */
  path: string;
  /** 页面标题 */
  pageTitle: string;
  /**
   * 模块类型 —— 索引项的来源类别。
   *
   * 模块编排页：模块自身的 type（rich-text / card-grid / faq / ...）；
   * 手写内容包：内容类别（section / product / case / insight / faq）。
   */
  moduleType: string;
  /** 条目标题 */
  title: string;
  /** 摘要 */
  summary?: string;
  /** 正文纯文本（命中片段从它里截取） */
  text: string;
  /** 图片 */
  image?: string;
}

/** 搜索索引文件 —— 写到静态产物里的那份 JSON */
export interface SearchIndex {
  version: 1;
  siteId: string;
  siteName: string;
  items: SearchIndexEntry[];
}

/** ── 索引构建 ───────────────────────────────────────────── */

/** 模块条目 → 可搜索的纯文本 */
function moduleItemText(item: ContentItem): string {
  const parts: string[] = [];

  const body = docToPlainText(item.body);
  if (body) parts.push(body);
  if (item.question) parts.push(item.question);
  if (item.answer) parts.push(item.answer);
  if (item.specs?.length) {
    parts.push(item.specs.map((s) => `${s.name}：${s.value}${s.unit ?? ""}`).join("\n"));
  }
  if (item.results?.length) parts.push(item.results.join("\n"));
  if (item.value) parts.push(`${item.value}${item.unit ?? ""} ${item.label ?? ""}`.trim());
  if (item.caption) parts.push(item.caption);
  if (item.client) parts.push(item.client);

  return parts.join("\n").trim();
}

/**
 * 构建搜索索引 —— 从**合并后**的内容模型派生。
 *
 * 输入是构建脚本合并好的最终内容（手写内容包 + 计划内容 + 模块编排），
 * 所以索引到的就是访客能看到的 —— 「后台看到的 = 索引到的 = 页面渲染的」。
 *
 * 覆盖两类来源：
 *   1. 模块编排页（content.pages）—— 后台编排出来的页面与条目
 *   2. 手写内容包（sections / products / cases / insights / faq）
 */
export function buildSearchIndex(content: SiteContent): SearchIndex {
  const items: SearchIndexEntry[] = [];

  // ── 1. 模块编排页 ───────────────────────────────────────
  for (const page of content.pages ?? []) {
    for (const mod of page.modules ?? []) {
      for (const item of mod.items ?? []) {
        const title = item.title ?? item.question ?? "";
        const text = moduleItemText(item);
        if (!title && !text) continue;

        items.push({
          id: `${page.id}:${mod.id}:${item.id}`,
          path: page.path,
          pageTitle: page.title,
          moduleType: mod.type,
          title,
          summary: item.summary,
          text,
          image: item.image,
        });
      }
    }
  }

  // ── 2. 手写内容包 ───────────────────────────────────────
  const sections = content.sections ?? [];

  for (const s of sections) {
    if (s.indexed === false) continue;
    const text = [...(s.body ?? []), ...(s.bullets ?? [])].join("\n").trim();
    items.push({
      id: `section:${s.id}`,
      path: sectionPath(s),
      pageTitle: s.title,
      moduleType: "section",
      title: s.title,
      summary: s.subtitle,
      text,
      image: s.images?.[0],
    });
  }

  const productsSection = sections.find((s) => s.type === "products");
  const productsPath = productsSection ? sectionPath(productsSection) : "/products";
  for (const p of content.products ?? []) {
    const text = [
      p.description ?? "",
      ...(p.highlights ?? []),
      ...(p.specs ?? []).map((s) => `${s.name}：${s.value}${s.unit ?? ""}`),
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
    items.push({
      id: `product:${p.id}`,
      // 产品页给每个产品一个锚点 id —— 直接跳到那一条
      path: `${productsPath}#${p.id}`,
      pageTitle: productsSection?.title ?? "产品与参数",
      moduleType: "product",
      title: p.name,
      summary: p.summary,
      text,
      image: p.image,
    });
  }

  const casesSection = sections.find((s) => s.type === "cases");
  const casesPath = casesSection ? sectionPath(casesSection) : "/cases";
  for (const c of content.cases ?? []) {
    const text = [c.challenge ?? "", c.solution ?? "", ...(c.results ?? [])]
      .filter(Boolean)
      .join("\n")
      .trim();
    items.push({
      id: `case:${c.id}`,
      path: casesPath,
      pageTitle: casesSection?.title ?? "客户案例",
      moduleType: "case",
      title: c.title,
      summary: c.challenge,
      text,
      image: c.image,
    });
  }

  const insightsSection = sections.find((s) => s.type === "insights");
  for (const a of content.insights ?? []) {
    items.push({
      id: `insight:${a.id}`,
      path: `/insights/${a.id}`,
      pageTitle: insightsSection?.title ?? "洞察与文章",
      moduleType: "insight",
      title: a.title,
      summary: a.summary,
      text: (a.body ?? []).join("\n").trim(),
      image: a.image,
    });
  }

  const faqSection = sections.find((s) => s.type === "faq");
  const faqPath = faqSection ? sectionPath(faqSection) : "/faq";
  const faqs = [...(faqSection?.faq ?? []), ...(content.faq ?? [])];
  for (const [i, q] of faqs.entries()) {
    items.push({
      id: `faq:${faqPath}:${i}`,
      path: faqPath,
      pageTitle: faqSection?.title ?? "常见问题",
      moduleType: "faq",
      title: q.question,
      summary: q.category,
      text: q.answer ?? "",
    });
  }

  return {
    version: 1,
    siteId: content.siteId,
    siteName: content.name,
    items,
  };
}

/** ── 检索 ───────────────────────────────────────────────── */

/** 命中片段里的一段（hit=true 的段用 <mark> 渲染） */
export interface SearchResultSegment {
  text: string;
  hit: boolean;
}

/** 一条检索结果 */
export interface SearchResult {
  entry: SearchIndexEntry;
  /** 匹配得分 —— 标题命中权重高于正文 */
  score: number;
  /** 命中上下文片段（按命中词切段） */
  snippet: SearchResultSegment[];
}

/** 检索选项 */
export interface SearchOptions {
  /** 多关键词匹配方式：all = 全部命中；any = 任一命中（默认） */
  mode?: "all" | "any";
  /** 结果条数上限 */
  limit?: number;
}

/** 权重：标题命中最值钱，正文命中只作底分 */
const TITLE_WEIGHT = 10;
const SUMMARY_WEIGHT = 3;
const TEXT_WEIGHT = 1;

/** 片段长度（正文字符数） */
const SNIPPET_LENGTH = 180;
/** 片段左侧留多少上下文 */
const SNIPPET_LEAD = 60;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesTerm(haystack: string | undefined, term: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(term.toLowerCase());
}

/**
 * 按命中词把文本切成段 —— 命中段 hit=true，其余 hit=false。
 *
 * 不返回 HTML：前端用 React 渲染段数组，避免 XSS。
 */
export function splitByTerms(text: string, terms: string[]): SearchResultSegment[] {
  if (!text) return [];
  const usable = [...new Set(terms.filter((t) => t.trim().length > 0))];
  if (!usable.length) return [{ text, hit: false }];

  const re = new RegExp(`(${usable.map(escapeRegExp).join("|")})`, "gi");
  const segments: SearchResultSegment[] = [];
  let last = 0;

  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) segments.push({ text: text.slice(last, i), hit: false });
    segments.push({ text: m[0], hit: true });
    last = i + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), hit: false });

  return segments;
}

/** 截取命中词周围的上下文 */
function buildSnippet(entry: SearchIndexEntry, terms: string[]): SearchResultSegment[] {
  const source = entry.text || entry.summary || "";
  if (!source) return [];

  const lower = source.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }

  // 正文里没命中（只命中了标题/摘要）—— 取开头一段
  if (at < 0) {
    const head = source.slice(0, SNIPPET_LENGTH);
    return splitByTerms(head, terms);
  }

  const start = Math.max(0, at - SNIPPET_LEAD);
  const raw = source.slice(start, start + SNIPPET_LENGTH);
  const segments = splitByTerms(raw, terms);
  if (start > 0) segments.unshift({ text: "…", hit: false });
  if (start + SNIPPET_LENGTH < source.length) segments.push({ text: "…", hit: false });
  return segments;
}

/**
 * 检索 —— 在索引里找匹配项并排序。
 *
 * 规则：
 *   - 多关键词按空格分隔
 *   - mode="all" 要求全部命中，"any"（默认）任一命中即可
 *   - 标题命中权重高于摘要、摘要高于正文
 *   - 空查询返回空数组（不返回全部 —— 那不是搜索）
 */
export function searchIndex(
  items: SearchIndexEntry[],
  query: string,
  options: SearchOptions = {},
): SearchResult[] {
  const mode = options.mode ?? "any";
  const limit = options.limit ?? 50;

  const terms = (query ?? "")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (!terms.length) return [];

  const results: SearchResult[] = [];

  for (const entry of items) {
    let score = 0;
    const matched: string[] = [];

    for (const term of terms) {
      const inTitle = includesTerm(entry.title, term);
      const inSummary = includesTerm(entry.summary, term);
      const inText = includesTerm(entry.text, term);

      if (inTitle) score += TITLE_WEIGHT;
      if (inSummary) score += SUMMARY_WEIGHT;
      if (inText) score += TEXT_WEIGHT;

      if (inTitle || inSummary || inText) matched.push(term);
    }

    if (mode === "all" && matched.length !== terms.length) continue;
    if (!matched.length) continue;

    results.push({ entry, score, snippet: buildSnippet(entry, matched) });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.title.localeCompare(b.entry.title);
  });

  return results.slice(0, limit);
}

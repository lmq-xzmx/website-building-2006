/**
 * 全站抓取 —— 站级体检的数据来源。
 *
 * 从 sitemap.xml 取 URL 列表（比从首页爬链接更完整），
 * 逐页抓取并抽取体检所需字段。
 */

import type { SiteContent } from "../types.js";
import { buildSitemap } from "../jsonld.js";
import { buildContentIndex } from "../content-index.js";
import type { SitePageAudit } from "./site.js";

export interface CrawlOptions {
  timeout?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  /** 并发抓取数 */
  concurrency?: number;
  /** 最大抓取页数（防止大站失控） */
  maxPages?: number;
}

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; GeoKit-Audit/0.1; +https://github.com/lmq-xzmx/website-building-2006)";

/** 从 sitemap.xml 解析 URL 列表。 */
export function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

/** 抽取单页的体检字段。 */
export function extractPageFacts(html: string): {
  title?: string;
  description?: string;
  h1Count: number;
  canonical?: string;
  jsonLdTypes: string[];
  textLength: number;
  links: string[];
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  // 属性顺序不固定：Next.js 输出 <link rel="canonical" href="...">，
  // 而手写 HTML 常见 <link href="..." rel="canonical">。
  // 两种都要匹配，否则会误报「缺少 canonical」。
  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const canonicalMatch =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);

  const jsonLdTypes: string[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      const collect = (v: unknown) => {
        if (Array.isArray(v)) {
          v.forEach(collect);
          return;
        }
        if (v && typeof v === "object") {
          const t = (v as { "@type"?: string | string[] })["@type"];
          if (typeof t === "string") jsonLdTypes.push(t);
          else if (Array.isArray(t)) jsonLdTypes.push(...t);
          if ((v as { "@graph"?: unknown })["@graph"]) collect((v as { "@graph": unknown })["@graph"]);
        }
      };
      collect(parsed);
    } catch {
      // 语法损坏的 JSON-LD 在单页体检里会被报出来，这里忽略
    }
  }

  // 可见文本长度 —— 剥掉 script/style 与标签
  const textOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const links: string[] = [];
  const linkRe = /<a[^>]+href=["']([^"']+)["']/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(html)) !== null) {
    links.push(lm[1]);
  }

  return {
    title: titleMatch ? decodeEntities(titleMatch[1].trim()) : undefined,
    description: descMatch ? decodeEntities(descMatch[1].trim()) : undefined,
    h1Count: (html.match(/<h1[\s>]/gi) ?? []).length,
    canonical: canonicalMatch ? canonicalMatch[1] : undefined,
    jsonLdTypes,
    textLength: textOnly.length,
    links,
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * 把 sitemap 里的 URL 重写到被测域名。
 *
 * 必要原因：sitemap 生成时用的是**内容包里的生产域名**（这是对的 ——
 * 部署后 sitemap 必须指向生产地址），但体检常常针对本地/预发环境跑。
 * 不重写就会把「所有页面 404」误报成严重问题。
 *
 * 重写规则：保留路径与查询串，只换 origin。
 */
export function rewriteUrlsToBase(urls: string[], base: string): string[] {
  const target = new URL(base);
  return urls.map((u) => {
    try {
      const parsed = new URL(u);
      return `${target.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      // 相对路径或非法 URL —— 原样保留
      return u;
    }
  });
}

/**
 * 归一化链接为绝对 URL（相对被测域名）。
 *
 * 页面的 href 常是相对路径（`/products`）或带尾斜杠差异，
 * 不归一化就会：
 *   - 误判「内容包与实际路由不一致」（域名/尾斜杠不同）
 *   - 误判「孤立页面」（相对链接匹配不上绝对 URL）
 */
export function normalizeLink(link: string, base: string): string {
  try {
    const resolved = new URL(link, base);
    // 去掉尾斜杠差异：/products 与 /products/ 视为同一页
    const path = resolved.pathname.length > 1
      ? resolved.pathname.replace(/\/+$/, "")
      : resolved.pathname;
    return `${resolved.origin}${path}${resolved.search}`;
  } catch {
    return link;
  }
}

/** 归一化一组链接。 */
export function normalizeLinks(links: string[], base: string): string[] {
  return links.map((l) => normalizeLink(l, base));
}

/**
 * 抓取全站。
 *
 * URL 来源优先级：
 *   1. 站点的 sitemap.xml（最全）
 *   2. 内容包索引（兜底）
 */
export async function crawlSite(
  url: string,
  content: SiteContent,
  options: CrawlOptions = {},
): Promise<{ pages: SitePageAudit[]; linkGraph: Array<{ url: string; links: string[] }> }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = options.timeout ?? 15000;
  const concurrency = options.concurrency ?? 5;
  const maxPages = options.maxPages ?? 50;
  const userAgent = options.userAgent ?? DEFAULT_UA;
  const base = url.replace(/\/+$/, "");

  // 取 URL 列表
  let urls: string[] = [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetchImpl(`${base}/sitemap.xml`, {
      signal: ctrl.signal,
      headers: { "User-Agent": userAgent },
    });
    clearTimeout(timer);
    if (res.ok) {
      // sitemap 用生产域名是正确的，体检时重写到被测域名
      urls = rewriteUrlsToBase(parseSitemapUrls(await res.text()), base);
    }
  } catch {
    // sitemap 抓不到就用内容包兜底
  }

  if (urls.length === 0) {
    urls = buildContentIndex(content).entries.map((e) => e.url);
  }
  // 内容包索引同样用生产域名 —— 一并重写
  urls = rewriteUrlsToBase(urls, base);
  urls = urls.slice(0, maxPages);

  // 并发抓取
  const pages: SitePageAudit[] = [];
  const linkGraph: Array<{ url: string; links: string[] }> = [];
  const queue = [...urls];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const target = queue.shift();
      if (!target) return;

      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);
        const res = await fetchImpl(target, {
          signal: ctrl.signal,
          headers: { "User-Agent": userAgent },
        });
        clearTimeout(timer);

        if (!res.ok) {
          pages.push({ url: target, status: res.status, error: `HTTP ${res.status}` });
          continue;
        }

        const html = await res.text();
        const facts = extractPageFacts(html);
        pages.push({
          url: target,
          status: res.status,
          title: facts.title,
          description: facts.description,
          h1Count: facts.h1Count,
          canonical: facts.canonical,
          jsonLdTypes: facts.jsonLdTypes,
          textLength: facts.textLength,
        });
        // 链接归一化为绝对 URL —— 相对路径（/products）要与被抓 URL 对得上
        linkGraph.push({ url: target, links: normalizeLinks(facts.links, base) });
      } catch (err) {
        pages.push({ url: target, error: (err as Error).message });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));

  return { pages, linkGraph };
}

/**
 * 从内容包生成 sitemap（用于本地校验，无需起服务）。
 */
export function contentSitemap(content: SiteContent): string {
  return buildSitemap(content);
}

/**
 * 站级体检 —— 在单页体检之上，检查**整站**层面的问题。
 *
 * 单页体检（audit/index.ts）回答「这一页做得好不好」；
 * 站级体检回答「这个站作为整体是否对 AI 友好」。
 *
 * 站级才暴露的问题：
 *   - 孤立页面（没有任何页面链接到它）→ AI 爬虫发现不了
 *   - 重复标题/描述（多页共用）→ AI 无法区分实体
 *   - 索引缺失（部分页面不在 sitemap/llms.txt 里）
 *   - 内容重复度过高（模板填充导致的多页同质）
 */

import { buildContentIndex, groupIndexByCategory } from "../content-index.js";
import type { ContentIndex, SiteContent } from "../types.js";
import type { Check, Dimension, DimensionKey, ScoreResult } from "./scorer.js";
import { getGrade } from "./scorer.js";

export interface SitePageAudit {
  url: string;
  status?: number;
  title?: string;
  description?: string;
  h1Count?: number;
  canonical?: string;
  jsonLdTypes?: string[];
  /** 页面正文长度（字符） */
  textLength?: number;
  error?: string;
}

export interface SiteAuditInput {
  /** 内容包（用于交叉验证索引与内容） */
  content: SiteContent;
  /** 各页面的抓取结果 */
  pages: SitePageAudit[];
  /** 内容索引（可选，缺省从 content 派生） */
  index?: ContentIndex;
}

export interface SiteAuditResult {
  /** 站级检查项（归属维度） */
  checks: Array<Check & { dimension: DimensionKey }>;
  /** 站级得分 */
  score: number;
  grade: string;
  /** 发现的孤立页面 */
  orphanPages: string[];
  /** 重复的标题 */
  duplicateTitles: Array<{ value: string; urls: string[] }>;
  /** 重复的描述 */
  duplicateDescriptions: Array<{ value: string; urls: string[] }>;
  /** 抓取失败的页面 */
  failedPages: string[];
}

/**
 * 站级检查。
 *
 * 与单页体检互补：单页体检的维度是「这一页的质量」，
 * 站级检查是「页面之间的关系是否让 AI 能走通整个站」。
 */
export function auditSiteLevel(input: SiteAuditInput): SiteAuditResult {
  const index = input.index ?? buildContentIndex(input.content);
  const pages = input.pages;
  const checks: Array<Check & { dimension: DimensionKey }> = [];

  const failed = pages.filter((p) => p.error || (p.status !== undefined && p.status >= 400));
  const ok = pages.filter((p) => !p.error && (p.status === undefined || p.status < 400));

  // ── 可访问性 ────────────────────────────────────────────
  const accessibilityRatio = pages.length > 0 ? ok.length / pages.length : 0;
  checks.push({
    dimension: "A",
    id: "S1",
    name: "页面可访问率",
    weight: 5,
    earned: accessibilityRatio * 5,
    status:
      failed.length === 0 ? "pass" : accessibilityRatio >= 0.9 ? "partial" : "fail",
    desc: "所有页面返回 200，无 404/500",
    note:
      failed.length === 0
        ? `${ok.length} 个页面全部正常`
        : `${failed.length} 个页面异常：${failed.map((p) => p.url).slice(0, 5).join(", ")}`,
  });

  // ── 标题唯一性 ──────────────────────────────────────────
  const titleGroups = groupByField(pages, (p) => p.title);
  const dupTitles = Object.entries(titleGroups)
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls }));
  checks.push({
    dimension: "E",
    id: "S2",
    name: "页面标题唯一",
    weight: 4,
    earned: dupTitles.length === 0 ? 4 : Math.max(0, 4 - dupTitles.length * 1.5),
    status: dupTitles.length === 0 ? "pass" : dupTitles.length <= 1 ? "partial" : "fail",
    desc: "每页有唯一标题 —— AI 用它区分页面与实体",
    note:
      dupTitles.length === 0
        ? "标题全部唯一"
        : `${dupTitles.length} 组重复：${dupTitles.map((d) => `"${d.value.slice(0, 30)}"`).join(", ")}`,
  });

  // ── 描述唯一性 ──────────────────────────────────────────
  const descGroups = groupByField(pages, (p) => p.description);
  const dupDescs = Object.entries(descGroups)
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls }));
  checks.push({
    dimension: "E",
    id: "S3",
    name: "页面描述唯一",
    weight: 3,
    earned: dupDescs.length === 0 ? 3 : Math.max(0, 3 - dupDescs.length),
    status: dupDescs.length === 0 ? "pass" : dupDescs.length <= 1 ? "partial" : "fail",
    desc: "每页有唯一 meta description",
    note:
      dupDescs.length === 0
        ? "描述全部唯一"
        : `${dupDescs.length} 组重复描述`,
  });

  // ── H1 唯一（每页） ─────────────────────────────────────
  const badH1 = pages.filter((p) => p.h1Count !== undefined && p.h1Count !== 1);
  checks.push({
    dimension: "E",
    id: "S4",
    name: "每页恰好一个 H1",
    weight: 3,
    earned: badH1.length === 0 ? 3 : Math.max(0, 3 - badH1.length * 0.5),
    status: badH1.length === 0 ? "pass" : badH1.length <= 2 ? "partial" : "fail",
    desc: "H1 数量不等于 1 的页面",
    note:
      badH1.length === 0
        ? "全部页面 H1 唯一"
        : `${badH1.length} 个页面 H1 异常：${badH1.map((p) => p.url).slice(0, 4).join(", ")}`,
  });

  // ── canonical 覆盖 ──────────────────────────────────────
  const noCanonical = pages.filter((p) => !p.canonical);
  checks.push({
    dimension: "E",
    id: "S5",
    name: "canonical 覆盖率",
    weight: 2,
    earned: pages.length > 0 ? ((pages.length - noCanonical.length) / pages.length) * 2 : 0,
    status: noCanonical.length === 0 ? "pass" : noCanonical.length <= 1 ? "partial" : "fail",
    desc: "每页声明 canonical",
    note:
      noCanonical.length === 0
        ? "全部页面已声明"
        : `${noCanonical.length} 个页面缺少 canonical`,
  });

  // ── 内容包与实际页面的一致性 ────────────────────────────
  //
  // 两边的 URL 来源不同：内容包是生产域名，被测站点可能是本地/预发。
  // 直接比较会把「同一个站」判成「完全不一致」，所以按**路径**比较。
  const pathOf = (u: string): string => {
    try {
      const p = new URL(u).pathname;
      return p.length > 1 ? p.replace(/\/+$/, "") : p;
    } catch {
      return u;
    }
  };
  const indexPaths = new Set(index.entries.map((e) => pathOf(e.url)));
  // 文章详情页不在区块索引里，但确实是内容包的一部分 —— 一并计入
  for (const insight of input.content.insights ?? []) {
    indexPaths.add(pathOf(`${input.content.url}/insights/${insight.id}`));
  }
  const crawledPaths = new Set(pages.map((p) => pathOf(p.url)));
  const missingFromCrawl = [...indexPaths].filter((p) => !crawledPaths.has(p));
  const extraInCrawl = [...crawledPaths].filter((p) => !indexPaths.has(p));
  checks.push({
    dimension: "B",
    id: "S6",
    name: "内容包与实际路由一致",
    weight: 3,
    earned: missingFromCrawl.length === 0 && extraInCrawl.length === 0 ? 3 : 1.5,
    status:
      missingFromCrawl.length === 0 && extraInCrawl.length === 0
        ? "pass"
        : missingFromCrawl.length <= 2
          ? "partial"
          : "fail",
    desc: "内容包声明的页面与实际可访问的路由一致",
    note:
      missingFromCrawl.length === 0 && extraInCrawl.length === 0
        ? "完全一致"
        : [
            missingFromCrawl.length > 0 ? `内容包有但未访问到：${missingFromCrawl.length} 个` : "",
            extraInCrawl.length > 0 ? `访问到但不在内容包：${extraInCrawl.length} 个` : "",
          ]
            .filter(Boolean)
            .join("；"),
  });

  // ── 内容深度（页面太薄 AI 无法引用） ────────────────────
  const thin = pages.filter((p) => p.textLength !== undefined && p.textLength < 300);
  checks.push({
    dimension: "D",
    id: "S7",
    name: "无过薄页面",
    weight: 3,
    earned: pages.length > 0 ? ((pages.length - thin.length) / pages.length) * 3 : 0,
    status: thin.length === 0 ? "pass" : thin.length <= 1 ? "partial" : "fail",
    desc: "正文少于 300 字符的页面无法承载可引用信息",
    note:
      thin.length === 0
        ? "所有页面内容充实"
        : `${thin.length} 个页面过薄：${thin.map((p) => p.url).slice(0, 4).join(", ")}`,
  });

  // ── 索引覆盖：所有内容都进了 llms.txt ────────────────────
  const indexedSections = new Set(index.entries.map((e) => e.sectionId));
  const allSections = input.content.sections.filter((s) => s.indexed !== false);
  const notIndexed = allSections.filter((s) => !indexedSections.has(s.id));
  checks.push({
    dimension: "B",
    id: "S8",
    name: "内容全部进入 llms.txt 索引",
    weight: 2,
    earned: notIndexed.length === 0 ? 2 : Math.max(0, 2 - notIndexed.length * 0.5),
    status: notIndexed.length === 0 ? "pass" : notIndexed.length <= 1 ? "partial" : "fail",
    desc: "所有区块都应出现在 llms.txt 的索引中",
    note:
      notIndexed.length === 0
        ? "全部区块已索引"
        : `未索引：${notIndexed.map((s) => s.title).join(", ")}`,
  });

  // ── 分类覆盖 ────────────────────────────────────────────
  const categories = groupIndexByCategory(index);
  checks.push({
    dimension: "B",
    id: "S9",
    name: "llms.txt 分类结构完整",
    weight: 2,
    earned: categories.length >= 3 ? 2 : categories.length > 0 ? 1 : 0,
    status: categories.length >= 3 ? "pass" : categories.length > 0 ? "partial" : "fail",
    desc: "至少 3 个分类，让 AI 能按主题定位内容",
    note: `当前 ${categories.length} 个分类：${categories.map((c) => c.category).join("、")}`,
  });

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + c.earned, 0);
  const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;

  return {
    checks,
    score,
    grade: getGrade(score),
    orphanPages: [],
    duplicateTitles: dupTitles,
    duplicateDescriptions: dupDescs,
    failedPages: failed.map((p) => p.url),
  };
}

/**
 * 从页面链接关系找孤立页面。
 *
 * 孤立页 = 没有任何其它页面链接到它（且不在首页入口）。
 * AI 爬虫靠链接发现内容 —— 孤立页几乎不会被收录。
 */
export function findOrphanPages(
  pages: Array<{ url: string; links: string[] }>,
  homepageUrl: string,
): string[] {
  // 按路径比较 —— 链接可能是相对路径或带尾斜杠差异
  const pathOf = (u: string): string => {
    try {
      const p = new URL(u).pathname;
      return p.length > 1 ? p.replace(/\/+$/, "") : p;
    } catch {
      return u;
    }
  };

  const linked = new Set<string>();
  for (const p of pages) {
    for (const l of p.links) linked.add(pathOf(l));
  }
  const homePath = pathOf(homepageUrl);

  return pages
    .map((p) => p.url)
    .filter((u) => !linked.has(pathOf(u)) && pathOf(u) !== homePath);
}

/**
 * 按字段值分组，返回 值 → 拥有该值的页面 URL 列表。
 *
 * 用于找出「多页共用同一标题/描述」这类问题 —— 报告里要指出是**哪些页面**，
 * 不只是说「有重复」。
 */
function groupByField(
  pages: SitePageAudit[],
  pick: (p: SitePageAudit) => string | undefined,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const p of pages) {
    const v = pick(p);
    if (!v) continue;
    (map[v] ??= []).push(p.url);
  }
  return map;
}

/**
 * 合并单页体检与站级体检为一份总报告。
 */
export function combineResults(
  pageResults: ScoreResult[],
  siteResult: SiteAuditResult,
): ScoreResult {
  // 站级检查按维度归入单页维度
  const dims = new Map<DimensionKey, Dimension>();
  for (const r of pageResults) {
    for (const d of r.dimensions) dims.set(d.key, d);
  }

  for (const c of siteResult.checks) {
    const dim = dims.get(c.dimension);
    if (!dim) continue;
    dim.checks.push(c);
    dim.maxScore += c.weight;
    dim.earned += c.earned;
    dim.score = dim.maxScore > 0 ? Math.round((dim.earned / dim.maxScore) * 100) : 0;
  }

  const dimensions = [...dims.values()];
  const weights = dimensions.reduce((s, d) => s + d.weight, 0);
  let total = 0;
  for (const d of dimensions) {
    total += (d.maxScore > 0 ? d.earned / d.maxScore : 0) * d.weight;
  }
  const score = weights > 0 ? Math.round((total / weights) * 100) : 0;

  const recommendations = pageResults
    .flatMap((r) => r.recommendations)
    .concat(
      siteResult.checks
        .filter((c) => c.status !== "pass" && c.status !== "unknown")
        .map((c) => ({
          dimension: c.dimension,
          checkId: c.id,
          message: c.note ?? c.desc ?? c.name,
          impact: c.weight - c.earned,
        })),
    )
    .sort((a, b) => b.impact - a.impact);

  return { score, grade: getGrade(score), dimensions, recommendations };
}

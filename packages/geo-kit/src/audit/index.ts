/**
 * GEO 体检编排 —— 抓取站点、组装检查项、输出诊断报告。
 *
 * 与本地 geo-knowledge 的 audit 模块同构：诊断（根因）+ 评分（维度）。
 * 差别在于本模块面向**站点**而非单篇素材。
 */

import { buildContentIndex } from "../content-index.js";
import { extractQuotableSignals, sectionPath } from "../content-index.js";
import { AI_CRAWLERS, DEFAULT_CRAWLER_POLICY, type CrawlerPolicy } from "../crawlers.js";
import { parseLlmsTxt } from "../llms-txt.js";
import type { SiteContent } from "../types.js";
import { scoreAudit, type AuditInput, type Recommendation, type ScoreResult } from "./scorer.js";
import { evaluateCrawlerAllowed } from "./robots.js";

export { evaluateCrawlerAllowed, isAgentGroupDisallowed, parseRobotsGroups } from "./robots.js";

export * from "./scorer.js";

/** 根因 —— 与本地 geo-knowledge 的 RootCause 概念一致 */
export type RootCause =
  | "robots_blocking_ai"
  | "no_llms_txt"
  | "llms_txt_malformed"
  | "no_structured_data"
  | "schema_broken"
  | "schema_incomplete"
  | "no_canonical"
  | "no_meta_description"
  | "thin_content"
  | "no_faq"
  | "not_citable"
  | "no_capability_manifest";

export interface RootCauseItem {
  cause: RootCause;
  title: string;
  detail: string;
  /** 修复建议 */
  action?: string;
  /** 严重级别 */
  severity: "critical" | "warning" | "info";
}

export interface AuditReport {
  url: string;
  scoredAt: string;
  result: ScoreResult;
  rootCauses: RootCauseItem[];
  /** 抓取过程的问题（如 robots 抓不到） */
  fetchIssues: string[];
}

/** 抓取选项 */
export interface AuditOptions {
  /** 超时（毫秒） */
  timeout?: number;
  /** User-Agent —— 用真实的浏览器 UA，避免被 CDN 当爬虫拦 */
  userAgent?: string;
  /** 自定义 fetch（测试注入） */
  fetchImpl?: typeof fetch;
  /** 爬虫策略（用于判定各 UA 是否被允许） */
  policy?: CrawlerPolicy;
}

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; GeoKit-Audit/0.1; +https://github.com/lmq-xzmx/website-building-2006)";

/**
 * 体检站点。
 *
 * @param url 站点 URL
 * @param content 内容包（可选）—— 提供则能评估内容可引用性与可调用性
 */
export async function auditSite(
  url: string,
  content?: SiteContent,
  options: AuditOptions = {},
): Promise<AuditReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = options.timeout ?? 15000;
  const policy = options.policy ?? DEFAULT_CRAWLER_POLICY;
  const userAgent = options.userAgent ?? DEFAULT_UA;
  const base = url.replace(/\/+$/, "");

  const fetchIssues: string[] = [];

  const get = async (path: string): Promise<string | undefined> => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetchImpl(`${base}${path}`, {
        signal: ctrl.signal,
        headers: { "User-Agent": userAgent },
      });
      clearTimeout(timer);
      if (!res.ok) {
        fetchIssues.push(`${path} 返回 HTTP ${res.status}`);
        return undefined;
      }
      return await res.text();
    } catch (err) {
      fetchIssues.push(`${path} 抓取失败：${(err as Error).message}`);
      return undefined;
    }
  };

  const [robotsTxt, llmsTxt, html] = await Promise.all([
    get("/robots.txt"),
    get("/llms.txt"),
    get("/"),
  ]);

  // 解析 JSON-LD
  const jsonLd: unknown[] = [];
  if (html) {
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      try {
        jsonLd.push(JSON.parse(m[1]));
      } catch {
        fetchIssues.push("存在无法解析的 JSON-LD（语法损坏）");
      }
    }
  }

  // 判定各 AI 爬虫是否被 robots 允许
  const crawlerAllowed: Record<string, boolean> = {};
  if (robotsTxt) {
    for (const c of AI_CRAWLERS) {
      crawlerAllowed[c.ua] = evaluateCrawlerAllowed(robotsTxt, c.ua);
    }
  } else {
    for (const c of AI_CRAWLERS) {
      crawlerAllowed[c.ua] = policy.allowSearch;
    }
  }

  // 组装检查输入
  const index = content ? buildContentIndex(content) : undefined;
  const input: AuditInput = {
    url: base,
    robotsTxt,
    llmsTxt,
    html,
    jsonLd,
    index: index
      ? {
          entries: index.entries.map((e) => ({
            sectionId: e.sectionId,
            title: e.title,
            description: e.description,
            url: e.url,
            category: e.category,
            quotable: e.quotable,
            hasFaq: e.hasFaq,
          })),
          capabilities: index.capabilities,
        }
      : undefined,
    locale: content?.locale,
    expectedSchemaTypes: content ? expectedTypes(content) : undefined,
    crawlerAllowed,
  };

  const result = scoreAudit(input);
  const rootCauses = diagnose(input, content);

  return {
    url: base,
    scoredAt: new Date().toISOString(),
    result,
    rootCauses,
    fetchIssues,
  };
}

function expectedTypes(content: SiteContent): string[] {
  const types = new Set<string>(["Organization", "WebSite"]);
  for (const s of content.sections) {
    switch (s.type) {
      case "about":
        types.add("AboutPage");
        break;
      case "contact":
        types.add("ContactPage");
        break;
      case "products":
      case "cases":
        types.add("CollectionPage");
        break;
      case "insights":
        types.add("BlogPage");
        break;
      default:
        types.add("WebPage");
    }
  }
  if (content.faq?.length) types.add("FAQPage");
  if (content.sections.some((s) => s.faq?.length)) types.add("FAQPage");
  if (content.products?.length) types.add("Product");
  if (content.insights?.length) types.add("BlogPosting");
  return [...types];
}

/**
 * 判定某个 UA 在 robots.txt 中是否被允许。
 *
 * 规则：找到该 UA 的专属段落，用其中的 Allow/Disallow 判定；
 * 没有专属段落则回落到 `User-agent: *` 段落。
 */
/**
 * 根因诊断 —— 从检查结果反推「最该先修什么」。
 *
 * 移植本地 geo-knowledge 的 diagnose 思路：不是罗列所有失败项，
 * 而是指出**根因**（一个原因解释多个症状）。
 */
export function diagnose(input: AuditInput, content?: SiteContent): RootCauseItem[] {
  const causes: RootCauseItem[] = [];

  // robots 拦截检索型爬虫 —— 最高优先级，拦了后面都白搭
  if (input.robotsTxt) {
    const blocked = Object.entries(input.crawlerAllowed ?? {})
      .filter(([, allowed]) => !allowed)
      .map(([ua]) => ua);
    if (blocked.length > 0) {
      causes.push({
        cause: "robots_blocking_ai",
        title: "robots.txt 拦截了 AI 爬虫",
        detail: `被拦截：${blocked.slice(0, 8).join(", ")}`,
        action: "放行 Search 与 On-demand 型爬虫（决定是否被引用的关键）",
        severity: "critical",
      });
    }
  }

  // llms.txt
  if (!input.llmsTxt) {
    causes.push({
      cause: "no_llms_txt",
      title: "缺少 llms.txt",
      detail: "未提供 llms.txt，AI 引擎缺少快速定位站点内容的入口",
      action: "运行 geo-kit 生成 llms.txt 并部署到站点根目录",
      severity: "warning",
    });
  } else {
    const parsed = parseLlmsTxt(input.llmsTxt);
    if (parsed.problems.length > 0) {
      causes.push({
        cause: "llms_txt_malformed",
        title: "llms.txt 结构不完整",
        detail: parsed.problems.join("；"),
        action: "按 llmstxt.org 规范重新生成（标题 + 描述段 + 分类 + 链接）",
        severity: "warning",
      });
    }
  }

  // 结构化数据
  if (!input.jsonLd || input.jsonLd.length === 0) {
    causes.push({
      cause: "no_structured_data",
      title: "缺少结构化数据",
      detail: "未检测到 JSON-LD，AI 引擎只能靠解析 HTML 猜测实体",
      action: "注入 Organization / WebSite / FAQPage 等 JSON-LD",
      severity: "critical",
    });
  } else {
    const types = new Set(
      input.jsonLd
        .map((s) => (s as { "@type"?: string })?.["@type"])
        .filter((t): t is string => typeof t === "string"),
    );
    const missing = (input.expectedSchemaTypes ?? []).filter((t) => !types.has(t));
    if (missing.length > 0) {
      causes.push({
        cause: "schema_incomplete",
        title: "结构化数据类型不全",
        detail: `缺失：${missing.join("、")}`,
        action: "补齐缺失的 Schema 类型",
        severity: "warning",
      });
    }
  }

  // 元信息
  if (input.html) {
    const hasCanonical =
      /<link[^>]+rel=["']canonical["']/i.test(input.html) ||
      /<link[^>]+href=["'][^"']*["'][^>]*rel=["']canonical["']/i.test(input.html);
    if (!hasCanonical) {
      causes.push({
        cause: "no_canonical",
        title: "缺少 canonical",
        detail: "未声明 canonical，重复内容会分散权重",
        action: "在 head 中加入 canonical 链接",
        severity: "info",
      });
    }
    const descMatch =
      input.html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
      input.html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    if (!descMatch || !descMatch[1].trim()) {
      causes.push({
        cause: "no_meta_description",
        title: "缺少 meta description",
        detail: "AI 摘要在无 description 时质量显著下降",
        action: "补充 70–170 字符的 meta description",
        severity: "warning",
      });
    }
  }

  // 内容相关（需要内容包）
  if (content) {
    const index = buildContentIndex(content);
    const totalParagraphs = index.entries.reduce((s, e) => s + e.quotable.paragraphs, 0);
    if (totalParagraphs === 0) {
      causes.push({
        cause: "thin_content",
        title: "内容过薄",
        detail: "全站无可抽取的正文段落",
        action: "补充正文段落，每段自包含且含具体数字",
        severity: "critical",
      });
    }

    const hasFaq =
      (content.faq?.length ?? 0) > 0 || content.sections.some((s) => (s.faq?.length ?? 0) > 0);
    if (!hasFaq) {
      causes.push({
        cause: "no_faq",
        title: "缺少 FAQ",
        detail: "问答对是 AI 答案最常引用的格式",
        action: "补充 5–10 条客户真实提问的问答",
        severity: "warning",
      });
    }

    const quotableLow = index.entries.filter(
      (e) => e.quotable.paragraphs > 0 && !e.quotable.answerFirst && e.quotable.withNumbers === 0,
    );
    if (quotableLow.length > 0 && quotableLow.length / Math.max(1, index.entries.length) > 0.5) {
      causes.push({
        cause: "not_citable",
        title: "内容难以被引用",
        detail: `${quotableLow.length} 个区块既非答案先行，也不含具体数字`,
        action: "改写为答案先行结构，并在首段给出具体数字",
        severity: "warning",
      });
    }

    if (index.capabilities.length === 0) {
      causes.push({
        cause: "no_capability_manifest",
        title: "缺少可调用性清单",
        detail: "站点未声明 AI 可调用的能力（Phase 3 MCP 前置条件）",
        action: "从内容包派生能力清单",
        severity: "info",
      });
    }
  }

  const order = { critical: 0, warning: 1, info: 2 };
  causes.sort((a, b) => order[a.severity] - order[b.severity]);
  return causes;
}

/** 渲染成人类可读的文本报告。 */
export function renderReport(report: AuditReport): string {
  const lines: string[] = [];
  const { result } = report;

  lines.push(`GEO 体检报告 — ${report.url}`);
  lines.push(`评分：${result.score}/100（等级 ${result.grade}）`);
  lines.push("");

  lines.push("维度得分：");
  for (const d of result.dimensions) {
    const bar = "█".repeat(Math.round(d.score / 10)).padEnd(10, "░");
    lines.push(`  ${d.key} ${d.name.padEnd(12, "　")} ${bar} ${String(d.score).padStart(3)}%`);
  }
  lines.push("");

  if (report.rootCauses.length > 0) {
    lines.push("根因诊断：");
    for (const rc of report.rootCauses) {
      const mark = rc.severity === "critical" ? "✗" : rc.severity === "warning" ? "!" : "·";
      lines.push(`  ${mark} ${rc.title}`);
      lines.push(`    ${rc.detail}`);
      if (rc.action) lines.push(`    → ${rc.action}`);
    }
    lines.push("");
  }

  if (result.recommendations.length > 0) {
    lines.push("修复建议（按影响排序）：");
    for (const r of result.recommendations.slice(0, 10)) {
      lines.push(`  [${r.dimension}] ${r.message}（缺口 ${r.impact.toFixed(1)}）`);
    }
    lines.push("");
  }

  if (report.fetchIssues.length > 0) {
    lines.push("抓取问题：");
    for (const f of report.fetchIssues) lines.push(`  · ${f}`);
  }

  return lines.join("\n");
}

/** 重新导出以便 CLI 使用。 */
export { extractQuotableSignals, sectionPath };
export type { Recommendation };

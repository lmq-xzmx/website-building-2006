/**
 * GEO 体检评分器 —— 移植 geo-platform/apps/geo-knowledge/internal/audit 的
 * A–F 六维骨架，并按 ADR-002 新增 DimG（可调用性）。
 *
 * 移植而非重造的原因（01 文档 §2.4）：
 *   本地评分器已有成熟的权重机制、partial/pass/fail 状态机、根因诊断，
 *   并且区分中英文市场。骨架照搬，站点专属的检查项重新定义。
 *
 * 与本地评分器的差异：
 *   - 本地评的是**素材/文章**（标题长度、图片 alt、视频 schema）；
 *     这里评的是**站点/页面**（爬虫准入、发现文件、结构化数据）。
 *   - 新增 DimG 可调用性（ADR-002 决策 3）。
 */

import { isAgentGroupDisallowed } from "./robots.js";

export type DimensionKey = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export type CheckStatus = "pass" | "partial" | "fail" | "unknown";

/** 检查项 */
export interface Check {
  id: string;
  name: string;
  weight: number;
  earned: number;
  status: CheckStatus;
  /** 这项检查在检查什么的固定说明（对同一项永远一样） */
  desc?: string;
  /** 本次诊断的结果说明（随被测对象变化） */
  note?: string;
}

export interface Dimension {
  key: DimensionKey;
  name: string;
  description: string;
  score: number;
  maxScore: number;
  weight: number;
  earned: number;
  checks: Check[];
}

export interface ScoreResult {
  score: number;
  grade: string;
  dimensions: Dimension[];
  /** 按影响排序的修复建议 */
  recommendations: Recommendation[];
}

export interface Recommendation {
  /** 维度 */
  dimension: DimensionKey;
  checkId: string;
  message: string;
  /** 缺口分值 —— 越大越该先修 */
  impact: number;
  /** 可执行的修复动作 */
  action?: string;
}

export interface AuditInput {
  /** 站点 URL */
  url: string;
  /** robots.txt 原文（未获取则为 undefined） */
  robotsTxt?: string;
  /** llms.txt 原文 */
  llmsTxt?: string;
  /** 页面 HTML（用于抽 head 标签与可见文本） */
  html?: string;
  /** 解析出的 JSON-LD 脚本 */
  jsonLd?: unknown[];
  /** 内容索引 */
  index?: {
    entries: Array<{
      sectionId: string;
      title: string;
      description: string;
      url: string;
      category: string;
      quotable: {
        paragraphs: number;
        withNumbers: number;
        withCitations: number;
        answerFirst: boolean;
        technicalTerms: number;
      };
      hasFaq: boolean;
    }>;
    capabilities: Array<{ id: string; description: string; sectionIds: string[]; mutating: boolean }>;
  };
  /** 站点语言 */
  locale?: "zh-CN" | "en-US";
  /** 期望存在的 Schema 类型 */
  expectedSchemaTypes?: string[];
  /** 爬虫策略判定结果 */
  crawlerAllowed?: Record<string, boolean>;
}

/** 维度定义 —— 与本地 geo-knowledge 一致的六维 + 新增 G。 */
export const DIMENSIONS: Array<{ key: DimensionKey; name: string; description: string }> = [
  { key: "A", name: "AI 爬虫准入", description: "答案引擎能否抓取到本站内容" },
  { key: "B", name: "AI 发现文件", description: "llms.txt 等机器可读入口是否完备" },
  { key: "C", name: "结构化数据", description: "JSON-LD 是否覆盖关键实体与类型" },
  { key: "D", name: "内容可抽取性", description: "AI 是否愿意原样复述你的内容" },
  { key: "E", name: "内容结构", description: "页面元信息与层级是否清晰" },
  { key: "F", name: "信任与权威", description: "主体可信度信号是否充分" },
  { key: "G", name: "可调用性", description: "AI 是否能按你的规则调用站点能力" },
];

/** 等级 */
export function getGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

/** 各维度权重（合计 1.0） */
const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  A: 0.22,
  B: 0.14,
  C: 0.2,
  D: 0.18,
  E: 0.12,
  F: 0.08,
  G: 0.06,
};

/** 计算单个维度的得分。 */
function scoreDimension(
  key: DimensionKey,
  checks: Check[],
): Dimension {
  const meta = DIMENSIONS.find((d) => d.key === key)!;
  const maxScore = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + c.earned, 0);
  return {
    key,
    name: meta.name,
    description: meta.description,
    score: maxScore > 0 ? Math.round((earned / maxScore) * 100) : 0,
    maxScore,
    weight: DIMENSION_WEIGHTS[key],
    earned,
    checks,
  };
}

/**
 * 主评分入口。
 *
 * 设计：**缺数据 = unknown 而非 fail**。
 * 拿不到 robots.txt 不等于 robots.txt 有问题 —— 判 fail 会给出错误结论。
 * unknown 的检查项不计入 maxScore（与本地评分器一致）。
 */
export function scoreAudit(input: AuditInput): ScoreResult {
  const checksByDim: Record<DimensionKey, Check[]> = {
    A: scoreDimA(input),
    B: scoreDimB(input),
    C: scoreDimC(input),
    D: scoreDimD(input),
    E: scoreDimE(input),
    F: scoreDimF(input),
    G: scoreDimG(input),
  };

  const dimensions = DIMENSIONS.map((d) => scoreDimension(d.key, checksByDim[d.key]));

  // 总分 = 各维度得分按维度权重加权
  let total = 0;
  let totalWeight = 0;
  for (const d of dimensions) {
    const w = DIMENSION_WEIGHTS[d.key];
    total += (d.maxScore > 0 ? d.earned / d.maxScore : 0) * w;
    totalWeight += w;
  }
  const score = totalWeight > 0 ? Math.round((total / totalWeight) * 100) : 0;

  // 修复建议：按缺口排序
  const recommendations: Recommendation[] = [];
  for (const d of dimensions) {
    for (const c of d.checks) {
      if (c.status === "pass" || c.status === "unknown") continue;
      const impact = c.weight - c.earned;
      if (impact <= 0) continue;
      recommendations.push({
        dimension: d.key,
        checkId: c.id,
        message: c.note ?? c.desc ?? c.name,
        impact,
      });
    }
  }
  recommendations.sort((a, b) => b.impact - a.impact);

  return { score, grade: getGrade(score), dimensions, recommendations };
}

// ── DimA：AI 爬虫准入 ────────────────────────────────────────

function scoreDimA(input: AuditInput): Check[] {
  const checks: Check[] = [];

  const hasRobots = typeof input.robotsTxt === "string" && input.robotsTxt.trim().length > 0;
  checks.push({
    id: "A1",
    name: "robots.txt 存在",
    weight: 3,
    earned: hasRobots ? 3 : 0,
    status: hasRobots ? "pass" : "fail",
    desc: "站点提供 robots.txt，明确告知爬虫访问策略",
    note: hasRobots ? "已找到 robots.txt" : "未找到 robots.txt",
  });

  if (hasRobots) {
    const robots = input.robotsTxt!;
    // 显式放行 Search 型 —— 这是被引用的关键
    const searchAllowed = /User-agent:\s*OAI-SearchBot[\s\S]*?Allow:\s*\//i.test(robots);
    checks.push({
      id: "A2",
      name: "放行答案引擎检索型爬虫",
      weight: 5,
      earned: searchAllowed ? 5 : 0,
      status: searchAllowed ? "pass" : "fail",
      desc: "显式放行 OAI-SearchBot / Claude-SearchBot 等检索型爬虫",
      note: searchAllowed
        ? "已显式放行检索型爬虫"
        : "未显式放行检索型爬虫（可能被当作通用规则处理）",
    });

    // 训练型策略显式声明
    const trainingDeclared = /User-agent:\s*(GPTBot|ClaudeBot|Google-Extended)/i.test(robots);
    checks.push({
      id: "A3",
      name: "训练型爬虫策略显式声明",
      weight: 2,
      earned: trainingDeclared ? 2 : 0,
      status: trainingDeclared ? "pass" : "partial",
      desc: "明确声明训练型爬虫的放行/屏蔽策略，而非依赖默认",
      note: trainingDeclared ? "已显式声明" : "未显式声明（依赖默认行为）",
    });

    // 禁止摘要指令会直接损害 GEO。
    //
    // 判据要精确 —— 不能全文搜 "nosnippet"：
    // 「User-agent: nosnippet」是合法的 UA 声明（精确匹配携带该指令的爬虫），
    // 全文匹配会把它误判成「站点禁止了摘要」。真正该判 fail 的是
    // **该 UA 组里存在 Disallow 规则**，或页面 meta 里声明了 nosnippet。
    const snippetBlocked =
      isAgentGroupDisallowed(robots, "nosnippet") ||
      (input.html ? /<meta[^>]+content=["'][^"']*nosnippet/i.test(input.html) : false);
    checks.push({
      id: "A4",
      name: "未禁止 AI 摘要",
      weight: 4,
      earned: snippetBlocked ? 0 : 4,
      status: snippetBlocked ? "fail" : "pass",
      desc: "未通过 nosnippet 等指令禁止 AI 生成摘要",
      note: snippetBlocked ? "存在禁止摘要的规则，会阻止 AI 摘要" : "未禁止摘要",
    });
  }

  // 已知被拦截的 UA
  if (input.crawlerAllowed) {
    const blocked = Object.entries(input.crawlerAllowed)
      .filter(([, allowed]) => !allowed)
      .map(([ua]) => ua);
    checks.push({
      id: "A5",
      name: "关键爬虫未被拦截",
      weight: 3,
      earned: blocked.length === 0 ? 3 : blocked.length > 2 ? 0 : 1.5,
      status: blocked.length === 0 ? "pass" : blocked.length > 2 ? "fail" : "partial",
      desc: "答案引擎与实时抓取型爬虫未被规则拦截",
      note:
        blocked.length === 0
          ? "无爬虫被拦截"
          : `被拦截：${blocked.slice(0, 6).join(", ")}`,
    });
  }

  return checks;
}

// ── DimB：AI 发现文件 ────────────────────────────────────────

function scoreDimB(input: AuditInput): Check[] {
  const checks: Check[] = [];

  const hasLlms = typeof input.llmsTxt === "string" && input.llmsTxt.trim().length > 0;
  checks.push({
    id: "B1",
    name: "llms.txt 存在",
    weight: 5,
    earned: hasLlms ? 5 : 0,
    status: hasLlms ? "pass" : "fail",
    desc: "提供 llms.txt，供 AI 引擎快速定位站点内容",
    note: hasLlms ? "已找到 llms.txt" : "未找到 llms.txt",
  });

  if (hasLlms) {
    const txt = input.llmsTxt!;
    const hasTitle = /^#\s+.+/m.test(txt);
    const hasDesc = /^>\s+.+/m.test(txt);
    const hasSections = /^##\s+.+/m.test(txt);
    const linkCount = (txt.match(/^-\s*\[/gm) ?? []).length;

    checks.push({
      id: "B2",
      name: "llms.txt 结构完整",
      weight: 4,
      earned:
        (hasTitle ? 1 : 0) + (hasDesc ? 1 : 0) + (hasSections ? 1 : 0) + (linkCount > 0 ? 1 : 0),
      status: hasTitle && hasDesc && hasSections && linkCount > 0 ? "pass" : "partial",
      desc: "包含标题、描述段、分类与链接列表",
      note: `标题${hasTitle ? "✓" : "✗"} 描述${hasDesc ? "✓" : "✗"} 分类${hasSections ? "✓" : "✗"} 链接${linkCount}条`,
    });

    checks.push({
      id: "B3",
      name: "llms.txt 链接数量充足",
      weight: 3,
      earned: linkCount >= 5 ? 3 : linkCount > 0 ? 1.5 : 0,
      status: linkCount >= 5 ? "pass" : linkCount > 0 ? "partial" : "fail",
      desc: "至少 5 条内容链接，否则索引价值过低",
      note: `当前 ${linkCount} 条链接`,
    });
  }

  return checks;
}

// ── DimC：结构化数据 ──────────────────────────────────────────

function scoreDimC(input: AuditInput): Check[] {
  const checks: Check[] = [];

  const scripts = input.jsonLd ?? [];
  const hasAny = scripts.length > 0;
  checks.push({
    id: "C1",
    name: "存在 JSON-LD",
    weight: 4,
    earned: hasAny ? 4 : 0,
    status: hasAny ? "pass" : "fail",
    desc: "页面提供 application/ld+json 结构化数据",
    note: hasAny ? `检测到 ${scripts.length} 段 JSON-LD` : "未检测到 JSON-LD",
  });

  if (hasAny) {
    const types = new Set<string>();
    for (const s of scripts) {
      const t = (s as { "@type"?: string })?.["@type"];
      if (typeof t === "string") types.add(t);
    }

    const expected = input.expectedSchemaTypes ?? ["Organization", "WebSite"];
    const missing = expected.filter((t) => !types.has(t));
    checks.push({
      id: "C2",
      name: "关键 Schema 类型齐全",
      weight: 6,
      earned: Math.max(0, 6 - missing.length * 1.5),
      status: missing.length === 0 ? "pass" : missing.length <= 2 ? "partial" : "fail",
      desc: `应包含：${expected.join("、")}`,
      note: missing.length === 0 ? "类型齐全" : `缺失：${missing.join("、")}`,
    });

    // Organization 与 WebSite 是身份声明 —— 缺失会直接影响品牌识别
    const hasOrg = types.has("Organization");
    const hasSite = types.has("WebSite");
    checks.push({
      id: "C3",
      name: "主体身份声明完整",
      weight: 4,
      earned: (hasOrg ? 2 : 0) + (hasSite ? 2 : 0),
      status: hasOrg && hasSite ? "pass" : hasOrg || hasSite ? "partial" : "fail",
      desc: "Organization 与 WebSite Schema 同时存在",
      note: `Organization ${hasOrg ? "✓" : "✗"}，WebSite ${hasSite ? "✓" : "✗"}`,
    });

    // FAQPage —— AI 最爱的格式
    const hasFaq = types.has("FAQPage");
    checks.push({
      id: "C4",
      name: "FAQPage Schema",
      weight: 3,
      earned: hasFaq ? 3 : 0,
      status: hasFaq ? "pass" : "partial",
      desc: "问答内容标记为 FAQPage，便于 AI 直接摘取",
      note: hasFaq ? "已标记 FAQPage" : "未标记 FAQPage",
    });

    // 相对 URL 检查
    const relativeUrls: string[] = [];
    const walk = (obj: unknown, path: string) => {
      if (typeof obj === "string") {
        if (/^\/(?!\/)/.test(obj) && /url$|logo$|image$/i.test(path)) {
          relativeUrls.push(`${path}=${obj}`);
        }
        return;
      }
      if (Array.isArray(obj)) {
        obj.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (obj && typeof obj === "object") {
        for (const [k, v] of Object.entries(obj)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    for (const s of scripts) walk(s, "");
    checks.push({
      id: "C5",
      name: "Schema 内无相对 URL",
      weight: 2,
      earned: relativeUrls.length === 0 ? 2 : 0,
      status: relativeUrls.length === 0 ? "pass" : "fail",
      desc: "JSON-LD 中的 URL 使用绝对路径，AI 引擎无法解析相对路径",
      note: relativeUrls.length === 0 ? "全部为绝对 URL" : `相对 URL：${relativeUrls.slice(0, 3).join(", ")}`,
    });
  }

  return checks;
}

// ── DimD：内容可抽取性（可引用性） ─────────────────────────────

function scoreDimD(input: AuditInput): Check[] {
  const checks: Check[] = [];

  if (!input.index) {
    checks.push({
      id: "D1",
      name: "内容可引用性",
      weight: 1,
      earned: 0,
      status: "unknown",
      desc: "需要内容索引才能评估",
    });
    return checks;
  }

  const entries = input.index.entries;
  if (entries.length === 0) {
    checks.push({
      id: "D1",
      name: "内容可引用性",
      weight: 1,
      earned: 0,
      status: "fail",
      desc: "站点无可评估的内容",
    });
    return checks;
  }

  const totalParagraphs = entries.reduce((s, e) => s + e.quotable.paragraphs, 0);
  const withNumbers = entries.reduce((s, e) => s + e.quotable.withNumbers, 0);
  const withCitations = entries.reduce((s, e) => s + e.quotable.withCitations, 0);
  const answerFirstCount = entries.filter((e) => e.quotable.answerFirst).length;
  const faqCount = entries.filter((e) => e.hasFaq).length;

  // Statistics Addition +33%
  const numberRatio = totalParagraphs > 0 ? withNumbers / totalParagraphs : 0;
  checks.push({
    id: "D1",
    name: "内容含具体数字",
    weight: 4,
    earned: Math.min(4, numberRatio * 8),
    status: numberRatio >= 0.3 ? "pass" : numberRatio > 0 ? "partial" : "fail",
    desc: "含具体数字的段落占比（AI 引用数字的倾向明显更高）",
    note: `${withNumbers}/${totalParagraphs} 段含数字（${Math.round(numberRatio * 100)}%）`,
  });

  // Cite Sources +27%
  const citationRatio = totalParagraphs > 0 ? withCitations / totalParagraphs : 0;
  checks.push({
    id: "D2",
    name: "内容含来源引用",
    weight: 3,
    earned: Math.min(3, citationRatio * 6),
    status: citationRatio >= 0.2 ? "pass" : citationRatio > 0 ? "partial" : "fail",
    desc: "含出处/引用标记的段落占比",
    note: `${withCitations}/${totalParagraphs} 段含引用（${Math.round(citationRatio * 100)}%）`,
  });

  // Answer-First Structure +25%
  const afRatio = entries.length > 0 ? answerFirstCount / entries.length : 0;
  checks.push({
    id: "D3",
    name: "答案先行结构",
    weight: 4,
    earned: Math.min(4, afRatio * 6),
    status: afRatio >= 0.5 ? "pass" : afRatio > 0 ? "partial" : "fail",
    desc: "段落开头直接给出结论（AutoGEO 研究中影响力 +25%）",
    note: `${answerFirstCount}/${entries.length} 个区块答案先行`,
  });

  // FAQ-in-Content +12%
  checks.push({
    id: "D4",
    name: "内嵌 FAQ",
    weight: 3,
    earned: faqCount > 0 ? Math.min(3, faqCount) : 0,
    status: faqCount >= 2 ? "pass" : faqCount > 0 ? "partial" : "fail",
    desc: "内容中包含问答对（AI 最爱的格式）",
    note: `${faqCount} 个区块含 FAQ`,
  });

  // 段落密度 —— 内容太薄无法被引用
  const avgParagraphs = totalParagraphs / entries.length;
  checks.push({
    id: "D5",
    name: "内容密度充足",
    weight: 3,
    earned: avgParagraphs >= 3 ? 3 : avgParagraphs >= 1 ? 1.5 : 0,
    status: avgParagraphs >= 3 ? "pass" : avgParagraphs >= 1 ? "partial" : "fail",
    desc: "每个区块平均段落数 ≥3，过薄内容无法承载可引用信息",
    note: `平均 ${avgParagraphs.toFixed(1)} 段/区块`,
  });

  // No Keyword Stuffing −9%
  const stuffingSuspect = entries.filter(
    (e) => e.quotable.paragraphs > 0 && e.quotable.technicalTerms > e.quotable.paragraphs * 8,
  );
  checks.push({
    id: "D6",
    name: "无关键词堆砌",
    weight: 2,
    earned: stuffingSuspect.length === 0 ? 2 : 0,
    status: stuffingSuspect.length === 0 ? "pass" : "fail",
    desc: "术语密度异常（堆砌是负向信号，影响力 −9%）",
    note:
      stuffingSuspect.length === 0
        ? "未发现堆砌特征"
        : `${stuffingSuspect.length} 个区块术语密度异常`,
  });

  return checks;
}

// ── DimE：内容结构 ────────────────────────────────────────────

function scoreDimE(input: AuditInput): Check[] {
  const checks: Check[] = [];
  const html = input.html;

  if (!html) {
    checks.push({
      id: "E1",
      name: "页面结构",
      weight: 1,
      earned: 0,
      status: "unknown",
      desc: "需要 HTML 才能评估 head 标签",
    });
    return checks;
  }

  const hasTitle = /<title[^>]*>.{1,}/i.test(html);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleLen = titleMatch ? titleMatch[1].trim().length : 0;

  // 中英文站的长度期望不同
  const isZh = (input.locale ?? "zh-CN") === "zh-CN";
  const titleOk = isZh ? titleLen >= 10 && titleLen <= 60 : titleLen >= 15 && titleLen <= 65;

  checks.push({
    id: "E1",
    name: "title 存在且长度合理",
    weight: 3,
    earned: hasTitle ? (titleOk ? 3 : 1.5) : 0,
    status: hasTitle ? (titleOk ? "pass" : "partial") : "fail",
    desc: isZh ? "中文站标题 10–60 字符" : "英文站标题 15–65 字符",
    note: hasTitle ? `标题长度 ${titleLen} 字符` : "缺少 title 标签",
  });

  const descMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  );
  const descLen = descMatch ? descMatch[1].trim().length : 0;
  // GEORank 的中文实践：150–160 字符
  const descOk = descLen >= 70 && descLen <= 170;

  checks.push({
    id: "E2",
    name: "meta description",
    weight: 3,
    earned: descLen > 0 ? (descOk ? 3 : 1.5) : 0,
    status: descLen === 0 ? "fail" : descOk ? "pass" : "partial",
    desc: "meta description 长度 70–170 字符",
    note: descLen === 0 ? "缺少 meta description" : `长度 ${descLen} 字符`,
  });

  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  checks.push({
    id: "E3",
    name: "canonical 链接",
    weight: 2,
    earned: hasCanonical ? 2 : 0,
    status: hasCanonical ? "pass" : "partial",
    desc: "声明 canonical，避免重复内容分散权重",
    note: hasCanonical ? "已声明 canonical" : "未声明 canonical",
  });

  const hasOgImage = /<meta[^>]+property=["']og:image["']/i.test(html);
  checks.push({
    id: "E4",
    name: "og:image",
    weight: 2,
    earned: hasOgImage ? 2 : 0,
    status: hasOgImage ? "pass" : "partial",
    desc: "社交分享与 AI 摘要需要预览图（建议 1200×630）",
    note: hasOgImage ? "已设置 og:image" : "未设置 og:image",
  });

  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
  checks.push({
    id: "E5",
    name: "H1 唯一",
    weight: 2,
    earned: h1Count === 1 ? 2 : h1Count === 0 ? 0 : 1,
    status: h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "partial",
    desc: "每页只保留一个 H1",
    note: `当前 ${h1Count} 个 H1`,
  });

  const hasLang = /<html[^>]+lang=["']/i.test(html);
  checks.push({
    id: "E6",
    name: "语言声明",
    weight: 1,
    earned: hasLang ? 1 : 0,
    status: hasLang ? "pass" : "fail",
    desc: "html 标签声明 lang，AI 引擎据此选择语言模型",
    note: hasLang ? "已声明 lang" : "html 标签未声明 lang",
  });

  return checks;
}

// ── DimF：信任与权威 ──────────────────────────────────────────

function scoreDimF(input: AuditInput): Check[] {
  const checks: Check[] = [];

  if (!input.html) {
    checks.push({
      id: "F1",
      name: "信任信号",
      weight: 1,
      earned: 0,
      status: "unknown",
      desc: "需要 HTML 才能评估",
    });
    return checks;
  }

  const html = input.html;
  const scripts = input.jsonLd ?? [];
  const types = new Set(
    scripts
      .map((s) => (s as { "@type"?: string })?.["@type"])
      .filter((t): t is string => typeof t === "string"),
  );

  // 主体声明完整（Organization 有 name/url/logo）
  const org = scripts.find((s) => (s as { "@type"?: string })?.["@type"] === "Organization") as
    | { name?: string; url?: string; logo?: unknown }
    | undefined;
  const orgComplete = Boolean(org?.name && org?.url && org?.logo);
  checks.push({
    id: "F1",
    name: "主体声明完整",
    weight: 4,
    earned: orgComplete ? 4 : org ? 2 : 0,
    status: orgComplete ? "pass" : org ? "partial" : "fail",
    desc: "Organization Schema 含 name/url/logo，AI 才能确认主体身份",
    note: orgComplete
      ? "Organization 声明完整"
      : org
        ? "Organization 缺少字段"
        : "未声明 Organization",
  });

  // 社交关联 sameAs
  const hasSameAs = Boolean(org && (org as { sameAs?: string[] }).sameAs?.length);
  checks.push({
    id: "F2",
    name: "社交账号关联",
    weight: 2,
    earned: hasSameAs ? 2 : 0,
    status: hasSameAs ? "pass" : "partial",
    desc: "sameAs 关联社交账号，佐证品牌实体",
    note: hasSameAs ? "已关联社交账号" : "未关联 sameAs",
  });

  // HTTPS
  const isHttps = input.url.startsWith("https://");
  checks.push({
    id: "F3",
    name: "HTTPS",
    weight: 3,
    earned: isHttps ? 3 : 0,
    status: isHttps ? "pass" : "fail",
    desc: "全站 HTTPS，AI 引擎对不安全站点的信任度显著降低",
    note: isHttps ? "HTTPS" : "非 HTTPS",
  });

  // 联系方式可达
  const hasContact = /mailto:|tel:/.test(html) || types.size > 0;
  checks.push({
    id: "F4",
    name: "联系方式可达",
    weight: 1,
    earned: hasContact ? 1 : 0,
    status: hasContact ? "pass" : "partial",
    desc: "提供可被抽取的联系通道",
    note: hasContact ? "已提供联系方式" : "未找到联系方式",
  });

  return checks;
}

// ── DimG：可调用性（ADR-002 决策 3） ───────────────────────────

function scoreDimG(input: AuditInput): Check[] {
  const checks: Check[] = [];

  if (!input.index) {
    checks.push({
      id: "G1",
      name: "可调用性",
      weight: 1,
      earned: 0,
      status: "unknown",
      desc: "需要内容索引才能评估",
    });
    return checks;
  }

  const caps = input.index.capabilities;
  checks.push({
    id: "G1",
    name: "存在机器可读能力清单",
    weight: 4,
    earned: caps.length > 0 ? 4 : 0,
    status: caps.length > 0 ? "pass" : "fail",
    desc: "站点声明了可被 AI 调用的能力（Phase 3 的 MCP 前置条件）",
    note: caps.length > 0 ? `${caps.length} 项能力` : "无能力清单",
  });

  const readOnly = caps.filter((c) => !c.mutating).length;
  checks.push({
    id: "G2",
    name: "只读能力可寻址",
    weight: 3,
    earned: readOnly > 0 ? Math.min(3, readOnly) : 0,
    status: readOnly > 0 ? "pass" : "fail",
    desc: "至少提供一项只读查询能力",
    note: `${readOnly} 项只读能力`,
  });

  // 每个能力都应关联到实际区块 —— 否则是空声明
  const orphanCaps = caps.filter(
    (c) => c.sectionIds.length === 0 || !input.index!.entries.some((e) => c.sectionIds.includes(e.sectionId)),
  );
  checks.push({
    id: "G3",
    name: "能力与内容对应",
    weight: 3,
    earned: orphanCaps.length === 0 ? 3 : Math.max(0, 3 - orphanCaps.length),
    status: orphanCaps.length === 0 ? "pass" : orphanCaps.length <= 1 ? "partial" : "fail",
    desc: "每项能力都指向实际存在的内容区块",
    note:
      orphanCaps.length === 0
        ? "能力与内容完全对应"
        : `${orphanCaps.length} 项能力无对应内容`,
  });

  return checks;
}

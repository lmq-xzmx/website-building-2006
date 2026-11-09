/**
 * AI 爬虫策略 —— GEO 维度 A（AI 爬虫准入）。
 *
 * 核心区分（01 文档 §4 的关键结论）：
 *
 *   Search 型   —— 答案引擎检索，**决定是否被引用**。必须放行。
 *   On-demand 型 —— 用户提问时实时抓取。必须放行。
 *   Training 型  —— 模型训练，**不影响引用**。可放行或屏蔽。
 *
 * 常见错误是一刀切禁掉 `GPTBot`：无引用收益却失去训练收录。
 * 但另一个极端（全部放行）也不对 —— 有些客户不希望内容进训练集。
 *
 * 因此本模块把策略做成**显式配置**，而不是隐式默认：
 *   - 默认：Search + On-demand 放行，Training 放行（利于 AI 认知）
 *   - 可配置：训练型放行 / 屏蔽，以及 nosnippet 等指令的禁用
 */

export type CrawlerType = "search" | "on-demand" | "training" | "control";

export interface CrawlerSpec {
  /** User-Agent 标识 */
  ua: string;
  type: CrawlerType;
  /** 厂商 */
  vendor: string;
  /** 说明 */
  note: string;
}

/**
 * AI 爬虫清单 —— 27 个 UA，按四类划分。
 *
 * 来源：geo-optimizer-skill/references/ai-bots-list.md（MIT）
 * 补入中文引擎（百度/搜狗/360/头条）—— 参考生态完全缺失这一段。
 */
export const AI_CRAWLERS: CrawlerSpec[] = [
  // ── Search 型：决定是否被答案引擎引用 ────────────────────────
  { ua: "OAI-SearchBot", type: "search", vendor: "OpenAI", note: "ChatGPT Search 引用来源" },
  { ua: "Claude-SearchBot", type: "search", vendor: "Anthropic", note: "Claude 搜索索引" },
  { ua: "PerplexityBot", type: "search", vendor: "Perplexity", note: "Perplexity 检索" },
  { ua: "Bingbot", type: "search", vendor: "Microsoft", note: "Bing 索引（Copilot 复用）" },
  { ua: "Googlebot", type: "search", vendor: "Google", note: "Google 索引（AI Overviews 数据源）" },
  { ua: "Baiduspider", type: "search", vendor: "百度", note: "百度索引（国内 AI 问答数据源）" },
  { ua: "Sogou web spider", type: "search", vendor: "搜狗", note: "搜狗索引" },
  { ua: "360Spider", type: "search", vendor: "360", note: "360 索引" },
  { ua: "Bytespider", type: "search", vendor: "字节", note: "豆包/字节搜索" },

  // ── On-demand 型：用户提问时实时抓取 ────────────────────────
  { ua: "ChatGPT-User", type: "on-demand", vendor: "OpenAI", note: "ChatGPT 用户提问时抓取" },
  { ua: "Claude-User", type: "on-demand", vendor: "Anthropic", note: "Claude 用户提问时抓取" },
  { ua: "Perplexity-User", type: "on-demand", vendor: "Perplexity", note: "Perplexity 用户触发抓取" },
  { ua: "meta-externalagent", type: "on-demand", vendor: "Meta", note: "Meta AI 抓取" },
  { ua: "Applebot-Extended", type: "on-demand", vendor: "Apple", note: "Apple Intelligence 抓取" },
  { ua: "DuckAssistBot", type: "on-demand", vendor: "DuckDuckGo", note: "DuckDuckGo AI 抓取" },
  { ua: "Amazonbot", type: "on-demand", vendor: "Amazon", note: "Amazon 问答" },
  { ua: "CCBot", type: "on-demand", vendor: "Common Crawl", note: "通用语料抓取" },

  // ── Training 型：模型训练，不影响引用 ────────────────────────
  { ua: "GPTBot", type: "training", vendor: "OpenAI", note: "OpenAI 训练" },
  { ua: "ClaudeBot", type: "training", vendor: "Anthropic", note: "Anthropic 训练" },
  { ua: "anthropic-ai", type: "training", vendor: "Anthropic", note: "Anthropic 训练（旧标识）" },
  { ua: "Google-Extended", type: "training", vendor: "Google", note: "Gemini 训练（不用于 Google 索引）" },
  { ua: "Applebot", type: "training", vendor: "Apple", note: "Apple 训练" },
  { ua: "AI2Bot", type: "training", vendor: "Allen AI", note: "学术训练" },
  { ua: "Meta-ExternalFetcher", type: "training", vendor: "Meta", note: "Meta 训练" },

  // ── Control 型：行为控制指令 ───────────────────────────────
  { ua: "nosnippet", type: "control", vendor: "通用", note: "禁止生成摘要" },
  { ua: "max-snippet", type: "control", vendor: "通用", note: "限制摘要长度" },
  { ua: "claude-web", type: "control", vendor: "Anthropic", note: "Claude 网页抓取标识" },
];

export interface CrawlerPolicy {
  /** 是否允许训练型爬虫 */
  allowTraining: boolean;
  /** 是否允许 Search 型（几乎不应关闭） */
  allowSearch: boolean;
  /** 是否允许 On-demand 型 */
  allowOnDemand: boolean;
  /**
   * 是否禁用 nosnippet / max-snippet 指令。
   *
   * 默认 true（禁用指令）—— 允许 AI 生成摘要，正是 GEO 想要的效果。
   * 若客户要求「不许 AI 引用我的内容」，才设为 false。
   */
  disallowSnippetControl: boolean;
  /** 额外允许的 UA（白名单） */
  allowExtra?: string[];
  /** 额外屏蔽的 UA（黑名单，优先级高于白名单） */
  blockExtra?: string[];
}

export const DEFAULT_CRAWLER_POLICY: CrawlerPolicy = {
  allowTraining: true,
  allowSearch: true,
  allowOnDemand: true,
  disallowSnippetControl: true,
};

/**
 * 生成 robots.txt。
 *
 * 关键：**显式放行 Search 与 On-demand 型**，让 AI 引擎明确知道可以抓。
 * 只写 `User-agent: * Allow: /` 是不够明确的 —— 显式声明更可靠。
 */
export function generateRobotsTxt(
  siteUrl: string,
  policy: CrawlerPolicy = DEFAULT_CRAWLER_POLICY,
  options: { sitemap?: boolean } = {},
): string {
  const lines: string[] = [];
  const base = siteUrl.replace(/\/+$/, "");

  lines.push("# robots.txt —— AI 爬虫策略");
  lines.push("# 由 geo-kit 生成（@geokit/geo-kit）");
  lines.push("#");
  lines.push("# 策略说明：");
  lines.push("#   Search 型   —— 答案引擎检索源，决定是否被引用 → 放行");
  lines.push("#   On-demand 型 —— 用户提问时实时抓取 → 放行");
  lines.push(
    `#   Training 型  —— 仅模型训练，不影响引用 → ${policy.allowTraining ? "放行" : "屏蔽"}`,
  );
  lines.push("");

  const groups = new Map<CrawlerType, CrawlerSpec[]>();
  for (const c of AI_CRAWLERS) {
    const list = groups.get(c.type) ?? [];
    list.push(c);
    groups.set(c.type, list);
  }

  const typeAllowed: Record<CrawlerType, boolean> = {
    search: policy.allowSearch,
    "on-demand": policy.allowOnDemand,
    training: policy.allowTraining,
    control: policy.disallowSnippetControl,
  };

  const typeComment: Record<CrawlerType, string> = {
    search: "答案引擎检索源 —— 决定是否被引用",
    "on-demand": "用户提问时实时抓取",
    training: "模型训练 —— 不影响引用",
    control: "行为控制指令",
  };

  for (const type of ["search", "on-demand", "training", "control"] as CrawlerType[]) {
    const specs = groups.get(type);
    if (!specs?.length) continue;
    const allowed = typeAllowed[type];
    lines.push(`# ${typeComment[type]}`);
    for (const s of specs) {
      lines.push(`User-agent: ${s.ua}`);
      lines.push(allowed ? "Allow: /" : "Disallow: /");
      lines.push("");
    }
  }

  // 通用爬虫
  lines.push("# 通用搜索引擎爬虫");
  lines.push("User-agent: *");
  lines.push("Allow: /");
  lines.push("");

  // 额外白名单
  if (policy.allowExtra?.length) {
    lines.push("# 额外放行");
    for (const ua of policy.allowExtra) {
      lines.push(`User-agent: ${ua}`);
      lines.push("Allow: /");
      lines.push("");
    }
  }

  // 额外黑名单（优先级高于白名单 —— 放在最后）
  if (policy.blockExtra?.length) {
    lines.push("# 额外屏蔽");
    for (const ua of policy.blockExtra) {
      lines.push(`User-agent: ${ua}`);
      lines.push("Disallow: /");
      lines.push("");
    }
  }

  if (options.sitemap !== false) {
    lines.push(`Sitemap: ${base}/sitemap.xml`);
    lines.push(`Sitemap: ${base}/llms.txt`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * 判断某个 UA 在给定策略下是否被允许。
 *
 * 体检用（DimA 的 blocks 检查项）。
 */
export function isCrawlerAllowed(ua: string, policy: CrawlerPolicy = DEFAULT_CRAWLER_POLICY): boolean {
  // 黑名单优先
  if (policy.blockExtra?.some((b) => ua.toLowerCase().includes(b.toLowerCase()))) {
    return false;
  }
  if (policy.allowExtra?.some((a) => ua.toLowerCase().includes(a.toLowerCase()))) {
    return true;
  }

  const spec = AI_CRAWLERS.find((c) => ua.toLowerCase().includes(c.ua.toLowerCase()));
  if (!spec) return true; // 未知 UA 按通用处理

  switch (spec.type) {
    case "search":
      return policy.allowSearch;
    case "on-demand":
      return policy.allowOnDemand;
    case "training":
      return policy.allowTraining;
    case "control":
      return policy.disallowSnippetControl;
    default:
      return true;
  }
}

/** 按类型列出 UA，供体检报告展示。 */
export function crawlersByType(type: CrawlerType): CrawlerSpec[] {
  return AI_CRAWLERS.filter((c) => c.type === type);
}

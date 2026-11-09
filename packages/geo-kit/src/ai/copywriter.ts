/**
 * AI 文案生成 —— 把公司资料变成符合 GEO 原则的站点文案（Phase 2 B 类）。
 *
 * 关键设计：
 *   1. **提示词内置 GEO 写作规则** —— 不是「请写一段文案」，
 *      而是明确要求答案先行、含具体数字、每段自包含、可独立引用。
 *      这才是 AI 生成内容也能被 AI 引用的原因。
 *   2. **流式/批量** —— 按区块生成，一次一个区块，避免超长输出被截断。
 *   3. **模型无关** —— 只依赖 Anthropic 兼容接口（与 geo-platform 的
 *      MINIMAX_BASE_URL 同一套协议），换 provider 只改 baseUrl/model。
 *   4. **失败可降级** —— 生成失败时返回原文，不阻断建站流水线。
 *
 * 这不是「一键生成整站」的玩具：
 *   生成的是**初稿**，仍需人工与事实核对（数字、案例、资质不能编）。
 *   所以提示词里明确要求：不知道的信息留空，不得编造。
 */

import type { SiteContent } from "../types.js";

export interface LlmConfig {
  /** Anthropic 兼容端点，如 https://api.minimaxi.com/anthropic */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 单次请求超时（毫秒） */
  timeout?: number;
  /** 最大输出 token */
  maxTokens?: number;
}

export interface CopyOptions {
  /** 要生成的区块 id；不给则全部 */
  sectionIds?: string[];
  /** 行业写作提示（来自 IndustryPack.writingHints） */
  writingHints?: string[];
  /** 行业术语库（来自 IndustryPack.terminology） */
  terminology?: string[];
  /** 额外指示 */
  extraInstructions?: string;
  /** 覆盖 LLM 配置（默认读环境变量） */
  llm?: LlmConfig;
}

export interface SectionDraft {
  sectionId: string;
  /** 生成的正文段落 */
  body: string[];
  /** 生成的要点 */
  bullets: string[];
  /** 生成的副标题 */
  subtitle?: string;
  /** 是否成功（失败时 ok=false，保留原内容） */
  ok: boolean;
  /** 失败原因 */
  error?: string;
}

/** 从环境变量读取 LLM 配置。 */
export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const baseUrl = env.LLM_BASE_URL ?? env.MINIMAX_BASE_URL;
  const apiKey = env.LLM_API_KEY ?? env.MINIMAX_API_KEY;
  const model = env.LLM_MODEL ?? env.MINIMAX_MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  return {
    baseUrl,
    apiKey,
    model,
    timeout: Number(env.LLM_TIMEOUT ?? 60000),
    maxTokens: Number(env.LLM_MAX_TOKENS ?? 4096),
  };
}

/**
 * GEO 写作规则 —— 注入提示词的硬约束。
 *
 * 每条都对应 geo-optimizer 的可引用性方法与其影响力：
 *   Answer-First(+25%) / Statistics(+33%) / Cite Sources(+27%) /
 *   Passage Density(+23%) / Technical Terms(+18%)
 */
export const GEO_WRITING_RULES = [
  "每段第一句直接给出结论（答案先行），不要铺垫、不要「随着…的发展」这类套话",
  "正文至少两段包含具体数字（数量、比例、时间、金额），不要用「很多」「大幅」这类模糊词",
  "每段必须自包含：脱离页面上下文单独看也成立，明确写出主体名称",
  "段落长度 2–4 句，不要超过 120 字 —— 短段落更易被整段引用",
  "使用行业专业术语，但每个术语首次出现时用一句话解释",
  "不要写「行业领先」「品质卓越」这类无信息量的形容词",
  "绝对不要编造数字、案例、客户名称、认证编号 —— 不确定的地方留空并标注 [待补充]",
  "语言直白，避免营销腔",
];

const SYSTEM_PROMPT = `你是企业官网文案撰写者，同时精通 GEO（生成式引擎优化）。

你的文案有两个读者：人类访客，和抓取网页后转述给用户的 AI 引擎。

对 AI 读者而言，一个段落被引用的前提是：
1. 它能脱离上下文独立成立（明确写出主体是谁）
2. 它包含具体、可验证的信息（数字、参数、事实）
3. 它的开头就是结论，而不是背景铺垫

严格遵守以下写作规则：
${GEO_WRITING_RULES.map((r, i) => `${i + 1}. ${r}`).join("\n")}

输出格式（严格 JSON，不要任何额外说明）：
{
  "subtitle": "一句话定位语，包含关键数字",
  "body": ["段落1", "段落2", "段落3"],
  "bullets": ["要点1", "要点2", "要点3", "要点4"]
}`;

/**
 * 构造用户提示 —— 把区块上下文与公司资料交给模型。
 */
function buildUserPrompt(
  content: SiteContent,
  section: { id: string; title: string; type: string; body?: string[]; bullets?: string[] },
  options: CopyOptions,
): string {
  const parts: string[] = [];

  parts.push(`公司：${content.organization.name}`);
  if (content.organization.legalName) parts.push(`公司全称：${content.organization.legalName}`);
  if (content.organization.description) parts.push(`公司介绍：${content.organization.description}`);
  if (content.organization.industry) parts.push(`所属行业：${content.organization.industry}`);
  if (content.organization.foundingDate) parts.push(`成立时间：${content.organization.foundingDate}`);
  if (content.organization.numberOfEmployees) parts.push(`员工规模：${content.organization.numberOfEmployees}`);

  parts.push(`\n要撰写的区块：${section.title}（类型 ${section.type}）`);

  if (section.body?.length) {
    parts.push(`\n现有内容（可参考事实，但请按 GEO 规则重写）：\n${section.body.join("\n")}`);
  }
  if (section.bullets?.length) {
    parts.push(`\n现有要点：\n${section.bullets.map((b) => `- ${b}`).join("\n")}`);
  }

  if (options.terminology?.length) {
    parts.push(`\n可使用的行业术语：${options.terminology.join("、")}`);
  }
  if (options.writingHints?.length) {
    parts.push(`\n行业写作要求：\n${options.writingHints.map((h) => `- ${h}`).join("\n")}`);
  }
  if (options.extraInstructions) {
    parts.push(`\n额外要求：${options.extraInstructions}`);
  }

  parts.push(`\n请为「${section.title}」撰写正文，输出严格 JSON。`);

  return parts.join("\n");
}

/**
 * 调用 Anthropic 兼容接口。
 */
async function callLlm(
  cfg: LlmConfig,
  userPrompt: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeout ?? 60000);

  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/v1/messages`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: cfg.maxTokens ?? 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    if (!text) throw new Error("LLM 返回空内容");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析模型返回的 JSON。
 *
 * 模型常在 JSON 前后带解释文字或 ```json 围栏 —— 都要能容错。
 */
export function parseLlmJson(raw: string): {
  ok: boolean;
  data?: { subtitle?: string; body?: string[]; bullets?: string[] };
  error?: string;
} {
  let text = raw.trim();

  // 去掉 markdown 围栏
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // 截取第一个 { 到最后一个 }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: "返回内容中没有 JSON 对象" };
  }
  text = text.slice(start, end + 1);

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "JSON 不是对象" };
    }
    const body = Array.isArray(parsed.body)
      ? parsed.body.filter((b: unknown): b is string => typeof b === "string")
      : [];
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.filter((b: unknown): b is string => typeof b === "string")
      : [];
    return {
      ok: true,
      data: {
        subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : undefined,
        body,
        bullets,
      },
    };
  } catch (err) {
    return { ok: false, error: `JSON 解析失败：${(err as Error).message}` };
  }
}

/**
 * 为区块生成文案初稿。
 *
 * 失败不抛异常 —— 返回 ok=false，让调用方保留原内容继续建站。
 */
export async function generateSectionCopy(
  content: SiteContent,
  sectionId: string,
  options: CopyOptions = {},
): Promise<SectionDraft> {
  const section = content.sections.find((s) => s.id === sectionId);
  if (!section) {
    return { sectionId, body: [], bullets: [], ok: false, error: `区块不存在：${sectionId}` };
  }

  const cfg = options.llm ?? llmConfigFromEnv();
  if (!cfg) {
    return {
      sectionId,
      body: [],
      bullets: [],
      ok: false,
      error: "未配置 LLM（需要 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL）",
    };
  }

  try {
    const raw = await callLlm(cfg, buildUserPrompt(content, section, options));
    const parsed = parseLlmJson(raw);
    if (!parsed.ok || !parsed.data) {
      return {
        sectionId,
        body: section.body ?? [],
        bullets: section.bullets ?? [],
        ok: false,
        error: parsed.error ?? "解析失败",
      };
    }
    return {
      sectionId,
      subtitle: parsed.data.subtitle ?? section.subtitle,
      body:
        parsed.data.body && parsed.data.body.length > 0
          ? parsed.data.body
          : (section.body ?? []),
      bullets:
        parsed.data.bullets && parsed.data.bullets.length > 0
          ? parsed.data.bullets
          : (section.bullets ?? []),
      ok: true,
    };
  } catch (err) {
    return {
      sectionId,
      body: section.body ?? [],
      bullets: section.bullets ?? [],
      ok: false,
      error: (err as Error).message,
    };
  }
}

/**
 * 批量生成多个区块的文案。
 */
export async function generateCopy(
  content: SiteContent,
  options: CopyOptions = {},
): Promise<SectionDraft[]> {
  const ids = options.sectionIds ?? content.sections.map((s) => s.id);
  const drafts: SectionDraft[] = [];

  for (const id of ids) {
    const draft = await generateSectionCopy(content, id, options);
    drafts.push(draft);
    const mark = draft.ok ? "✓" : "✗";
    console.error(`  ${mark} ${id}${draft.error ? ` — ${draft.error}` : ""}`);
  }

  return drafts;
}

/**
 * 把生成的初稿合并回内容包。
 *
 * 只替换成功生成的区块 —— 失败的不动。
 */
export function applyDrafts(content: SiteContent, drafts: SectionDraft[]): SiteContent {
  const byId = new Map(drafts.filter((d) => d.ok).map((d) => [d.sectionId, d]));

  return {
    ...content,
    sections: content.sections.map((s) => {
      const draft = byId.get(s.id);
      if (!draft) return s;
      return {
        ...s,
        subtitle: draft.subtitle ?? s.subtitle,
        body: draft.body.length > 0 ? draft.body : s.body,
        bullets: draft.bullets.length > 0 ? draft.bullets : s.bullets,
      };
    }),
  };
}

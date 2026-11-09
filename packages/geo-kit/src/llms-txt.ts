/**
 * llms.txt 生成器 —— GEO 维度 B（AI 发现文件）。
 *
 * 结构遵循 llmstxt.org 规范（ADR-002 决策 4 定案）：
 *
 *   # 站点名
 *   > 一句话描述
 *
 *   ## 分类名
 *   - [页面标题](URL)：一句话描述
 *
 * 关键设计（从 geo-optimizer 的生成器吸收的经验）：
 *   1. **分类从内容包自动派生**，不是手写枚举 —— 新增区块零配置；
 *   2. **每分类链接数有上限**（默认 20），否则大站 llms.txt 会超出引擎读取窗口；
 *   3. **描述用 blockquote 承载**，从 Organization 派生而非另写一份。
 */

import {
  buildContentIndex,
  groupIndexByCategory,
} from "./content-index.js";
import type { ContentIndex, SiteContent } from "./types.js";

/** 每分类最大链接数 —— 防止文件过大被引擎截断 */
export const MAX_URLS_PER_SECTION = 20;

/** llms-full.txt 全文镜像的段落长度上限（字符） */
export const LLMS_FULL_MAX_CHARS = 200_000;

export interface LlmsTxtOptions {
  /** 每分类最大链接数 */
  maxUrlsPerSection?: number;
  /** 是否生成 llms-full.txt */
  includeFull?: boolean;
}

/**
 * 生成 llms.txt。
 *
 * @param content 站点内容包
 * @param index  内容索引（可选；不给则内部构建）
 */
export function generateLlmsTxt(
  content: SiteContent,
  index?: ContentIndex,
  options: LlmsTxtOptions = {},
): string {
  const idx = index ?? buildContentIndex(content);
  const maxPerSection = options.maxUrlsPerSection ?? MAX_URLS_PER_SECTION;

  const lines: string[] = [];

  // 标题与描述（blockquote 是规范要求的站点定位段）
  lines.push(`# ${content.name}`);
  lines.push("");
  lines.push(`> ${content.description}`);
  lines.push("");
  lines.push("");

  const groups = groupIndexByCategory(idx);
  for (const group of groups) {
    const entries = group.entries.slice(0, maxPerSection);
    if (entries.length === 0) continue;

    lines.push(`## ${group.category}`);
    lines.push("");
    for (const e of entries) {
      lines.push(`- [${e.title}](${e.url})：${e.description}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * 生成 llms-full.txt —— 全站全文镜像。
 *
 * 规范定位：llms.txt 是索引（给 AI 快速定位），llms-full.txt 是正文
 * （给 AI 直接消费，省掉逐页抓取）。
 *
 * 大站超过 LLMS_FULL_MAX_CHARS 时截断并注明 —— 超出部分引擎通常也读不完，
 * 与其给一个读不完的大文件，不如给一个能读完的。
 */
export function generateLlmsFullTxt(
  content: SiteContent,
  index?: ContentIndex,
): string {
  const idx = index ?? buildContentIndex(content);
  const lines: string[] = [];

  lines.push(`# ${content.name} — 全文镜像`);
  lines.push("");
  lines.push(`> ${content.description}`);
  lines.push("");
  lines.push("");

  const groups = groupIndexByCategory(idx);
  for (const group of groups) {
    for (const e of group.entries) {
      const section = content.sections.find((s) => s.id === e.sectionId);
      if (!section) continue;

      lines.push(`## ${section.title}`);
      lines.push("");
      if (section.subtitle) {
        lines.push(section.subtitle);
        lines.push("");
      }
      for (const p of section.body ?? []) {
        lines.push(p);
        lines.push("");
      }
      if (section.bullets?.length) {
        for (const b of section.bullets) lines.push(`- ${b}`);
        lines.push("");
      }
      for (const faq of section.faq ?? []) {
        lines.push(`### ${faq.question}`);
        lines.push("");
        lines.push(faq.answer);
        lines.push("");
      }
      lines.push(`来源：${e.url}`);
      lines.push("");
    }
  }

  // 站点级 FAQ
  if (content.faq?.length) {
    lines.push("## 常见问题");
    lines.push("");
    for (const item of content.faq) {
      lines.push(`### ${item.question}`);
      lines.push("");
      lines.push(item.answer);
      lines.push("");
    }
  }

  // 产品详情（参数表是 AI 高频引用结构）
  if (content.products?.length) {
    lines.push("## 产品参数");
    lines.push("");
    for (const p of content.products) {
      lines.push(`### ${p.name}`);
      lines.push("");
      if (p.summary) {
        lines.push(p.summary);
        lines.push("");
      }
      if (p.specs?.length) {
        for (const spec of p.specs) {
          lines.push(`- ${spec.name}: ${spec.value}${spec.unit ? ` ${spec.unit}` : ""}`);
        }
        lines.push("");
      }
      if (p.highlights?.length) {
        for (const h of p.highlights) lines.push(`- ${h}`);
        lines.push("");
      }
    }
  }

  let full = `${lines.join("\n").trimEnd()}\n`;

  if (full.length > LLMS_FULL_MAX_CHARS) {
    full = `${full.slice(0, LLMS_FULL_MAX_CHARS)}\n\n<!-- 内容超出 ${LLMS_FULL_MAX_CHARS} 字符，已截断 -->\n`;
  }

  return full;
}

/**
 * 生成 llms.txt 与 llms-full.txt。
 */
export function generateLlmsArtifacts(
  content: SiteContent,
  options: LlmsTxtOptions = {},
): { llmsTxt: string; llmsFullTxt?: string } {
  const index = buildContentIndex(content);
  const llmsTxt = generateLlmsTxt(content, index, options);
  const llmsFullTxt = options.includeFull ? generateLlmsFullTxt(content, index) : undefined;
  return { llmsTxt, llmsFullTxt };
}

/**
 * 解析已有的 llms.txt —— 体检用（检查区块结构是否完整）。
 *
 * 返回解析结果；格式不符时给出具体问题，而不是抛异常。
 */
export function parseLlmsTxt(
  raw: string,
): {
  title?: string;
  description?: string;
  categories: Array<{ name: string; links: Array<{ title: string; url: string; desc?: string }> }>;
  problems: string[];
} {
  const problems: string[] = [];
  const categories: Array<{
    name: string;
    links: Array<{ title: string; url: string; desc?: string }>;
  }> = [];

  const lines = raw.split("\n");
  let title: string | undefined;
  let description: string | undefined;
  let current: { name: string; links: Array<{ title: string; url: string; desc?: string }> } | null = null;
  let sawBlockquote = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("# ")) {
      if (title === undefined) {
        title = trimmed.slice(2).trim();
      }
      continue;
    }

    if (trimmed.startsWith("> ")) {
      if (!sawBlockquote) {
        description = trimmed.slice(2).trim();
        sawBlockquote = true;
      }
      continue;
    }

    if (trimmed.startsWith("## ")) {
      current = { name: trimmed.slice(3).trim(), links: [] };
      categories.push(current);
      continue;
    }

    const linkMatch = trimmed.match(/^-\s*\[([^\]]*)\]\(([^)]+)\)\s*(?:[：:]\s*(.*))?$/);
    if (linkMatch) {
      if (!current) {
        problems.push(`链接出现在任何分类之前：${trimmed.slice(0, 60)}`);
        continue;
      }
      current.links.push({
        title: linkMatch[1],
        url: linkMatch[2],
        desc: linkMatch[3]?.trim() || undefined,
      });
      continue;
    }

    if (!trimmed.startsWith("#") && !trimmed.startsWith("<!--")) {
      problems.push(`无法识别的行：${trimmed.slice(0, 60)}`);
    }
  }

  if (!title) problems.push("缺少一级标题（# 站点名）");
  if (!description) problems.push("缺少描述段（> 一句话描述）");
  if (categories.length === 0) problems.push("没有任何分类（## 分类名）");

  return { title, description, categories, problems };
}

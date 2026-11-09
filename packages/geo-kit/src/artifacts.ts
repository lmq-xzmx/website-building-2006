/**
 * 构建产物生成 —— 一次性产出 GEO 所需的全部静态文件。
 *
 * 这是建站流水线的核心入口：内容包进，产物出。
 * 产物全是**静态文件**，符合 ADR-000 决策 3（纯静态导出）。
 */

import { buildContentIndex } from "./content-index.js";
import { generateJsonLd, buildSitemap } from "./jsonld.js";
import { generateLlmsFullTxt, generateLlmsTxt } from "./llms-txt.js";
import { generateRobotsTxt, type CrawlerPolicy } from "./crawlers.js";
import type { SiteArtifacts, SiteContent } from "./types.js";

export interface GenerateOptions {
  /** 爬虫策略 */
  policy?: CrawlerPolicy;
  /** 是否生成 llms-full.txt */
  includeLlmsFull?: boolean;
  /** 每分类最大链接数 */
  maxUrlsPerSection?: number;
}

/**
 * 生成全部产物。
 */
export function generateArtifacts(
  content: SiteContent,
  options: GenerateOptions = {},
): SiteArtifacts {
  const index = buildContentIndex(content);

  const jsonLd = generateJsonLd(content);

  const llmsTxt = generateLlmsTxt(content, index, {
    maxUrlsPerSection: options.maxUrlsPerSection,
  });

  const llmsFullTxt = options.includeLlmsFull
    ? generateLlmsFullTxt(content, index)
    : undefined;

  const robotsTxt = generateRobotsTxt(content.url, options.policy);

  const sitemapXml = buildSitemap(content);

  return { jsonLd, llmsTxt, llmsFullTxt, robotsTxt, sitemapXml, index };
}

/**
 * 产物 → 磁盘文件映射。
 *
 * 用于写入 `public/`（静态文件直接可访问）。
 */
export function artifactsToFiles(
  artifacts: SiteArtifacts,
): Record<string, string> {
  const files: Record<string, string> = {
    "robots.txt": artifacts.robotsTxt,
    "llms.txt": artifacts.llmsTxt,
    "sitemap.xml": artifacts.sitemapXml,
  };

  if (artifacts.llmsFullTxt) {
    files["llms-full.txt"] = artifacts.llmsFullTxt;
  }

  return files;
}

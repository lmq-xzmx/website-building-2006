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
import { exportMcpManifest } from "./integrations/mcp.js";
import { exportKnowledgeBase } from "./ai/chat.js";
import type { SiteArtifacts, SiteContent } from "./types.js";

export interface GenerateOptions {
  /** 爬虫策略 */
  policy?: CrawlerPolicy;
  /** 是否生成 llms-full.txt */
  includeLlmsFull?: boolean;
  /** 每分类最大链接数 */
  maxUrlsPerSection?: number;
  /** 是否生成 MCP 静态清单（Phase 3） */
  includeMcp?: boolean;
  /** 是否生成数字分身知识库（Phase 2） */
  includeKnowledgeBase?: boolean;
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
 *
 * Phase 2/3 的额外产物（知识库、MCP 清单）走独立的选项，
 * 因为它们服务于**外部服务**加载，不是给爬虫直接看的。
 */
export function artifactsToFiles(
  artifacts: SiteArtifacts,
  content: SiteContent,
  options: GenerateOptions = {},
): Record<string, string> {
  const files: Record<string, string> = {
    "robots.txt": artifacts.robotsTxt,
    "llms.txt": artifacts.llmsTxt,
    "sitemap.xml": artifacts.sitemapXml,
  };

  if (artifacts.llmsFullTxt) {
    files["llms-full.txt"] = artifacts.llmsFullTxt;
  }

  if (options.includeKnowledgeBase) {
    files["_geo/knowledge-base.json"] = exportKnowledgeBase(content);
  }

  if (options.includeMcp) {
    files["_geo/mcp-manifest.json"] = exportMcpManifest(content);
  }

  return files;
}

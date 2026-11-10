/**
 * geo-kit —— GEO 建站核心库（框架无关）。
 *
 * 导出面刻意收窄：只暴露**跨层共享**的东西。
 * 内部实现细节（如章节路径推导）不外泄，避免模板层依赖实现。
 */

export type {
  // 内容包
  SiteContent,
  OrganizationContent,
  SectionContent,
  SectionType,
  ProductContent,
  ProductSpec,
  CaseContent,
  InsightContent,
  FaqItem,
  NavItem,
  SocialLink,
  ContactContent,
  ContactPoint,
  PostalAddress,
  AssetContent,
  CtaContent,
  SchemaType,
  Platform,
  SiteLocale,
  SiteTheme,
  // 产物
  SiteArtifacts,
  JsonLdScript,
  ContentIndex,
  IndexEntry,
  QuotableSignals,
  Capability,
} from "./types.js";

export {
  buildContentIndex,
  extractQuotableSignals,
  sectionPath,
  sectionCategory,
  absoluteUrl,
  groupIndexByCategory,
} from "./content-index.js";

export {
  generateJsonLd,
  renderJsonLdScript,
  renderJsonLdScripts,
  validateJsonLd,
  expectedSchemaTypes,
  siteRoutes,
  buildSitemap,
} from "./jsonld.js";

export {
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateLlmsArtifacts,
  parseLlmsTxt,
  MAX_URLS_PER_SECTION,
  LLMS_FULL_MAX_CHARS,
  type LlmsTxtOptions,
} from "./llms-txt.js";

export {
  AI_CRAWLERS,
  DEFAULT_CRAWLER_POLICY,
  generateRobotsTxt,
  isCrawlerAllowed,
  crawlersByType,
  type CrawlerSpec,
  type CrawlerType,
  type CrawlerPolicy,
} from "./crawlers.js";

export {
  auditSite,
  scoreAudit,
  diagnose,
  renderReport,
  evaluateCrawlerAllowed,
  isAgentGroupDisallowed,
  parseRobotsGroups,
  DIMENSIONS,
  getGrade,
  type AuditInput,
  type AuditOptions,
  type AuditReport,
  type Dimension,
  type DimensionKey,
  type Check,
  type CheckStatus,
  type RootCause,
  type RootCauseItem,
  type ScoreResult,
  type Recommendation,
} from "./audit/index.js";

export {
  auditSiteLevel,
  findOrphanPages,
  combineResults,
  type SiteAuditInput,
  type SiteAuditResult,
  type SitePageAudit,
} from "./audit/site.js";

export {
  crawlSite,
  parseSitemapUrls,
  extractPageFacts,
  contentSitemap,
  type CrawlOptions,
} from "./audit/crawl.js";

export { generateArtifacts, artifactsToFiles } from "./artifacts.js";
export type { GenerateOptions } from "./artifacts.js";

export {
  generateThemeCss,
  themeHtmlAttrs,
} from "./theme.js";

export {
  INDUSTRY_PACKS,
  getIndustryPack,
  applyIndustryPack,
  terminologyCoverage,
} from "./content-pack.js";
export type { IndustryPack } from "./content-pack.js";

export {
  generateSectionCopy,
  generateCopy,
  applyDrafts,
  parseLlmJson,
  llmConfigFromEnv,
  GEO_WRITING_RULES,
  type LlmConfig,
  type CopyOptions,
  type SectionDraft,
} from "./ai/copywriter.js";

export {
  buildKnowledgeBase,
  retrieve,
  buildChatPrompt,
  answerQuestion,
  exportKnowledgeBase,
  extractKeywords,
  type KnowledgeDoc,
  type RetrievalHit,
  type RetrievalOptions,
} from "./ai/chat.js";

export {
  validateInquiry,
  toCrmLead,
  submitInquiry,
  inquiryHandlerSource,
  type InquiryPayload,
  type CrmConfig,
  type SubmitResult,
} from "./integrations/crm.js";

export {
  buildMcpTools,
  buildServerInfo,
  callReadTool,
  handleMcpRequest,
  exportMcpManifest,
  type McpTool,
  type McpServerInfo,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type ToolCallResult,
} from "./integrations/mcp.js";

export {
  syncKnowledgeBase,
  applyKnowledgeArticles,
  renderKnowledgeModule,
  renderSyncReport,
  structureContent,
  deriveSummary,
  toArticleId,
  DEFAULT_MAPPING,
  type KnowledgeItem,
  type KnowledgeBase,
  type SyncResult,
  type ContentMapping,
} from "./sync/knowledge-sync.js";

export {
  PostgresKnowledgeSource,
  MemoryKnowledgeSource,
  type KnowledgeSource,
  type PostgresSourceOptions,
  type PgLike,
} from "./sync/source.js";

export { runSync, writeKnowledgeModule, type SyncOptions, type SyncOutput } from "./sync/cli.js";

export {
  applyPlan,
  validatePlan,
  planStats,
  emptyPlan,
  PLAN_SLOTS,
  type ContentPlan,
  type PlanEntry,
  type PlanSlot,
  type ApplyPlanResult,
} from "./plan/plan.js";

export {
  materializePlan,
  renderPlanModule,
  mergePlanContent,
  type MaterializedPlan,
} from "./plan/generate.js";

export {
  readPlan,
  writePlan,
  planPath,
  PLAN_FILENAME,
} from "./plan/store.js";

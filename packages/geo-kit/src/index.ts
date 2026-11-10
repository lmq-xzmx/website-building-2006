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
  // 模块化页面（渲染层）
  PageContent,
  ContentModule,
  ContentModuleType,
  ContentItem,
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

// ── UX 体检（人能否转化）────────────────────────────────────

export {
  auditUx,
  auditUxHtml,
  extractUxFacts,
  contrastRatio,
  UX_DIMENSIONS,
  type UxAuditInput,
  type UxAuditOptions,
  type UxAuditResult,
  type UxCheck,
  type UxStatus,
  type UxDimensionKey,
  type UxDimensionResult,
  type UxPageFacts,
  type UxPageResult,
  type UxImageFact,
  type UxLinkFact,
  type UxFormFact,
  type UxStyleFacts,
  type UxNavFacts,
} from "./audit/ux.js";

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
  layoutCss,
  densityCss,
  generateLayoutCss,
  layoutHtmlAttrs,
  LAYOUT_VARIANTS,
  type LayoutVariant,
} from "./layout.js";

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
  WeKnoraKnowledgeSource,
  MemoryKnowledgeSource,
  groupHitsToItems,
  type KnowledgeSource,
  type PostgresSourceOptions,
  type PgLike,
  type WeKnoraSourceOptions,
  type FetchLike,
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

// ── 富文本（ProseMirror JSON）────────────────────────────

export type {
  RichTextDoc,
  RichTextNode,
  RichTextMark,
} from "./rich-text/types.js";

export { emptyDoc, isDocEmpty } from "./rich-text/types.js";

export {
  docToParagraphs,
  docToPlainText,
  countWords,
  readingMinutes,
} from "./rich-text/convert.js";

export { docToHtml, docToMarkdown, escapeHtml } from "./rich-text/render.js";

export {
  docToWechatHtml,
  docToWechatText,
  wechatArticleHtml,
  WECHAT_THEMES,
  WECHAT_THEME_LABEL,
  type WechatTheme,
} from "./rich-text/wechat.js";

// ── 模块编排（页面 → 模块 → 条目）───────────────────────

export type {
  ModulePlan,
  SiteAppearance,
  PageDef,
  PageModule,
  ModuleItem,
  ModuleType,
  ItemSource,
  FormFieldDef,
  FragmentOverrides,
  FragmentItemOverride,
} from "./modules/types.js";

export {
  MODULE_TYPES,
  emptyModulePlan,
  newItemId,
  newModuleId,
  newPageId,
} from "./modules/types.js";

export {
  validateModulePlan,
  validateFragment,
  modulePlanStats,
  normalizePath,
  isValidPath,
  type ValidationProblem,
} from "./modules/validate.js";

export {
  materializeModulePlan,
  materializeModule,
  materializePage,
  materializeItem,
  textToDoc,
  type MaterializedItem,
  type MaterializedModule,
  type MaterializedPage,
} from "./modules/materialize.js";

export {
  readModulePlan,
  writeModulePlan,
  modulesPath,
  MODULES_FILENAME,
} from "./modules/store.js";

export {
  renderModuleModule,
  mergeModuleContent,
  mergeAppearance,
} from "./modules/generate.js";

export {
  readPlan,
  writePlan,
  planPath,
  PLAN_FILENAME,
} from "./plan/store.js";

// ── 媒体库 ──────────────────────────────────────────────

export type {
  MediaAsset,
  MediaLibrary,
} from "./media/types.js";

export {
  emptyMediaLibrary,
  newMediaId,
  safeMediaName,
  validateMediaUpload,
  ALLOWED_MIME,
  ALLOWED_EXT,
  MAX_MEDIA_SIZE,
} from "./media/types.js";

export {
  readMediaLibrary,
  writeMediaLibrary,
  mediaPath,
  mediaDir,
  ensureMediaDir,
  MEDIA_FILENAME,
  MEDIA_DIR,
} from "./media/store.js";

// ── 可复用片段（片段 = 可复用的模块）──────────────────────

export type {
  Fragment,
  FragmentLibrary,
} from "./fragments/types.js";

export {
  emptyFragmentLibrary,
  newFragmentId,
  fragmentItemCount,
} from "./fragments/types.js";

export {
  readFragmentLibrary,
  writeFragmentLibrary,
  fragmentsPath,
  FRAGMENTS_FILENAME,
} from "./fragments/store.js";

export {
  resolveFragmentModule,
  expandFragmentPlan,
  moduleToFragment,
  detachFragmentModule,
  fragmentToModule,
  fragmentUsage,
  type FragmentMap,
} from "./fragments/apply.js";

// ── 版本历史（快照 / 对比 / 回滚）──────────────────────────

export type {
  VersionEntry,
  VersionIndex,
  VersionStats,
} from "./history/types.js";

export {
  emptyVersionIndex,
  DEFAULT_KEEP_VERSIONS,
} from "./history/types.js";

export {
  readVersionIndex,
  writeVersionIndex,
  readVersionPlan,
  snapshotPlan,
  rollbackToVersion,
  planStatsForVersion,
  formatVersionId,
  parseVersionId,
  nextVersionId,
  historyDir,
  historyIndexPath,
  versionPath,
  HISTORY_DIRNAME,
  HISTORY_INDEX_FILENAME,
} from "./history/store.js";

export {
  diffPlans,
  renderPlanDiff,
  type PlanDiff,
  type DiffEntry,
  type DiffKind,
  type DiffScope,
} from "./history/diff.js";

// ── 站内搜索（构建期索引 + 客户端检索）────────────────────

export {
  buildSearchIndex,
  searchIndex,
  splitByTerms,
  type SearchIndex,
  type SearchIndexEntry,
  type SearchOptions,
  type SearchResult,
  type SearchResultSegment,
} from "./search.js";

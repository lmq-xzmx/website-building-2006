/**
 * JSON-LD 生成器 —— GEO 维度 C（结构化数据）。
 *
 * 原则（ADR-000 §2.3 / 01 文档 §2.4）：
 *   **只生成语义无歧义的 Schema**。宁可少生成（体检计入 missing，
 *   覆盖度如实变低），也不能错映射 —— 错了覆盖度反而显示"齐全"，
 *   报告给出一个自信的错分，比低分更害人。
 *
 * 举例：
 *   - 合并值（如小红书「获赞与收藏」）不能塞给单个字段 → 不映射
 *   - 只有篇数没有分母（无法算占比）→ 不映射
 *   - 带 avg_/rate/ratio 的字段在静态站拿不到分母 → 不映射
 */

import {
  absoluteUrl,
  buildContentIndex,
  groupIndexByCategory,
  sectionPath,
} from "./content-index.js";
import type {
  JsonLdScript,
  SiteContent,
} from "./types.js";

/** 生成 JSON-LD 脚本列表。 */
export function generateJsonLd(content: SiteContent): JsonLdScript[] {
  const scripts: JsonLdScript[] = [];

  const organization = buildOrganization(content);
  if (organization) scripts.push({ type: "Organization", data: organization, target: "head" });

  const website = buildWebSite(content);
  if (website) scripts.push({ type: "WebSite", data: website, target: "head" });

  // 各区块的页面级 Schema
  for (const section of content.sections) {
    const pageSchema = buildPageSchema(content, section.id);
    if (pageSchema) scripts.push(pageSchema);
  }

  // FAQPage：区块级 FAQ 与站点级 FAQ 都要覆盖
  const faqSchemas = buildFaqSchemas(content);
  scripts.push(...faqSchemas);

  // 产品：Product Schema
  for (const product of content.products ?? []) {
    scripts.push({
      type: "Product",
      data: buildProduct(content, product),
      target: "body",
    });
  }

  // 洞察文章：BlogPosting
  for (const insight of content.insights ?? []) {
    scripts.push({
      type: "BlogPosting",
      data: buildBlogPosting(content, insight),
      target: "body",
    });
  }

  return scripts;
}

/** Organization Schema —— 企业站的核心身份声明。 */
function buildOrganization(content: SiteContent): Record<string, unknown> | null {
  const org = content.organization;
  if (!org?.name) return null;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org.name,
    url: org.url ?? content.url,
  };

  if (org.legalName) data.legalName = org.legalName;
  if (org.description) data.description = org.description;
  if (org.logo) {
    data.logo = {
      "@type": "ImageObject",
      url: absoluteUrl(content, org.logo),
    };
  }
  if (org.foundingDate) data.foundingDate = org.foundingDate;
  if (org.industry) data.industry = org.industry;
  if (org.numberOfEmployees) {
    data.numberOfEmployees = {
      "@type": "QuantitativeValue",
      value: org.numberOfEmployees,
    };
  }
  // 国内站的可识别性：统一社会信用代码
  if (org.taxID) data.taxID = org.taxID;

  if (org.address) {
    data.address = {
      "@type": "PostalAddress",
      streetAddress: org.address.streetAddress,
      addressLocality: org.address.addressLocality,
      addressRegion: org.address.addressRegion,
      postalCode: org.address.postalCode,
      addressCountry: org.address.addressCountry,
    };
  }

  if (org.contactPoint) {
    data.contactPoint = {
      "@type": "ContactPoint",
      contactType: org.contactPoint.contactType,
      telephone: org.contactPoint.telephone,
      email: org.contactPoint.email,
      availableLanguage: org.contactPoint.availableLanguage,
      areaServed: org.contactPoint.areaServed,
    };
  }

  // sameAs —— 社交账号关联。geo-optimizer 的 schema_sameas 检查项
  if (content.social?.length) {
    data.sameAs = content.social.map((s) => s.url);
  }

  return data;
}

/** WebSite Schema —— 站点级声明。 */
function buildWebSite(content: SiteContent): Record<string, unknown> | null {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: content.name,
    url: content.url,
    inLanguage: content.language ?? content.locale,
  };
  if (content.description) data.description = content.description;
  if (content.assets?.logo) {
    data.logo = absoluteUrl(content, content.assets.logo);
  }
  return data;
}

/** 页型 → WebPage 子类型。 */
function pageTypeFor(sectionType: string): string {
  switch (sectionType) {
    case "about":
      return "AboutPage";
    case "contact":
      return "ContactPage";
    case "products":
    case "cases":
      return "CollectionPage";
    case "insights":
      return "BlogPage";
    default:
      return "WebPage";
  }
}

/** 区块 → 页面级 Schema。 */
function buildPageSchema(
  content: SiteContent,
  sectionId: string,
): JsonLdScript | null {
  const section = content.sections.find((s) => s.id === sectionId);
  if (!section) return null;

  const path = sectionPath(section);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": section.schemaType ?? pageTypeFor(section.type),
    name: section.title,
    url: absoluteUrl(content, path),
    inLanguage: content.language ?? content.locale,
    isPartOf: {
      "@type": "WebSite",
      name: content.name,
      url: content.url,
    },
  };

  if (section.subtitle) data.description = section.subtitle;

  // breadcrumb —— 层级页面的重要结构化信号
  if (path !== "/") {
    data.breadcrumb = {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: content.name,
          item: content.url,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: section.title,
          item: absoluteUrl(content, path),
        },
      ],
    };
  }

  return { type: data["@type"] as string, data, target: "head" };
}

/** FAQPage Schema —— AI 最爱的格式。 */
function buildFaqSchemas(content: SiteContent): JsonLdScript[] {
  const scripts: JsonLdScript[] = [];

  // 站点级 FAQ
  if (content.faq?.length) {
    scripts.push({
      type: "FAQPage",
      data: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: content.faq.map((item) => faqEntity(item.question, item.answer)),
      },
      target: "body",
    });
  }

  // 区块级 FAQ
  for (const section of content.sections) {
    if (!section.faq?.length) continue;
    scripts.push({
      type: "FAQPage",
      data: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        url: absoluteUrl(content, sectionPath(section)),
        mainEntity: section.faq.map((item) => faqEntity(item.question, item.answer)),
      },
      target: "body",
    });
  }

  return scripts;
}

function faqEntity(question: string, answer: string) {
  return {
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: answer,
    },
  };
}

/** Product Schema —— 产品参数是 AI 高频引用的结构化数据。 */
function buildProduct(
  content: SiteContent,
  product: NonNullable<SiteContent["products"]>[number],
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
  };

  if (product.summary) data.description = product.summary;
  if (product.description) data.description = product.description;
  if (product.image) data.image = absoluteUrl(content, product.image);
  if (product.category) data.category = product.category;
  if (product.price) {
    data.offers = {
      "@type": "Offer",
      price: product.price,
      availability: product.availability ?? "https://schema.org/InStock",
    };
  }

  // 参数表 → additionalProperty。geo-optimizer 的 schema_richness 检查项
  if (product.specs?.length) {
    data.additionalProperty = product.specs.map((spec) => ({
      "@type": "PropertyValue",
      name: spec.name,
      value: spec.unit ? `${spec.value} ${spec.unit}` : spec.value,
    }));
  }

  if (product.models?.length) {
    data.model = product.models.join(", ");
  }

  // 制造商关联到 Organization（品牌实体一致性）
  data.brand = {
    "@type": "Brand",
    name: content.organization.name,
  };
  data.manufacturer = {
    "@type": "Organization",
    name: content.organization.name,
    url: content.organization.url ?? content.url,
  };

  return data;
}

/** BlogPosting Schema —— 洞察文章。 */
function buildBlogPosting(
  content: SiteContent,
  insight: NonNullable<SiteContent["insights"]>[number],
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: insight.title,
    url: absoluteUrl(content, `/insights/${insight.id}`),
    inLanguage: content.language ?? content.locale,
    publisher: {
      "@type": "Organization",
      name: content.organization.name,
      url: content.organization.url ?? content.url,
    },
  };

  if (insight.summary) data.description = insight.summary;
  if (insight.date) {
    data.datePublished = insight.date;
    data.dateModified = insight.date;
  }
  if (insight.author) {
    data.author = {
      "@type": "Person",
      name: insight.author,
    };
  }
  if (insight.image) data.image = absoluteUrl(content, insight.image);
  if (insight.tags?.length) data.keywords = insight.tags.join(", ");
  if (insight.readingMinutes) {
    data.timeRequired = `PT${insight.readingMinutes}M`;
  }
  if (insight.body?.length) {
    data.articleBody = insight.body.join("\n\n");
  }

  return data;
}

/**
 * 渲染成 <script> 标签。
 *
 * 注意 `</script>` 转义 —— JSON-LD 字符串里若含 `</script>` 会提前闭合标签，
 * 造成 XSS 与解析失败。这是 JSON-LD 注入的经典坑。
 */
export function renderJsonLdScript(script: JsonLdScript): string {
  const json = JSON.stringify(script.data, null, 2);
  const safe = json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return `<script type="application/ld+json">\n${safe}\n</script>`;
}

/** 渲染全部 JSON-LD 脚本。 */
export function renderJsonLdScripts(scripts: JsonLdScript[]): string {
  return scripts.map(renderJsonLdScript).join("\n");
}

/**
 * 校验 JSON-LD 是否与可见内容一致 —— geo-optimizer 的 schema_visible_match。
 *
 * 这是一个**体检检查项**，不是生成逻辑。生成器无法知道页面渲染后的可见文本，
 * 所以这个检查必须在渲染后对 HTML 做（见 audit 模块）。
 */
export function validateJsonLd(scripts: JsonLdScript[]): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const s of scripts) {
    if (!s.data["@context"]) {
      errors.push(`${s.type} 缺少 @context`);
    }
    if (!s.data["@type"]) {
      errors.push(`${s.type} 缺少 @type`);
    }
    // JSON-LD 不允许相对 URL —— AI 引擎解析时无法解析相对路径
    const walk = (obj: unknown, path: string) => {
      if (typeof obj === "string") {
        if (/^\/(?!\/)/.test(obj) && (path.endsWith("url") || path.endsWith("logo"))) {
          errors.push(`${s.type}.${path} 是相对 URL（${obj}），AI 引擎无法解析`);
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
    walk(s.data, "");
  }

  return { ok: errors.length === 0, errors };
}

/** 供体检使用的：站点应该有哪些 Schema 类型。 */
export function expectedSchemaTypes(content: SiteContent): string[] {
  const types = new Set<string>(["Organization", "WebSite"]);
  for (const s of content.sections) {
    types.add(pageTypeFor(s.type));
  }
  if (content.faq?.length) types.add("FAQPage");
  if (content.sections.some((s) => s.faq?.length)) types.add("FAQPage");
  if (content.products?.length) types.add("Product");
  if (content.insights?.length) types.add("BlogPosting");
  return [...types];
}

/** 站点应有的页面清单（sitemap 用）。 */
export function siteRoutes(content: SiteContent): Array<{ path: string; title: string }> {
  const routes = content.sections.map((s) => ({
    path: sectionPath(s),
    title: s.title,
  }));
  for (const insight of content.insights ?? []) {
    routes.push({
      path: `/insights/${insight.id}`,
      title: insight.title,
    });
  }
  return routes;
}

/** 供 sitemap 生成器使用。 */
export function buildSitemap(content: SiteContent): string {
  const index = buildContentIndex(content);
  const groups = groupIndexByCategory(index);

  const urls: string[] = [];
  for (const g of groups) {
    for (const e of g.entries) {
      urls.push(
        `  <url>\n    <loc>${e.url}</loc>\n    <changefreq>monthly</changefreq>\n  </url>`,
      );
    }
  }
  for (const insight of content.insights ?? []) {
    const url = absoluteUrl(content, `/insights/${insight.id}`);
    urls.push(
      `  <url>\n    <loc>${url}</loc>\n    <changefreq>monthly</changefreq>\n  </url>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

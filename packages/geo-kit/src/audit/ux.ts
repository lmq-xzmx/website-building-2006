/**
 * UX 质量体检 —— 「人能否转化」的那一维。
 *
 * 与 GEO 体检的分工：
 *   GEO 体检（audit/site.ts）管的是「AI 能否引用这个站」——
 *   爬虫准入、结构化数据、内容可引用性、页面可区分性。
 *   本模块管的是「人能否转化」—— 首屏说清价值、导航不迷路、
 *   读得下去、找得到联系方式、看得清点得准。
 *
 * 两者互不替代：一个站可以 GEO 满分却转化极差（长文堆砌、没有主 CTA），
 * 也可以转化很好却引不动（表单做得漂亮，但没有 llms.txt）。
 *
 * ── 为什么状态用 pass/warn/fail/skip ─────────────────────
 * GEO 那套用 partial 表达「有但不达标」，在 UX 里语义含混 ——
 * 「导航有 8 项」到底算 partial 还是 fail？这里显式区分：
 *   pass  达标
 *   warn  有问题但可接受（改了更好）
 *   fail  必须改（直接影响转化）
 *   skip  拿不到数据，不判 —— 缺数据不等于有问题
 * skip 的检查项不计入满分，与 scorer 里 unknown 的处理一致。
 *
 * ── 为什么用 cheerio 而不是正则 ───────────────────────────
 * UX 检查要看「元素在什么容器里」（首屏图在不在 hero 里、
 * 链接是不是主按钮、导航在哪），正则表达不了这种结构关系。
 * cheerio 是纯服务端解析器，不碰浏览器 API —— geo-kit 的框架无关性不受影响。
 */

import { load } from "cheerio";

import { getGrade } from "./scorer.js";

// ── 类型 ─────────────────────────────────────────────────────

/** UX 检查状态 */
export type UxStatus = "pass" | "warn" | "fail" | "skip";

/** UX 维度 —— 与 GEO 的 A–G 是两套正交的轴 */
export type UxDimensionKey =
  | "hero"
  | "ia"
  | "content"
  | "conversion"
  | "performance"
  | "mobile"
  | "a11y";

/**
 * 单个检查项 —— 与 GEO 的 Check 同构（id/名字/权重/得分/状态/说明），
 * 额外带 fix（怎么修）与 dimension（归属的 UX 维度）。
 */
export interface UxCheck {
  id: string;
  name: string;
  dimension: UxDimensionKey;
  weight: number;
  earned: number;
  status: UxStatus;
  /** 这项检查在检查什么（对同一项永远一样） */
  desc: string;
  /** 本次诊断的结果说明 */
  note: string;
  /** 怎么修 —— 体检报告要能直接当整改清单用 */
  fix: string;
}

/** 图片事实 */
export interface UxImageFact {
  src: string;
  /** 有没有 alt 属性 */
  hasAlt: boolean;
  /** alt 内容（空串 = 声明为装饰图） */
  alt?: string;
  width?: number;
  height?: number;
}

/** 链接/按钮事实 */
export interface UxLinkFact {
  href: string;
  text: string;
  /** 主 CTA —— 视觉上是按钮级行动 */
  primary: boolean;
}

/** 表单事实 */
export interface UxFormFact {
  /** 字段总数 */
  total: number;
  /** 必填字段数 */
  required: number;
  /** 字段名 */
  fields: string[];
}

/** 样式事实 —— 能取到多少取多少，取不到就留空（对应 skip） */
export interface UxStyleFacts {
  /** 是否拿到了样式表 —— 拿到却没约束，与拿不到，是两回事 */
  hasStylesheet?: boolean;
  /** 正文字号（px） */
  fontSize?: number;
  /** 行高倍数 */
  lineHeight?: number;
  /** 按钮/链接的最小点击高度（px） */
  minTouchTarget?: number;
  /** 正文颜色 */
  color?: string;
  /** 背景色 */
  background?: string;
  /** 是否用了 @font-face 自托管字体 */
  hasWebFont?: boolean;
  /** 自托管字体是否声明 font-display: swap */
  fontDisplaySwap?: boolean;
}

/** 页面事实 —— 从 HTML 抽取的结果 */
export interface UxPageFacts {
  url: string;
  /** 是否首页 */
  isHome?: boolean;
  /** 浏览器标题 */
  title?: string;
  /** meta description */
  description?: string;
  /** H1 文本 */
  h1s: string[];
  /** 标题层级 */
  headings: Array<{ level: number; text: string }>;
  /** 正文段落 */
  paragraphs: string[];
  /** 图片 */
  images: UxImageFact[];
  /** 链接 */
  links: UxLinkFact[];
  /** 按钮 */
  buttons: UxLinkFact[];
  /** 表单 */
  forms: UxFormFact[];
  /** 是否存在联系方式或联系入口 */
  hasContact: boolean;
  /** 首屏里的图片（LCP 候选） */
  heroImages: UxImageFact[];
  /** 首屏里的主 CTA */
  heroPrimaryCtas: UxLinkFact[];
  /** 首屏轮播张数 —— undefined = 没有轮播 */
  carouselItems?: number;
  /** 顶部导航项 */
  navItems: Array<{ label: string; href: string }>;
  /** 页脚链接数 */
  footerLinkCount: number;
  /** 样式事实 */
  styles?: UxStyleFacts;
}

/** 站级导航事实 —— 可显式给，也可从首页事实推导 */
export interface UxNavFacts {
  /** 导航项 */
  items: Array<{ label: string; href: string }>;
  /** 导航层级 —— 不给则按链接路径段数推算 */
  depth?: number;
}

/** 体检输入 */
export interface UxAuditInput {
  /** 逐页事实 */
  pages: UxPageFacts[];
  /** 站级导航事实（可选） */
  nav?: UxNavFacts;
}

/** 体检阈值 —— 抽出来是为了让阈值可调，也方便测试打边界值 */
export interface UxAuditOptions {
  /** 主标题最大字数 */
  heroTitleMax?: number;
  /** 主标题超过多少字算「过长」 */
  heroTitleWarnMax?: number;
  /** 导航项下限 */
  navMin?: number;
  /** 导航项上限 */
  navMax?: number;
  /** 导航层级上限 */
  navDepthMax?: number;
  /** 段落最大字数 */
  paragraphMax?: number;
  /** 段落「严重超长」字数 */
  paragraphHardMax?: number;
  /** 表单必填字段下限 */
  formRequiredMin?: number;
  /** 表单必填字段上限 */
  formRequiredMax?: number;
  /** 正文字号下限（px） */
  minFontSize?: number;
  /** 行高下限 */
  minLineHeight?: number;
  /** 最小点击尺寸（px） */
  minTouchTarget?: number;
  /** 正文对比度下限 */
  minContrast?: number;
}

const DEFAULT_OPTIONS: Required<UxAuditOptions> = {
  heroTitleMax: 20,
  heroTitleWarnMax: 30,
  navMin: 5,
  navMax: 7,
  navDepthMax: 3,
  paragraphMax: 120,
  paragraphHardMax: 200,
  formRequiredMin: 3,
  formRequiredMax: 5,
  minFontSize: 14,
  minLineHeight: 1.75,
  minTouchTarget: 44,
  minContrast: 4.5,
};

/** UX 维度定义 */
export const UX_DIMENSIONS: Array<{
  key: UxDimensionKey;
  name: string;
  description: string;
  weight: number;
}> = [
  { key: "hero", name: "首屏", description: "价值主张是否一眼看懂，行动是否唯一", weight: 0.16 },
  { key: "ia", name: "信息架构", description: "导航是否短、页面是否可区分", weight: 0.14 },
  { key: "content", name: "内容可扫读", description: "段落是否短、标题层级是否清楚", weight: 0.14 },
  { key: "conversion", name: "转化路径", description: "CTA、联系方式、表单摩擦", weight: 0.18 },
  { key: "performance", name: "性能", description: "布局稳定性、图片格式、字体加载", weight: 0.14 },
  { key: "mobile", name: "移动端", description: "字号、行高、点击区域", weight: 0.1 },
  { key: "a11y", name: "无障碍", description: "图片替代文本、对比度", weight: 0.14 },
];

/** 页面级检查结果 */
export interface UxPageResult {
  url: string;
  checks: UxCheck[];
  /** 本页得分（0–100） */
  score: number;
}

/** 维度得分 */
export interface UxDimensionResult {
  key: UxDimensionKey;
  name: string;
  description: string;
  /** 0–100 */
  score: number;
  weight: number;
  earned: number;
  maxScore: number;
  checks: UxCheck[];
}

/** 体检结果 —— 与 auditSiteLevel 的结果同构 */
export interface UxAuditResult {
  /** 全部检查（站级 + 页面级） */
  checks: UxCheck[];
  /** 站级检查 */
  siteChecks: UxCheck[];
  /** 逐页检查 */
  pageResults: UxPageResult[];
  /** 维度得分 */
  dimensions: UxDimensionResult[];
  /** 总分（0–100） */
  score: number;
  /** 等级 —— 复用 GEO 的评级口径（A/B/C/D/F） */
  grade: string;
}

// ── HTML 事实抽取 ───────────────────────────────────────────

/**
 * 从 HTML 抽出 UX 事实。
 *
 * @param html 页面 HTML
 * @param url 页面 URL —— 用于判断是否首页
 * @param css 额外的样式表内容 —— 静态导出的 CSS 是独立文件，
 *            不传进来就取不到字号/颜色，这几项检查会走 skip。
 */
export function extractUxFacts(html: string, url = "", css = ""): UxPageFacts {
  const $ = load(html);

  const title = $("title").first().text().trim() || undefined;
  const description =
    $('meta[name="description"]').first().attr("content")?.trim() || undefined;

  const h1s: string[] = [];
  $("h1").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t) h1s.push(t);
  });

  const headings: Array<{ level: number; text: string }> = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (!t) return;
    const level = Number(el.tagName.slice(1)) || 1;
    headings.push({ level, text: t });
  });

  const paragraphs: string[] = [];
  $("p").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t) paragraphs.push(t);
  });

  const images: UxImageFact[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    const altAttr = $(el).attr("alt");
    images.push({
      src,
      hasAlt: altAttr !== undefined,
      alt: altAttr,
      width: toNumber($(el).attr("width")),
      height: toNumber($(el).attr("height")),
    });
  });

  const links: UxLinkFact[] = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    links.push({ href, text, primary: isPrimaryCta($(el).attr("class") ?? "") });
  });

  const buttons: UxLinkFact[] = [];
  $("button").each((_, el) => {
    buttons.push({
      href: $(el).attr("formaction") ?? "",
      text: $(el).text().replace(/\s+/g, " ").trim(),
      primary: isPrimaryCta($(el).attr("class") ?? ""),
    });
  });

  const forms: UxFormFact[] = [];
  $("form").each((_, el) => {
    const fields: string[] = [];
    let required = 0;
    $(el)
      .find("input, select, textarea")
      .each((__, field) => {
        const type = ($(field).attr("type") ?? "").toLowerCase();
        if (type === "submit" || type === "button" || type === "reset") return;
        fields.push($(field).attr("name") ?? $(field).attr("id") ?? "未命名字段");
        if ($(field).attr("required") !== undefined) required += 1;
      });
    forms.push({ total: fields.length, required, fields });
  });

  // 联系入口 —— 电话、邮箱，或指向联系页的链接
  const hasContact =
    links.some((l) => /^(mailto:|tel:)/i.test(l.href)) ||
    links.some((l) => /\/contact(\/|$|\?)/i.test(l.href)) ||
    /\b(mailto|tel):/i.test(html);

  // 首屏 —— 优先 .hero，其次第一个 section
  const hero = $(".hero").first();
  const heroScope = hero.length > 0 ? hero : $("section").first();
  const heroImages: UxImageFact[] = [];
  const heroPrimaryCtas: UxLinkFact[] = [];
  heroScope.find("img").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    const altAttr = $(el).attr("alt");
    heroImages.push({
      src,
      hasAlt: altAttr !== undefined,
      alt: altAttr,
      width: toNumber($(el).attr("width")),
      height: toNumber($(el).attr("height")),
    });
  });
  heroScope.find("a, button").each((_, el) => {
    const cls = $(el).attr("class") ?? "";
    if (!isPrimaryCta(cls)) return;
    heroPrimaryCtas.push({
      href: $(el).attr("href") ?? "",
      text: $(el).text().replace(/\s+/g, " ").trim(),
      primary: true,
    });
  });

  // 轮播 —— 找到容器就数张数，找不到就是「没有轮播」
  let carouselItems: number | undefined;
  const carousel = $(
    "[class*='carousel'], [class*='slider'], [class*='swiper']",
  ).first();
  if (carousel.length > 0) {
    const slides = carousel
      .find("[class*='slide'], [class*='item']")
      .filter((_, el) => {
        const cls = ($(el).attr("class") ?? "").split(/\s+/);
        return cls.some((c) => /slide|carousel-item|swiper-slide/i.test(c));
      });
    carouselItems = slides.length > 0 ? slides.length : carousel.children().length;
  }

  const navItems: Array<{ label: string; href: string }> = [];
  $("nav").first().find("a").each((_, el) => {
    navItems.push({
      label: $(el).text().replace(/\s+/g, " ").trim(),
      href: $(el).attr("href") ?? "",
    });
  });

  const footerLinkCount = $("footer").find("a").length;

  const styles = extractStyles($, css);

  return {
    url,
    isHome: isHomeUrl(url),
    title,
    description,
    h1s,
    headings,
    paragraphs,
    images,
    links,
    buttons,
    forms,
    hasContact,
    heroImages,
    heroPrimaryCtas,
    carouselItems,
    navItems,
    footerLinkCount,
    styles,
  };
}

// ── 体检主流程 ───────────────────────────────────────────────

/**
 * UX 体检。
 *
 * 页面级检查（首屏/内容/转化/图片/移动/无障碍）逐页跑，
 * 站级检查（导航项数/导航层级/页面 description/页脚/字体）跑一次。
 */
export function auditUx(input: UxAuditInput, options: UxAuditOptions = {}): UxAuditResult {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const pages = input.pages ?? [];

  const siteChecks: UxCheck[] = [];
  const pageResults: UxPageResult[] = [];

  // ── 站级检查 ─────────────────────────────────────────────
  const nav = input.nav ?? { items: deriveNav(pages) };
  const navCount = nav.items.length;

  siteChecks.push(
    makeCheck({
      id: "ux-nav-count",
      name: "导航项数适中",
      dimension: "ia",
      weight: 3,
      status:
        navCount === 0
          ? "skip"
          : navCount > opt.navMax
            ? "fail"
            : navCount < opt.navMin
              ? "warn"
              : "pass",
      desc: `顶部导航保持 ${opt.navMin}–${opt.navMax} 项 —— 太多是选择过载，太少是信息没露出`,
      note:
        navCount === 0
          ? "未找到导航项"
          : `当前 ${navCount} 项${navCount > opt.navMax ? "（超出上限）" : navCount < opt.navMin ? "（少于下限）" : ""}`,
      fix: `把导航收敛到 ${opt.navMin}–${opt.navMax} 项：合并同类栏目，次要入口挪到页脚或页面内。`,
      ratio: navCount > opt.navMax ? 0 : navCount < opt.navMin ? 0.5 : 1,
    }),
  );

  const navDepth = nav.depth ?? deriveNavDepth(nav.items);
  siteChecks.push(
    makeCheck({
      id: "ux-nav-depth",
      name: "导航层级不深",
      dimension: "ia",
      weight: 2,
      status: navDepth === 0 ? "skip" : navDepth <= opt.navDepthMax ? "pass" : navDepth === opt.navDepthMax + 1 ? "warn" : "fail",
      desc: `导航层级 ≤${opt.navDepthMax} 级 —— 从首页到目标页不该超过三次点击`,
      note: navDepth === 0 ? "无法推算导航层级" : `最深 ${navDepth} 级`,
      fix: "把深层栏目提到一级导航或用「相关链接」互链，别让用户靠记忆猜路径。",
      ratio: navDepth <= opt.navDepthMax ? 1 : navDepth === opt.navDepthMax + 1 ? 0.5 : 0,
    }),
  );

  // 页面 description —— 站级聚合（跟 auditSiteLevel 的 S3 同思路）
  const descValues = pages.map((p) => p.description?.trim()).filter((d): d is string => Boolean(d));
  const missingDesc = pages.filter((p) => !p.description?.trim()).length;
  const descGroups = groupBy(descValues);
  const dupDescs = Object.entries(descGroups).filter(([, v]) => v > 1);
  let descStatus: UxStatus = "pass";
  let descNote = `${pages.length} 个页面都有各自独立的 description`;
  if (pages.length === 0) {
    descStatus = "skip";
    descNote = "没有页面可评估";
  } else if (missingDesc > 0) {
    descStatus = "fail";
    descNote = `${missingDesc} 个页面缺 description`;
  } else if (dupDescs.length > 0) {
    // 全部页面共用同一份 = 模板没改；只有部分页面撞了 = 复制粘贴漏改
    const allShared = dupDescs.some(([, v]) => v === pages.length);
    descStatus = allShared || dupDescs.length > 1 ? "fail" : "warn";
    descNote = `${dupDescs.length} 组页面共用同一份 description：${dupDescs
      .map(([v]) => `「${v.slice(0, 20)}」`)
      .join("、")}`;
  }
  siteChecks.push(
    makeCheck({
      id: "ux-page-description",
      name: "页面描述各自独立",
      dimension: "ia",
      weight: 3,
      status: descStatus,
      desc: "每个已发布页面有自己的一份 description —— 共用会让 AI 与用户都分不清页面",
      note: descNote,
      fix: "为每个页面写一句只讲这一页的描述，含页面独有的实体（产品名/行业/地域）。",
      ratio: descStatus === "pass" ? 1 : descStatus === "warn" ? 0.5 : 0,
    }),
  );

  // 页脚当迷你站点地图
  const footerLinks = pages.reduce((max, p) => Math.max(max, p.footerLinkCount), 0);
  siteChecks.push(
    makeCheck({
      id: "ux-footer-sitemap",
      name: "页脚是迷你站点地图",
      dimension: "ia",
      weight: 1,
      status: footerLinks === 0 ? "fail" : footerLinks < 3 ? "warn" : "pass",
      desc: "页脚列出主要栏目 —— 用户找不到入口时会先翻页脚",
      note: `页脚链接 ${footerLinks} 条`,
      fix: "在页脚复列主要栏目与联系方式，让页脚承担「找不到就翻这里」的兜底。",
      ratio: footerLinks >= 3 ? 1 : footerLinks > 0 ? 0.5 : 0,
    }),
  );

  // 字体加载策略
  const homeStyles = pages.find((p) => p.isHome)?.styles ?? pages[0]?.styles;
  const fontStatus: UxStatus = !homeStyles?.hasWebFont
    ? "skip"
    : homeStyles.fontDisplaySwap
      ? "pass"
      : "fail";
  siteChecks.push(
    makeCheck({
      id: "ux-font-display",
      name: "字体使用 font-display: swap",
      dimension: "performance",
      weight: 1,
      status: fontStatus,
      desc: "自托管字体声明 font-display: swap —— 否则文字会被字体下载卡住",
      note: !homeStyles?.hasWebFont
        ? "未使用 @font-face 自托管字体"
        : homeStyles.fontDisplaySwap
          ? "已声明 font-display: swap"
          : "未声明 font-display: swap",
      fix: "给 @font-face 加上 font-display: swap，避免字体加载期间文字不可见。",
      ratio: fontStatus === "pass" ? 1 : 0,
    }),
  );

  // ── 页面级检查 ───────────────────────────────────────────
  for (const page of pages) {
    const checks: UxCheck[] = [
      checkHeroClaim(page, opt),
      checkHeroSingleCta(page, opt),
      checkHeroImageLcp(page, opt),
      checkHeroCarousel(page, opt),
      checkParagraphLength(page, opt),
      checkHeadingHierarchy(page, opt),
      checkCtaPresence(page, opt),
      checkContactReachable(page, opt),
      checkFormFields(page, opt),
      checkImageDimensions(page, opt),
      checkImageFormat(page, opt),
      checkTouchTarget(page, opt),
      checkFontSize(page, opt),
      checkLineHeight(page, opt),
      checkAltCoverage(page, opt),
      checkContrast(page, opt),
    ];
    pageResults.push({
      url: page.url,
      checks,
      score: scoreChecks(checks),
    });
  }

  // ── 汇总 ─────────────────────────────────────────────────
  const allChecks = [...siteChecks, ...pageResults.flatMap((p) => p.checks)];
  const dimensions = UX_DIMENSIONS.map((d) => buildDimension(d, siteChecks, pageResults));

  const activeDims = dimensions.filter((d) => d.maxScore > 0);
  const weightSum = activeDims.reduce((s, d) => s + d.weight, 0);
  const score =
    weightSum > 0
      ? Math.round(
          (activeDims.reduce((s, d) => s + (d.score / 100) * d.weight, 0) / weightSum) * 100,
        )
      : 0;

  return {
    checks: allChecks,
    siteChecks,
    pageResults,
    dimensions,
    score,
    grade: getGrade(score),
  };
}

/**
 * 直接用 HTML 做体检 —— 抽出事实再跑检查。
 *
 * 便利函数：外部只需要给出每页的 HTML，不用自己拼事实对象。
 */
export function auditUxHtml(
  pages: Array<{ url: string; html: string; css?: string }>,
  options: UxAuditOptions = {},
): UxAuditResult {
  return auditUx(
    { pages: pages.map((p) => extractUxFacts(p.html, p.url, p.css ?? "")) },
    options,
  );
}

// ── 各项检查 ─────────────────────────────────────────────────

function checkHeroClaim(page: UxPageFacts, opt: Required<UxAuditOptions>): UxCheck {
  if (!page.isHome) {
    return makeCheck({
      id: "ux-hero-claim",
      name: "主标题一句话讲清价值",
      dimension: "hero",
      weight: 3,
      status: "skip",
      desc: "首页主标题 ≤20 字且不含空话词",
      note: "非首页，跳过",
      fix: "",
      ratio: 1,
    });
  }

  const title = page.h1s[0] ?? page.title ?? "";
  const trimmed = title.replace(/\s+/g, "");

  if (!trimmed) {
    return makeCheck({
      id: "ux-hero-claim",
      name: "主标题一句话讲清价值",
      dimension: "hero",
      weight: 3,
      status: "fail",
      desc: "首页主标题 ≤20 字且不含空话词",
      note: "首页没有 H1",
      fix: "补一个 H1，用一句话说清你替客户解决了什么问题。",
      ratio: 0,
    });
  }

  const emptyPhrase = matchEmptyPhrase(trimmed);
  const len = trimmed.length;

  let status: UxStatus;
  let note: string;
  let ratio: number;
  if (emptyPhrase) {
    status = "fail";
    ratio = 0;
    note = `主标题「${title}」含空话词「${emptyPhrase}」`;
  } else if (len <= opt.heroTitleMax) {
    status = "pass";
    ratio = 1;
    note = `主标题 ${len} 字：「${title}」`;
  } else if (len <= opt.heroTitleWarnMax) {
    status = "warn";
    ratio = 0.5;
    note = `主标题 ${len} 字，超过 ${opt.heroTitleMax} 字上限：「${title}」`;
  } else {
    status = "fail";
    ratio = 0;
    note = `主标题 ${len} 字，严重超长：「${title}」`;
  }

  return makeCheck({
    id: "ux-hero-claim",
    name: "主标题一句话讲清价值",
    dimension: "hero",
    weight: 3,
    status,
    desc: "首页主标题 ≤20 字且不含「欢迎访问」这类空话词",
    note,
    fix: "把主标题改成一句业务结果（≤20 字），例如「让工厂数据 5 分钟上线」；删掉「欢迎访问 XX 公司官网」。",
    ratio,
  });
}

function checkHeroSingleCta(page: UxPageFacts, _opt: Required<UxAuditOptions>): UxCheck {
  const primary = page.heroPrimaryCtas.length > 0
    ? page.heroPrimaryCtas
    : page.links.filter((l) => l.primary).concat(page.buttons.filter((b) => b.primary));
  const count = primary.length;

  const status: UxStatus = count === 0 ? "warn" : count === 1 ? "pass" : count === 2 ? "warn" : "fail";
  const ratio = count === 0 ? 0.5 : count === 1 ? 1 : count === 2 ? 0.5 : 0;

  return makeCheck({
    id: "ux-hero-single-cta",
    name: "首屏只有一个主 CTA",
    dimension: "hero",
    weight: 3,
    status,
    desc: "首屏主 CTA ≤1 个 —— 并排多个按钮等于让用户自己选",
    note:
      count === 0
        ? "首屏没有主 CTA"
        : `首屏 ${count} 个主 CTA${count > 1 ? `：${primary.map((c) => c.text).slice(0, 3).join("、")}` : ""}`,
    fix: "首屏只留一个主按钮（主色实心），次要入口降级成文字链接并挪到下方。",
    ratio,
  });
}

function checkHeroImageLcp(page: UxPageFacts, _opt: Required<UxAuditOptions>): UxCheck {
  const images = page.heroImages;
  if (images.length === 0) {
    return makeCheck({
      id: "ux-hero-image-lcp",
      name: "首屏图片尺寸明确",
      dimension: "performance",
      weight: 2,
      status: "skip",
      desc: "首屏图片带 width/height —— LCP 元素不能靠加载后才知道多大",
      note: "首屏没有图片（LCP 由文本承担）",
      fix: "",
      ratio: 1,
    });
  }
  const sized = images.filter((i) => i.width !== undefined && i.height !== undefined);
  const status: UxStatus = sized.length === images.length ? "pass" : sized.length === 0 ? "fail" : "warn";
  return makeCheck({
    id: "ux-hero-image-lcp",
    name: "首屏图片尺寸明确",
    dimension: "performance",
    weight: 2,
    status,
    desc: "首屏图片带 width/height —— LCP 元素不能靠加载后才知道多大",
    note: `首屏 ${images.length} 张图片，其中 ${sized.length} 张写明了尺寸`,
    fix: "给首屏图片补 width/height 属性并与实际比例一致，浏览器才能提前占位。",
    ratio: status === "pass" ? 1 : status === "warn" ? 0.5 : 0,
  });
}

function checkHeroCarousel(page: UxPageFacts, _opt: Required<UxAuditOptions>): UxCheck {
  const count = page.carouselItems;
  if (count === undefined) {
    return makeCheck({
      id: "ux-hero-carousel",
      name: "首屏无无效轮播",
      dimension: "hero",
      weight: 1,
      status: "skip",
      desc: "轮播最多两张，且每张要有明确行动指向",
      note: "没有轮播",
      fix: "",
      ratio: 1,
    });
  }
  const status: UxStatus = count <= 2 ? "pass" : count === 3 ? "warn" : "fail";
  return makeCheck({
    id: "ux-hero-carousel",
    name: "首屏无无效轮播",
    dimension: "hero",
    weight: 1,
    status,
    desc: "轮播最多两张，且每张要有明确行动指向",
    note: `轮播 ${count} 张`,
    fix: "砍到两张以内；每张配一句行动指向，否则用户只会看到第一张。",
    ratio: status === "pass" ? 1 : status === "warn" ? 0.5 : 0,
  });
}

function checkParagraphLength(page: UxPageFacts, opt: Required<UxAuditOptions>): UxCheck {
  const long = page.paragraphs.filter((p) => p.replace(/\s+/g, "").length > opt.paragraphMax);
  const hard = long.filter((p) => p.replace(/\s+/g, "").length > opt.paragraphHardMax);
  const status: UxStatus = long.length === 0 ? "pass" : hard.length > 0 ? "fail" : "warn";
  const longest = page.paragraphs.reduce(
    (max, p) => Math.max(max, p.replace(/\s+/g, "").length),
    0,
  );

  return makeCheck({
    id: "ux-paragraph-length",
    name: "段落短到能扫读",
    dimension: "content",
    weight: 3,
    status,
    desc: `正文段落控制在 ${opt.paragraphMax} 字以内（约 3–4 行）`,
    note:
      long.length === 0
        ? `${page.paragraphs.length} 段正文，最长 ${longest} 字`
        : `${long.length} 段超过 ${opt.paragraphMax} 字（最长 ${longest} 字）`,
    fix: "把长段落按「一段一个重点」拆开；每段只讲一件事，读者扫标题就能拿住要点。",
    ratio: status === "pass" ? 1 : status === "warn" ? 0.5 : 0,
  });
}

function checkHeadingHierarchy(page: UxPageFacts, _opt: Required<UxAuditOptions>): UxCheck {
  const count = page.h1s.length;
  const status: UxStatus = count === 1 ? "pass" : "fail";
  return makeCheck({
    id: "ux-heading-hierarchy",
    name: "每页一个 H1",
    dimension: "content",
    weight: 3,
    status,
    desc: "每页有且只有一个 H1 —— 标题层级是读者唯一的路标",
    note: count === 0 ? "页面没有 H1" : `页面有 ${count} 个 H1`,
    fix: "保留一个 H1 放页面主标题，其余同级内容用 H2/H3，别把 H1 当样式用。",
    ratio: status === "pass" ? 1 : 0,
  });
}

function checkCtaPresence(page: UxPageFacts, _opt: Required<UxAuditOptions>): UxCheck {
  const ctas = [...page.links, ...page.buttons].filter(
    (l) => l.primary || isCtaText(l.text),
  );
  const hasForm = page.forms.length > 0;
  const status: UxStatus = ctas.length > 0 || hasForm ? "pass" : "fail";

  return makeCheck({
    id: "ux-cta-presence",
    name: "页面有行动号召",
    dimension: "conversion",
    weight: 3,
    status,
    desc: "每个页面都要给出下一步 —— 用户读完不知道该干什么就走了",
    note:
      status === "pass"
        ? `找到 ${ctas.length} 个 CTA${hasForm ? "（并有表单）" : ""}`
        : "页面没有任何行动号召",
    fix: "在每个关键板块末尾给一个下一步（咨询/报价/预约），别让读者自己找入口。",
    ratio: status === "pass" ? 1 : 0,
  });
}

function checkContactReachable(page: UxPageFacts, _opt: Required<UxAuditOptions>): UxCheck {
  return makeCheck({
    id: "ux-contact-reachable",
    name: "联系入口可达",
    dimension: "conversion",
    weight: 2,
    status: page.hasContact ? "pass" : "fail",
    desc: "页面能到达联系方式 —— 电话、邮箱或联系页链接至少有一个",
    note: page.hasContact ? "已找到联系方式或联系入口" : "没有找到任何联系方式或联系入口",
    fix: "在页头或页脚常驻一个联系入口（电话/微信/邮箱），别让用户翻到底才找到。",
    ratio: page.hasContact ? 1 : 0,
  });
}

function checkFormFields(page: UxPageFacts, opt: Required<UxAuditOptions>): UxCheck {
  if (page.forms.length === 0) {
    return makeCheck({
      id: "ux-form-fields",
      name: "表单必填项够少",
      dimension: "conversion",
      weight: 2,
      status: "skip",
      desc: `表单必填字段控制在 ${opt.formRequiredMin}–${opt.formRequiredMax} 项`,
      note: "页面没有表单",
      fix: "",
      ratio: 1,
    });
  }
  const worst = page.forms.reduce((acc, f) => (f.required > acc.required ? f : acc), page.forms[0]);
  const status: UxStatus =
    worst.required > opt.formRequiredMax
      ? "fail"
      : worst.required < opt.formRequiredMin
        ? "warn"
        : "pass";

  return makeCheck({
    id: "ux-form-fields",
    name: "表单必填项够少",
    dimension: "conversion",
    weight: 2,
    status,
    desc: `表单必填字段控制在 ${opt.formRequiredMin}–${opt.formRequiredMax} 项 —— 每多一个必填就多一道流失`,
    note: `表单 ${worst.total} 个字段，其中 ${worst.required} 个必填`,
    fix: "把非关键信息改成选填，只保留姓名/联系方式/需求这类必填项。",
    ratio: status === "pass" ? 1 : status === "warn" ? 0.5 : 0,
  });
}

function checkImageDimensions(page: UxPageFacts, _opt: Required<UxAuditOptions>): UxCheck {
  if (page.images.length === 0) {
    return makeCheck({
      id: "ux-image-dimensions",
      name: "图片预留固定尺寸",
      dimension: "performance",
      weight: 3,
      status: "skip",
      desc: "图片带 width/height —— 否则图片加载完会把下面的内容顶下去（CLS）",
      note: "页面没有图片",
      fix: "",
      ratio: 1,
    });
  }
  const sized = page.images.filter((i) => i.width !== undefined && i.height !== undefined);
  const status: UxStatus =
    sized.length === page.images.length ? "pass" : sized.length === 0 ? "fail" : "warn";
  return makeCheck({
    id: "ux-image-dimensions",
    name: "图片预留固定尺寸",
    dimension: "performance",
    weight: 3,
    status,
    desc: "图片带 width/height —— 否则图片加载完会把下面的内容顶下去（CLS）",
    note: `${page.images.length} 张图片，${sized.length} 张写明了尺寸`,
    fix: "给所有图片与广告位写死 width/height，比例与实际一致。",
    ratio: status === "pass" ? 1 : status === "warn" ? 0.5 : 0,
  });
}

function checkImageFormat(page: UxPageFacts, _opt: Required<UxAuditOptions>): UxCheck {
  if (page.images.length === 0) {
    return makeCheck({
      id: "ux-image-format",
      name: "图片用 WebP/AVIF",
      dimension: "performance",
      weight: 2,
      status: "skip",
      desc: "内容图片用 WebP/AVIF —— 体积小一半，首屏才快得起来",
      note: "页面没有图片",
      fix: "",
      ratio: 1,
    });
  }
  const legacy = page.images.filter((i) => /\.(jpe?g|png)(\?|#|$)/i.test(i.src));
  // 只提示不判死 —— 老图不换也不至于让页面不能看，
  // 但换成 WebP/AVIF 是最省力的提速手段，所以值得提醒。
  const status: UxStatus = legacy.length === 0 ? "pass" : "warn";
  return makeCheck({
    id: "ux-image-format",
    name: "图片用 WebP/AVIF",
    dimension: "performance",
    weight: 2,
    status,
    desc: "内容图片用 WebP/AVIF —— 体积小一半，首屏才快得起来",
    note:
      legacy.length === 0
        ? `${page.images.length} 张图片均为现代格式`
        : `${legacy.length} 张仍是 JPG/PNG：${legacy.map((i) => i.src).slice(0, 3).join("、")}`,
    fix: "导出 WebP/AVIF 替代 JPG/PNG，并把老图换成 <picture> 渐进加载。",
    ratio: status === "pass" ? 1 : status === "warn" ? 0.5 : 0,
  });
}

function checkTouchTarget(page: UxPageFacts, opt: Required<UxAuditOptions>): UxCheck {
  const size = page.styles?.minTouchTarget;
  if (size === undefined) {
    // 样式表拿到了却没写 min-height —— 这是**缺陷**，不是「拿不到数据」
    const hasCss = page.styles?.hasStylesheet === true;
    return makeCheck({
      id: "ux-touch-target",
      name: "按钮点击区域够大",
      dimension: "mobile",
      weight: 2,
      status: hasCss ? "warn" : "skip",
      desc: `按钮/链接的 min-height ≥${opt.minTouchTarget}px —— 手指点不准等于没有`,
      note: hasCss ? "样式里没有给按钮/链接设置最小高度" : "未取到按钮尺寸约束（样式表未随页面提供）",
      fix: hasCss
        ? `给按钮与导航链接加 min-height: ${opt.minTouchTarget}px（移动端建议 48px），别只靠 padding 凑视觉。`
        : "",
      ratio: hasCss ? 0.5 : 1,
    });
  }
  const status: UxStatus = size >= opt.minTouchTarget ? "pass" : "fail";
  return makeCheck({
    id: "ux-touch-target",
    name: "按钮点击区域够大",
    dimension: "mobile",
    weight: 2,
    status,
    desc: `按钮/链接的 min-height ≥${opt.minTouchTarget}px —— 手指点不准等于没有`,
    note: `按钮/链接最小高度 ${size}px`,
    fix: `给按钮与导航链接加 min-height: ${opt.minTouchTarget}px（移动端建议 48px），别只靠 padding 凑视觉。`,
    ratio: status === "pass" ? 1 : 0,
  });
}

function checkFontSize(page: UxPageFacts, opt: Required<UxAuditOptions>): UxCheck {
  const size = page.styles?.fontSize;
  if (size === undefined) {
    return makeCheck({
      id: "ux-font-size",
      name: "正文字号达标",
      dimension: "mobile",
      weight: 2,
      status: "skip",
      desc: `正文字号 ≥${opt.minFontSize}px —— 手机上 12px 根本读不动`,
      note: "未取到正文字号（样式表未随页面提供）",
      fix: "",
      ratio: 1,
    });
  }
  const status: UxStatus = size >= opt.minFontSize ? "pass" : "fail";
  return makeCheck({
    id: "ux-font-size",
    name: "正文字号达标",
    dimension: "mobile",
    weight: 2,
    status,
    desc: `正文字号 ≥${opt.minFontSize}px —— 手机上 12px 根本读不动`,
    note: `正文字号 ${size}px`,
    fix: `把正文提到 ${opt.minFontSize}px 以上（中文正文建议 16px），别为了塞更多字压字号。`,
    ratio: status === "pass" ? 1 : 0,
  });
}

function checkLineHeight(page: UxPageFacts, opt: Required<UxAuditOptions>): UxCheck {
  const lh = page.styles?.lineHeight;
  if (lh === undefined) {
    return makeCheck({
      id: "ux-line-height",
      name: "行高够松",
      dimension: "mobile",
      weight: 1,
      status: "skip",
      desc: `正文行高 ≥${opt.minLineHeight} 倍 —— 行距不够，长段落读起来是堵的`,
      note: "未取到行高（样式表未随页面提供）",
      fix: "",
      ratio: 1,
    });
  }
  const status: UxStatus = lh >= opt.minLineHeight ? "pass" : "fail";
  return makeCheck({
    id: "ux-line-height",
    name: "行高够松",
    dimension: "mobile",
    weight: 1,
    status,
    desc: `正文行高 ≥${opt.minLineHeight} 倍 —— 行距不够，长段落读起来是堵的`,
    note: `正文行高 ${lh} 倍`,
    fix: `把正文行高提到 ${opt.minLineHeight} 倍以上（约字号的 1.75 倍）。`,
    ratio: status === "pass" ? 1 : 0,
  });
}

function checkAltCoverage(page: UxPageFacts, _opt: Required<UxAuditOptions>): UxCheck {
  if (page.images.length === 0) {
    return makeCheck({
      id: "ux-alt-coverage",
      name: "图片有替代文本",
      dimension: "a11y",
      weight: 3,
      status: "skip",
      desc: "所有图片都要有 alt —— 屏幕阅读器与 AI 都靠它理解图",
      note: "页面没有图片",
      fix: "",
      ratio: 1,
    });
  }
  const missing = page.images.filter((i) => !i.hasAlt || !i.alt?.trim());
  const status: UxStatus =
    missing.length === 0 ? "pass" : missing.length === page.images.length ? "fail" : "warn";
  return makeCheck({
    id: "ux-alt-coverage",
    name: "图片有替代文本",
    dimension: "a11y",
    weight: 3,
    status,
    desc: "所有图片都要有 alt —— 屏幕阅读器与 AI 都靠它理解图",
    note:
      missing.length === 0
        ? `${page.images.length} 张图片都有 alt`
        : `${missing.length}/${page.images.length} 张图片缺 alt 或 alt 为空`,
    fix: "给内容图片写描述性 alt（说清图里是什么）；确实是装饰图就显式写 alt=\"\"。",
    ratio: status === "pass" ? 1 : status === "warn" ? 0.5 : 0,
  });
}

function checkContrast(page: UxPageFacts, opt: Required<UxAuditOptions>): UxCheck {
  const color = page.styles?.color;
  const bg = page.styles?.background;
  if (!color || !bg) {
    return makeCheck({
      id: "ux-contrast",
      name: "正文对比度达标",
      dimension: "a11y",
      weight: 3,
      status: "skip",
      desc: `正文与背景对比度 ≥${opt.minContrast}:1`,
      note: "未取到正文与背景颜色（样式表未随页面提供）",
      fix: "",
      ratio: 1,
    });
  }
  const ratio = contrastRatio(color, bg);
  if (ratio === undefined) {
    return makeCheck({
      id: "ux-contrast",
      name: "正文对比度达标",
      dimension: "a11y",
      weight: 3,
      status: "skip",
      desc: `正文与背景对比度 ≥${opt.minContrast}:1`,
      note: `颜色无法解析：${color} / ${bg}`,
      fix: "",
      ratio: 1,
    });
  }
  const status: UxStatus = ratio >= opt.minContrast ? "pass" : ratio >= 3 ? "warn" : "fail";
  return makeCheck({
    id: "ux-contrast",
    name: "正文对比度达标",
    dimension: "a11y",
    weight: 3,
    status,
    desc: `正文与背景对比度 ≥${opt.minContrast}:1`,
    note: `对比度 ${ratio.toFixed(2)}:1（正文 ${color} / 背景 ${bg}）`,
    fix: "加深正文色或调浅背景色，把对比度提到 4.5:1 以上。",
    ratio: status === "pass" ? 1 : status === "warn" ? 0.5 : 0,
  });
}

// ── 打分与维度汇总 ───────────────────────────────────────────

interface CheckSpec {
  id: string;
  name: string;
  dimension: UxDimensionKey;
  weight: number;
  status: UxStatus;
  desc: string;
  note: string;
  fix: string;
  /** 得分比例（0–1） */
  ratio: number;
}

function makeCheck(spec: CheckSpec): UxCheck {
  // skip 的检查项不计入满分 —— 拿不到数据不该被当成缺陷
  const counted = spec.status !== "skip";
  return {
    id: spec.id,
    name: spec.name,
    dimension: spec.dimension,
    weight: spec.weight,
    earned: counted ? spec.weight * spec.ratio : 0,
    status: spec.status,
    desc: spec.desc,
    note: spec.note,
    fix: spec.fix,
  };
}

function scoreChecks(checks: UxCheck[]): number {
  const counted = checks.filter((c) => c.status !== "skip");
  const weight = counted.reduce((s, c) => s + c.weight, 0);
  if (weight === 0) return 0;
  const earned = counted.reduce((s, c) => s + c.earned, 0);
  return Math.round((earned / weight) * 100);
}

function buildDimension(
  d: { key: UxDimensionKey; name: string; description: string; weight: number },
  siteChecks: UxCheck[],
  pageResults: UxPageResult[],
): UxDimensionResult {
  const siteDim = siteChecks.filter((c) => c.dimension === d.key);
  const siteCounted = siteDim.filter((c) => c.status !== "skip");
  const siteWeight = siteCounted.reduce((s, c) => s + c.weight, 0);
  const siteEarned = siteCounted.reduce((s, c) => s + c.earned, 0);

  // 页面级：先算每页在该维度的得分，再对页面取平均 ——
  // 直接把全部页面的检查摊平会让「页数多的维度」权重虚高
  const pageRatios: number[] = [];
  const pageWeights: number[] = [];
  for (const p of pageResults) {
    const dim = p.checks.filter((c) => c.dimension === d.key && c.status !== "skip");
    const w = dim.reduce((s, c) => s + c.weight, 0);
    if (w === 0) continue;
    const e = dim.reduce((s, c) => s + c.earned, 0);
    pageRatios.push(e / w);
    pageWeights.push(w);
  }
  const avgPageRatio =
    pageRatios.length > 0 ? pageRatios.reduce((s, r) => s + r, 0) / pageRatios.length : 0;
  const avgPageWeight =
    pageWeights.length > 0 ? pageWeights.reduce((s, w) => s + w, 0) / pageWeights.length : 0;

  const maxScore = siteWeight + avgPageWeight;
  const earned = siteEarned + avgPageRatio * avgPageWeight;
  const score = maxScore > 0 ? Math.round((earned / maxScore) * 100) : 0;

  return {
    key: d.key,
    name: d.name,
    description: d.description,
    score,
    weight: d.weight,
    earned,
    maxScore,
    checks: [...siteDim, ...pageResults.flatMap((p) => p.checks.filter((c) => c.dimension === d.key))],
  };
}

// ── 小工具 ───────────────────────────────────────────────────

/** 空话词 —— 出现在主标题里说明没在说业务 */
const EMPTY_PHRASES = [
  "欢迎访问",
  "欢迎来到",
  "欢迎光临",
  "欢迎使用",
  "官方网站",
  "官网首页",
  "欢迎咨询",
];

/** 匹配空话词 */
function matchEmptyPhrase(title: string): string | undefined {
  return EMPTY_PHRASES.find((p) => title.includes(p));
}

/** 主 CTA 的判定 —— 视觉上是主按钮 */
function isPrimaryCta(className: string): boolean {
  const tokens = className.split(/\s+/);
  return tokens.some((t) => /(^|-)primary$/.test(t) || /btn-primary|cta-primary|button-primary/.test(t));
}

/** CTA 文案关键词 —— 没有按钮类名时的兜底 */
function isCtaText(text: string): boolean {
  return /咨询|报价|联系|预约|试用|申请|获取|下载|提交|免费|开始|了解更多|联系我们/.test(text);
}

/** 是否首页 */
function isHomeUrl(url: string): boolean {
  if (!url) return false;
  try {
    const p = new URL(url).pathname;
    return p === "/" || p === "";
  } catch {
    return url === "/" || url === "";
  }
}

/** 从页面事实里推导导航（取第一个有导航的页面） */
function deriveNav(pages: UxPageFacts[]): Array<{ label: string; href: string }> {
  return pages.find((p) => p.navItems.length > 0)?.navItems ?? [];
}

/**
 * 推算导航层级 —— 按链接路径段数。
 *
 * 为什么用路径段数而不是 DOM 嵌套：导航层级是「信息架构的深度」，
 * 路径 /产品/网关/驱动 就是三层，与 DOM 怎么嵌套无关。
 */
function deriveNavDepth(items: Array<{ label: string; href: string }>): number {
  let depth = 0;
  for (const item of items) {
    const href = item.href.split(/[?#]/)[0];
    if (!href || href === "/" || href === "#") continue;
    const segments = href.split("/").filter(Boolean);
    depth = Math.max(depth, segments.length);
  }
  return depth;
}

/** 按值分组 */
function groupBy(values: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const v of values) map[v] = (map[v] ?? 0) + 1;
  return map;
}

/** 数字属性解析 —— "640" / "640px" 都认 */
function toNumber(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

// ── 样式事实抽取 ─────────────────────────────────────────────

interface CssRule {
  selector: string;
  decls: Record<string, string>;
}

/** 解析样式表 —— 只取一层规则，@media 里的规则照样能拿到 */
function parseCss(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const selector = m[1].trim().replace(/^@[^ ]+\s*/, "");
    const decls: Record<string, string> = {};
    for (const part of m[2].split(";")) {
      const idx = part.indexOf(":");
      if (idx === -1) continue;
      decls[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim();
    }
    if (selector) rules.push({ selector, decls });
  }
  return rules;
}

/**
 * 从内联 <style> 与外部样式表内容里抽样式事实。
 *
 * 静态导出的 CSS 是独立文件 —— 调用方要把样式表内容一并传进来，
 * 否则字号/对比度这几项只能走 skip（拿不到数据 ≠ 有问题）。
 */
function extractStyles(
  $: ReturnType<typeof load>,
  extraCss: string,
): UxStyleFacts | undefined {
  const inline = $("style")
    .map((_, el) => $(el).text() ?? "")
    .get()
    .join("\n");
  const css = [extraCss, inline].filter(Boolean).join("\n");
  if (!css.trim()) return undefined;

  const rules = parseCss(css);

  // CSS 变量 —— 设计系统几乎都把字号/颜色写在 :root 里，
  // 不把 var() 展开就取不到实际值（body 的 font-size 常是 var(--text-base)）。
  const vars = collectCssVars(rules);
  const val = (v: string | undefined): string | undefined =>
    v === undefined ? undefined : resolveVars(v, vars);

  // 根字号 —— rem 换算成 px 的基准
  let rootFontSize = 16;
  for (const r of rules) {
    if (/^(html|:root)\b/.test(r.selector)) {
      const n = val(r.decls["font-size"]);
      const size = n ? parseLength(n, 16) : undefined;
      if (size !== undefined) rootFontSize = size;
    }
  }

  const bodyRule = rules.find((r) => /(^|[\s,])body\b/.test(r.selector));
  const fontSizeRaw = val(bodyRule?.decls["font-size"]);
  const fontSize = fontSizeRaw ? parseLength(fontSizeRaw, rootFontSize) : undefined;

  let lineHeight: number | undefined;
  const lhRaw = val(bodyRule?.decls["line-height"]);
  if (lhRaw) {
    const unitless = Number.parseFloat(lhRaw);
    if (!Number.isNaN(unitless) && !/[a-z%]/i.test(lhRaw)) {
      lineHeight = unitless;
    } else if (fontSize) {
      const px = parseLength(lhRaw, rootFontSize);
      if (px !== undefined) lineHeight = Math.round((px / fontSize) * 100) / 100;
    }
  }

  // 最小点击尺寸 —— 取所有与按钮/链接相关的规则里最大的 min-height
  let minTouchTarget: number | undefined;
  for (const r of rules) {
    if (!/btn|button|\ba\b|nav/i.test(r.selector)) continue;
    const v = val(r.decls["min-height"]);
    if (!v) continue;
    const px = parseLength(v, rootFontSize);
    if (px !== undefined && (minTouchTarget === undefined || px > minTouchTarget)) {
      minTouchTarget = px;
    }
  }

  // 颜色 —— body 上的优先，其次 :root 里的语义变量
  let color = val(bodyRule?.decls["color"]);
  let background = val(bodyRule?.decls["background-color"] ?? bodyRule?.decls["background"]);
  for (const r of rules) {
    if (!/^:root\b/.test(r.selector)) continue;
    color = color ?? val(r.decls["--color-text"]);
    background = background ?? val(r.decls["--color-bg"]);
  }

  // @font-face —— 有没有自托管字体、有没有 font-display: swap
  const fontFaces = rules.filter((r) => /^@font-face\b/.test(r.selector));
  const hasWebFont = fontFaces.length > 0;
  const fontDisplaySwap =
    hasWebFont && fontFaces.every((r) => (r.decls["font-display"] ?? "").toLowerCase() === "swap");

  return {
    hasStylesheet: true,
    fontSize,
    lineHeight,
    minTouchTarget,
    color,
    background,
    hasWebFont,
    fontDisplaySwap,
  };
}

/**
 * 收集 CSS 变量（--name: value）。
 *
 * 为什么分两轮、且先到先得：
 *   主题变体（[data-theme=slate] 之类）会**重定义**同一批中性色变量。
 *   若谁后谁赢，取到的是变体的深色调 —— 拿去算对比度会得出
 *   「正文与背景几乎同色」这种假结论。基准主题（:root）优先。
 */
function collectCssVars(rules: CssRule[]): Record<string, string> {
  const vars: Record<string, string> = {};
  const base = rules.filter((r) => /(^|\s):root\b/.test(r.selector) || /^html\b/.test(r.selector));
  const rest = rules.filter((r) => !base.includes(r));
  for (const group of [base, rest]) {
    for (const r of group) {
      for (const [k, v] of Object.entries(r.decls)) {
        if (k.startsWith("--") && vars[k] === undefined) vars[k] = v;
      }
    }
  }
  return vars;
}

/**
 * 展开 var(--x) 引用。
 *
 * 为什么需要：设计系统里 body 的 font-size 几乎都写成 var(--text-base)，
 * 直接读声明拿到的是变量名而不是数值 —— 不展开就等于没取到。
 */
function resolveVars(value: string, vars: Record<string, string>, depth = 0): string {
  if (depth > 5) return value;
  const m = value.match(/var\(\s*(--[^,)]+)(?:,[^)]*)?\)/);
  if (!m) return value;
  const replacement = vars[m[1].trim()];
  if (replacement === undefined) return value;
  return resolveVars(value.replace(m[0], replacement), vars, depth + 1);
}

/** 长度解析 —— px / rem（rem 用根字号换算） */
function parseLength(value: string, rootFontSize: number): number | undefined {
  const v = value.trim().toLowerCase();
  const m = v.match(/^([\d.]+)\s*(px|rem|em)?$/);
  if (!m) return undefined;
  const n = Number.parseFloat(m[1]);
  if (!Number.isFinite(n)) return undefined;
  if (m[2] === "rem") return n * rootFontSize;
  if (m[2] === "em") return n * rootFontSize;
  if (m[2] === "px" || m[2] === undefined) return n;
  return undefined;
}

// ── 对比度 ───────────────────────────────────────────────────

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** 颜色解析 —— #rgb / #rrggbb / rgb() / 常见关键字 */
function parseColor(value: string): Rgb | undefined {
  const v = value.trim().toLowerCase();
  if (v.startsWith("#")) {
    const hex = v.slice(1);
    if (hex.length === 3) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }
    if (hex.length === 6) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
      };
    }
    return undefined;
  }
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }
  const named: Record<string, Rgb> = {
    black: { r: 0, g: 0, b: 0 },
    white: { r: 255, g: 255, b: 255 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    gray: { r: 128, g: 128, b: 128 },
    grey: { r: 128, g: 128, b: 128 },
  };
  return named[v];
}

/** 相对亮度 */
function luminance(c: Rgb): number {
  const channel = (raw: number): number => {
    const s = raw / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** 对比度（WCAG 2.x） */
export function contrastRatio(fg: string, bg: string): number | undefined {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return undefined;
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

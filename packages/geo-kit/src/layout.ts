/**
 * 布局变体 —— 客户一眼能看出不同的那一层。
 *
 * ── 分层 ────────────────────────────────────────────────
 *   variant（色板）  → 颜色
 *   style（质感）    → 圆角、阴影、边框
 *   layout（本层）  → **版心宽度、字体气质、区块节奏、栏数**
 *
 * 前两层改「皮肤」，这一层改「体格」。
 * 一个 SaaS 站和一个律所站，即使配色接近，
 * 版心宽度、标题字号、留白节奏、栅格栏数不同，观感就完全不同。
 *
 * ── 为什么还是一份骨架 ─────────────────────────────────
 * 布局变体全部落在 CSS 变量 + 少量选择器上，
 * 组件 markup 不变 —— 所以加一套布局变体不用复制骨架，
 * 也不影响另外几套（客户站可能随时换）。
 *
 * ── 与 GEO 的关系 ─────────────────────────────────────
 * 布局不能牺牲可读性：
 *   - 正文宽度有上限（--prose-max），编辑式也不能超宽到难读
 *   - 标题层级清晰，AI 靠 h1/h2 理解页面结构
 *   - 深色底上的正文对比度达标
 */

import type { SiteTheme } from "./types.js";

/** 布局变体名 */
export type LayoutVariant = "centered" | "split" | "editorial" | "bold";

export const LAYOUT_VARIANTS: LayoutVariant[] = [
  "centered",
  "split",
  "editorial",
  "bold",
];

/**
 * 布局变体的 CSS。
 *
 * 全部用变量 + 选择器，不动组件 markup。
 */
export function layoutCss(layout: LayoutVariant): string {
  switch (layout) {
    // ── 窄栏居中：传统 B2B ─────────────────────────────
    case "centered":
      return `
[data-layout="centered"] {
  --container-max: 1080px;
  --prose-max: 68ch;
  --section-padding: clamp(3.5rem, 2.5rem + 4vw, 6.5rem);
  --hero-title-size: var(--text-4xl);
  --section-title-size: var(--text-3xl);
  --grid-gap: var(--space-6);
}
[data-layout="centered"] .section-head { max-width: 62ch; }
[data-layout="centered"] .hero-split > div:first-child { max-width: 60ch; }
`;

    // ── 左右分栏：产品 / SaaS ─────────────────────────
    // 关键特征：英雄区与「产品概览」类模块左右交替，
    // 页头导航靠右、内容不居中 —— 整体节奏是「横向的」。
    case "split":
      return `
[data-layout="split"] {
  --container-max: 1280px;
  --prose-max: 66ch;
  --section-padding: clamp(3rem, 2rem + 4vw, 6rem);
  --hero-title-size: var(--text-4xl);
  --section-title-size: var(--text-3xl);
  --grid-gap: var(--space-8);
}
[data-layout="split"] .hero-split { align-items: center; }
[data-layout="split"] .hero-split > div:first-child { max-width: 52ch; }
[data-layout="split"] .grid-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
[data-layout="split"] .section-alt .container { max-width: var(--container-max); }
[data-layout="split"] .section-head { max-width: 54ch; }
/* 交替色块的边界改成「半出血」，横向感更强 */
[data-layout="split"] .section-alt { background: var(--color-bg-subtle); }
`;

    // ── 杂志编排：咨询 / 律所 / 内容站 ─────────────────
    // 关键特征：衬线标题、极窄版心、巨大的标题留白。
    case "editorial":
      return `
[data-layout="editorial"] {
  --container-max: 980px;
  --prose-max: 64ch;
  --section-padding: clamp(4.5rem, 3rem + 6vw, 8rem);
  --hero-title-size: var(--text-5xl);
  --section-title-size: var(--text-3xl);
  --grid-gap: var(--space-8);
  --font-display: "Songti SC", "SimSun", Georgia, "Times New Roman", serif;
  --tracking-tight: -0.01em;
  --tracking-wide: 0.06em;
}
[data-layout="editorial"] h1,
[data-layout="editorial"] h2,
[data-layout="editorial"] .section-head h2,
[data-layout="editorial"] .hero h1 {
  font-family: var(--font-display);
  font-weight: 600;
}
[data-layout="editorial"] .section-head h2 { font-size: var(--text-3xl); }
[data-layout="editorial"] .hero h1 { line-height: 1.15; }
[data-layout="editorial"] .section-head p { font-style: italic; }
/* 杂志感：首段下沉首字。
   ⚠️ 只对**西文**生效 —— 中文没有下沉首字的传统，
   汉字被放大 3 倍会非常怪（实测「已」被放大后像图标）。
   所以限定 :lang(en)，中文站不受影响。 */
[data-layout="editorial"][lang="en"] .prose > p:first-of-type::first-letter {
  float: left;
  font-family: var(--font-display);
  font-size: 3.2em;
  line-height: 0.85;
  padding-right: 0.08em;
  color: var(--color-text-primary);
}
[data-layout="editorial"] .card { border-width: 0; border-top: 2px solid var(--color-text); }
`;

    // ── 大胆撞色：消费 / 初创 ─────────────────────────
    // 关键特征：超大标题、主色背景块、圆角夸张。
    case "bold":
      return `
[data-layout="bold"] {
  --container-max: 1240px;
  --prose-max: 70ch;
  --section-padding: clamp(4rem, 2.5rem + 5vw, 7rem);
  --hero-title-size: clamp(2.75rem, 1.8rem + 4.5vw, 4.5rem);
  --section-title-size: var(--text-3xl);
  --grid-gap: var(--space-8);
  --radius-lg: 24px;
  --radius-xl: 32px;
}
[data-layout="bold"] .hero {
  background: var(--color-primary);
  color: var(--color-on-primary);
}
[data-layout="bold"] .hero h1,
[data-layout="bold"] .hero .lead,
[data-layout="bold"] .hero .prose,
[data-layout="bold"] .hero .prose p,
[data-layout="bold"] .hero .prose li,
[data-layout="bold"] .hero ul.bullets li {
  /* 主色底上的文字必须够亮 —— 琥珀色底配深色字会糊，
     所以强制用 on-primary（白），并留足对比 */
  color: var(--color-on-primary);
}
[data-layout="bold"] .hero .prose a { color: var(--color-on-primary); }
[data-layout="bold"] .hero .btn-primary {
  background: var(--color-on-primary);
  color: var(--color-primary);
  border-color: var(--color-on-primary);
}
[data-layout="bold"] .section-head h2 { font-size: var(--text-3xl); }
[data-layout="bold"] .card { border-color: transparent; box-shadow: var(--shadow-lg); }
/* 交替区块用主色浅底 */
[data-layout="bold"] .section-alt { background: var(--color-primary-subtle); }
`;

    default:
      return "";
  }
}

/**
 * 密度变体的 CSS。
 *
 * compact 收紧间距与正文字号 —— 参数表、产品清单这类内容多的站点需要。
 */
export function densityCss(density: "comfortable" | "compact"): string {
  if (density === "compact") {
    return `
[data-density="compact"] {
  --section-padding: clamp(2.25rem, 1.5rem + 2.5vw, 4rem);
  --space-6: 1.25rem;
  --space-8: 1.5rem;
  --text-base: 0.9375rem;
  --leading-normal: 1.6;
  --grid-gap: var(--space-5);
}
[data-density="compact"] .section-tight { padding-block: calc(var(--section-padding) / 2); }
[data-density="compact"] .card { padding: var(--space-4); }
`;
  }
  return "";
}

/**
 * 生成布局 CSS —— 与主题 CSS 一起注入。
 */
export function generateLayoutCss(theme: SiteTheme | undefined): string {
  if (!theme) return "";
  const parts: string[] = [];
  if (theme.layout) parts.push(layoutCss(theme.layout));
  if (theme.density) parts.push(densityCss(theme.density));
  return parts.join("\n");
}

/**
 * html 标签属性 —— data-layout / data-density。
 */
export function layoutHtmlAttrs(theme: SiteTheme | undefined): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (theme?.layout) attrs["data-layout"] = theme.layout;
  if (theme?.density) attrs["data-density"] = theme.density;
  return attrs;
}

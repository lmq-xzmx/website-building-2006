/**
 * 主题 —— 把内容包里的 SiteTheme 变成可用的 CSS。
 *
 * 设计原则：**主题只改令牌，不改组件**。
 * 「千行万业」意味着客户站不能长得千篇一律，
 * 但每多一套模板就多一份维护成本 —— 所以走令牌路线。
 *
 * 三层机制：
 *   1. 主题变体（data-theme="forest|slate|amber"）—— 预置的整套色板
 *   2. 主色覆盖（--color-primary 等）—— 客户指定具体色值
 *   3. 风格（data-style="classic|minimal"）—— 圆角/阴影/留白的整体调性
 */

import type { SiteTheme } from "./types.js";

/**
 * 生成主题 CSS（放在 <style> 里或作为独立文件）。
 */
export function generateThemeCss(theme: SiteTheme | undefined): string {
  if (!theme) return "";

  const lines: string[] = [];

  // 自定义主色 —— 覆盖色阶的关键档位
  if (theme.primaryColor) {
    const c = theme.primaryColor;
    lines.push(`:root { --primary-500: ${c}; }`);
    lines.push(
      `:root { --color-primary: ${c}; --color-primary-hover: color-mix(in srgb, ${c} 86%, #000); --color-primary-active: color-mix(in srgb, ${c} 76%, #000); --color-primary-subtle: color-mix(in srgb, ${c} 10%, transparent); --color-primary-subtle-hover: color-mix(in srgb, ${c} 16%, transparent); --color-text-primary: color-mix(in srgb, ${c} 88%, #000); }`,
    );
  }

  if (theme.accentColor) {
    lines.push(`:root { --color-accent: ${theme.accentColor}; }`);
  }

  // 风格变体
  if (theme.style) {
    lines.push(styleCss(theme.style));
  }

  return lines.join("\n");
}

/**
 * 风格变体的 CSS。
 *
 * classic —— 方正、细边框、无阴影，适合金融/政务/制造业
 * minimal —— 大留白、无边框、弱化装饰，适合设计/咨询/精品
 */
function styleCss(style: NonNullable<SiteTheme["style"]>): string {
  switch (style) {
    case "classic":
      return `
[data-style="classic"] {
  --radius-sm: 2px;
  --radius-md: 3px;
  --radius-lg: 4px;
  --radius-xl: 6px;
  --shadow-xs: none;
  --shadow-sm: none;
  --shadow-md: 0 1px 0 1px var(--color-border);
  --shadow-lg: 0 2px 0 0 var(--color-border);
  --shadow-xl: 0 3px 0 0 var(--color-border);
}
[data-style="classic"] .card { border-width: 1px; }
[data-style="classic"] .card:hover { transform: none; box-shadow: var(--shadow-lg); }
[data-style="classic"] .btn { border-radius: 2px; }
[data-style="classic"] .btn-primary { box-shadow: none; }
`;

    case "minimal":
      return `
[data-style="minimal"] {
  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;
  --radius-xl: 0;
  --shadow-xs: none;
  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;
  --shadow-xl: none;
  --section-padding: clamp(4.5rem, 3rem + 6vw, 8.5rem);
}
[data-style="minimal"] .card { background: transparent; border-color: var(--color-border); }
[data-style="minimal"] .card:hover { transform: none; box-shadow: none; }
[data-style="minimal"] .btn { border-radius: 0; }
[data-style="minimal"] .hero { background: var(--color-bg); }
`;

    default:
      return "";
  }
}

/**
 * html 标签属性。
 *
 * data-theme  → 主题变体（对应 design-tokens.css 的 [data-theme="..."]）
 * data-style  → 风格变体
 * color-scheme → 让浏览器把表单控件与滚动条也切到深色
 */
export function themeHtmlAttrs(theme: SiteTheme | undefined): Record<string, string> {
  const attrs: Record<string, string> = {};

  if (theme?.variant && theme.variant !== "default") {
    attrs["data-theme"] = theme.variant;
  }
  if (theme?.style) {
    attrs["data-style"] = theme.style;
  }
  if (theme?.respectColorScheme === false) {
    attrs["data-theme"] = theme.variant ?? "light";
    attrs.style = "color-scheme: light";
  }

  return attrs;
}

/**
 * 公众号排版 —— 把富文本文档变成能粘进微信编辑器的 HTML。
 *
 * ── 为什么不能直接用 docToHtml ─────────────────────────
 * 微信编辑器（以及大多数富文本编辑器）会：
 *   - **剥离 <style> 标签与 class 属性**
 *   - 只保留**内联样式**（style="..."）
 *   - 过滤一部分标签（<section> 能留，<div> 能留，但自定义属性会掉）
 * 所以网页上好看的 CSS 类样式，粘到微信里会变成一团白。
 *
 * 因此这里做的是**另一套渲染**：每个节点直接带 style 属性。
 *
 * ── 排版主题 ──────────────────────────────────────────
 * 同一篇内容，公众号有几种常见风格（类似 doocs/md 的主题）：
 *   default  简洁（默认微信样式）
 *   green    微信绿（引导色 + 分隔线）
 *   red      政务红
 *   blue     商务蓝
 *   sunset   暖橙（消费/活动）
 * 主题只改字号、颜色、间距、引用样式、代码框 —— 内容一字不改。
 *
 * ── 与 GEO 的关系 ─────────────────────────────────────
 * 排版不能改内容 —— AI 引用的是原文。
 * 所以主题只碰视觉属性，正文文字、顺序、链接目标一律原样。
 */

import type { RichTextDoc, RichTextMark, RichTextNode } from "./types.js";
import { escapeHtml } from "./render.js";

/** 排版主题 */
export type WechatTheme =
  | "default"
  | "green"
  | "red"
  | "blue"
  | "sunset";

export const WECHAT_THEMES: WechatTheme[] = [
  "default",
  "green",
  "blue",
  "red",
  "sunset",
];

export const WECHAT_THEME_LABEL: Record<WechatTheme, string> = {
  default: "简洁",
  green: "微信绿",
  blue: "商务蓝",
  red: "政务红",
  sunset: "暖橙",
};

/** 主题的视觉参数 */
interface WechatStyle {
  /** 正文字号 */
  fontSize: string;
  /** 正文颜色 */
  color: string;
  /** 强调色（标题、引用边、链接） */
  accent: string;
  /** 强调色的浅底（引用块、代码块底） */
  accentSoft: string;
  /** 段落间距 */
  paraMargin: string;
  /** 标题字号 */
  h1Size: string;
  h2Size: string;
  h3Size: string;
  /** 行高 */
  lineHeight: string;
  /** 是否给段落加左竖线（列表项） */
  listMarker: string;
}

const THEMES: Record<WechatTheme, WechatStyle> = {
  default: {
    fontSize: "16px",
    color: "#3f3f3f",
    accent: "#576b95",
    accentSoft: "#f7f7f7",
    paraMargin: "1.2em 0",
    h1Size: "22px",
    h2Size: "19px",
    h3Size: "17px",
    lineHeight: "1.75",
    listMarker: "",
  },
  green: {
    fontSize: "16px",
    color: "#3f3f3f",
    accent: "#07c160",
    accentSoft: "#f2fbf6",
    paraMargin: "1.3em 0",
    h1Size: "22px",
    h2Size: "19px",
    h3Size: "17px",
    lineHeight: "1.8",
    listMarker: "color:#07c160;font-weight:bold;",
  },
  blue: {
    fontSize: "16px",
    color: "#333333",
    accent: "#1a73e8",
    accentSoft: "#f0f5ff",
    paraMargin: "1.25em 0",
    h1Size: "21px",
    h2Size: "18px",
    h3Size: "16px",
    lineHeight: "1.78",
    listMarker: "color:#1a73e8;font-weight:bold;",
  },
  red: {
    fontSize: "16px",
    color: "#2f2f2f",
    accent: "#c9302c",
    accentSoft: "#fdf3f2",
    paraMargin: "1.25em 0",
    h1Size: "21px",
    h2Size: "18px",
    h3Size: "16px",
    lineHeight: "1.8",
    listMarker: "color:#c9302c;font-weight:bold;",
  },
  sunset: {
    fontSize: "16px",
    color: "#4a3f35",
    accent: "#e8684a",
    accentSoft: "#fff5f1",
    paraMargin: "1.35em 0",
    h1Size: "22px",
    h2Size: "19px",
    h3Size: "17px",
    lineHeight: "1.85",
    listMarker: "color:#e8684a;font-weight:bold;",
  },
};

/** 段落的公共样式 */
function pStyle(t: WechatStyle, extra = ""): string {
  return `margin:${t.paraMargin};font-size:${t.fontSize};color:${t.color};line-height:${t.lineHeight};text-align:left;${extra}`;
}

/** 渲染行内节点（带内联样式） */
function inline(node: RichTextNode): string {
  if (node.type === "hardBreak") return "<br />";

  let text: string;
  if (node.text !== undefined) {
    text = escapeHtml(node.text);
  } else if (node.content) {
    text = node.content.map(inline).join("");
  } else {
    text = "";
  }

  for (const mark of node.marks ?? []) {
    text = markStyle(text, mark);
  }
  return text;
}

/** mark → 内联样式 */
function markStyle(text: string, mark: RichTextMark): string {
  switch (mark.type) {
    case "bold":
      return `<strong style="font-weight:700;">${text}</strong>`;
    case "italic":
      return `<em style="font-style:italic;">${text}</em>`;
    case "underline":
      return `<u style="text-decoration:underline;">${text}</u>`;
    case "strike":
      return `<s style="text-decoration:line-through;">${text}</s>`;
    case "code":
      return `<code style="font-family:Menlo,Consolas,monospace;font-size:14px;background:rgba(0,0,0,0.05);padding:2px 5px;border-radius:3px;">${text}</code>`;
    case "link": {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
      if (!href || !/^(https?:\/\/|mailto:|\/)/i.test(href)) return text;
      return `<a href="${escapeHtml(href)}" style="color:#576b95;text-decoration:none;">${text}</a>`;
    }
    default:
      return text;
  }
}

/** 渲染块级节点 */
function block(node: RichTextNode, t: WechatStyle): string {
  const inner = (node.content ?? []).map((c) => inline(c)).join("");

  switch (node.type) {
    case "paragraph":
      return `<p style="${pStyle(t)}">${inner}</p>`;

    case "heading": {
      const level = Number(node.attrs?.level ?? 2);
      const lv = level >= 1 && level <= 6 ? level : 2;
      const size = lv === 1 ? t.h1Size : lv === 2 ? t.h2Size : t.h3Size;
      // 标题带一条强调色下边线 —— 公众号里最常见的标题样式
      return (
        `<h${lv} style="margin:${lv === 1 ? "1.6em 0 0.8em" : "1.5em 0 0.7em"};` +
        `font-size:${size};font-weight:700;color:${t.accent};line-height:1.4;` +
        `border-left:4px solid ${t.accent};padding-left:10px;">${inner}</h${lv}>`
      );
    }

    case "blockquote":
      return (
        `<blockquote style="margin:${t.paraMargin};padding:12px 16px;` +
        `border-left:4px solid ${t.accent};background:${t.accentSoft};` +
        `color:${t.color};font-size:${t.fontSize};line-height:${t.lineHeight};">${inner}</blockquote>`
      );

    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      return (
        `<pre style="margin:${t.paraMargin};padding:14px 16px;background:${t.accentSoft};` +
        `border:1px solid rgba(0,0,0,0.06);border-radius:6px;overflow-x:auto;">` +
        `<code style="display:block;font-family:Menlo,Consolas,monospace;font-size:13px;` +
        `line-height:1.6;color:${t.color};white-space:pre-wrap;">${inner}</code></pre>` +
        (lang ? `<p style="margin:4px 0 1em;font-size:12px;color:#999;">${escapeHtml(lang)}</p>` : "")
      );
    }

    case "bulletList":
    case "orderedList": {
      const ordered = node.type === "orderedList";
      const items = (node.content ?? []).filter((n) => n.type === "listItem");
      const lis = items
        .map((li, i) => {
          const marker = ordered ? `${i + 1}.` : "•";
          const text = (li.content ?? [])
            .map((c) => inline(c))
            .join("");
          return (
            `<li style="margin:0.5em 0;font-size:${t.fontSize};color:${t.color};line-height:${t.lineHeight};">` +
            `<span style="${t.listMarker}">${marker}</span> ${text}</li>`
          );
        })
        .join("");
      return `<ul style="margin:${t.paraMargin};padding-left:1.2em;">${lis}</ul>`;
    }

    case "listItem":
      return (node.content ?? []).map((c) => inline(c)).join("");

    case "horizontalRule":
      return (
        `<hr style="margin:2em 0;border:none;border-top:1px solid rgba(0,0,0,0.08);" />`
      );

    case "table": {
      const rows = (node.content ?? [])
        .filter((r) => r.type === "tableRow")
        .map((r) => {
          const cells = (r.content ?? [])
            .map((c) => {
              const tag = c.type === "tableHeader" ? "th" : "td";
              const text = (c.content ?? []).map((x) => inline(x)).join("");
              const weight = c.type === "tableHeader" ? "font-weight:700;background:#f7f7f7;" : "";
              return `<${tag} style="border:1px solid rgba(0,0,0,0.08);padding:8px 10px;font-size:15px;${weight}">${text}</${tag}>`;
            })
            .join("");
          return `<tr style="border:1px solid rgba(0,0,0,0.08);">${cells}</tr>`;
        })
        .join("");
      return `<table style="margin:${t.paraMargin};border-collapse:collapse;width:100%;">${rows}</table>`;
    }

    default: {
      // 未知块类型：保留内容，不产出奇怪标签
      if (!node.content?.length) return "";
      const text = (node.content ?? []).map((c) => inline(c)).join("");
      return `<p style="${pStyle(t)}">${text}</p>`;
    }
  }
}

/**
 * 富文本 → 公众号排版 HTML（内联样式）。
 *
 * 输出可直接粘进微信编辑器 / mdnice / doocs。
 */
export function docToWechatHtml(
  doc: RichTextDoc | undefined | null,
  theme: WechatTheme = "default",
): string {
  if (!doc?.content) return "";
  const t = THEMES[theme] ?? THEMES.default;
  return doc.content.map((n) => block(n, t)).join("\n");
}

/**
 * 公众号排版 → 纯文本（用于「复制纯文本」与预览）。
 */
export function docToWechatText(
  doc: RichTextDoc | undefined | null,
): string {
  if (!doc?.content) return "";
  const lines: string[] = [];
  for (const n of doc.content) {
    switch (n.type) {
      case "paragraph":
      case "heading":
      case "blockquote": {
        const t = nodeText(n);
        if (t.trim()) lines.push(t);
        break;
      }
      case "bulletList":
      case "orderedList": {
        // listItem 的子节点是 paragraph —— 要递归取文本，不能只看直接子节点
        const items = (n.content ?? [])
          .filter((x) => x.type === "listItem")
          .map((x) => nodeText(x));
        lines.push(...items.filter((x) => x.trim()));
        break;
      }
      case "codeBlock":
        lines.push(nodeText(n));
        break;
      case "horizontalRule":
        lines.push("———");
        break;
      default: {
        const t = nodeText(n);
        if (t.trim()) lines.push(t);
      }
    }
  }
  return lines.join("\n");
}

/** 递归取节点纯文本 */
function nodeText(node: RichTextNode): string {
  if (node.text !== undefined) return node.text;
  if (!node.content) return "";
  return node.content.map(nodeText).join("");
}

/**
 * 微信公众号文章的整体包装 —— 标题 + 作者 + 正文。
 *
 * 微信编辑器里粘贴正文时，标题要单独填；
 * 这个函数生成一份可直接预览的完整 HTML 片段。
 */
export function wechatArticleHtml(
  doc: RichTextDoc | undefined | null,
  opts: { title?: string; author?: string; theme?: WechatTheme } = {},
): string {
  const theme = opts.theme ?? "default";
  const t = THEMES[theme] ?? THEMES.default;
  const body = docToWechatHtml(doc, theme);

  const titleHtml = opts.title
    ? `<h1 style="margin:0 0 0.6em;font-size:22px;font-weight:700;color:${t.color};line-height:1.4;">${escapeHtml(opts.title)}</h1>`
    : "";
  const authorHtml = opts.author
    ? `<p style="margin:0 0 1.4em;font-size:14px;color:#999;">${escapeHtml(opts.author)}</p>`
    : "";

  return `<section style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;line-height:${t.lineHeight};">${titleHtml}${authorHtml}${body}</section>`;
}

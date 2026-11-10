/**
 * 富文本 → HTML。
 *
 * 为什么在 geo-kit 里做（而不是模板里）：
 *   - 后台预览、静态站渲染、llms.txt 生成要用**同一套**富文本语义
 *   - 放一处，就不会出现「后台看着有标题、站上没标题」这种分裂
 *
 * 输出是**安全的 HTML** —— 所有文本都转义，mark 只白名单放行。
 * 不是让用户塞任意 HTML（那是 XSS 的大窟窿）。
 */

import type { RichTextDoc, RichTextMark, RichTextNode } from "./types.js";

/** HTML 转义 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 允许的 mark —— 白名单，其余忽略 */
const ALLOWED_MARKS: Record<string, (text: string) => string> = {
  bold: (t) => `<strong>${t}</strong>`,
  italic: (t) => `<em>${t}</em>`,
  underline: (t) => `<u>${t}</u>`,
  strike: (t) => `<s>${t}</s>`,
  code: (t) => `<code>${t}</code>`,
};

/** link mark —— 只允许 http/https/mailto 与站内相对路径 */
function renderLink(text: string, mark: RichTextMark): string {
  const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
  if (!href) return text;
  const safe = /^(https?:\/\/|mailto:|\/)/i.test(href);
  if (!safe) return text;
  const target = mark.attrs?.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
  return `<a href="${escapeHtml(href)}"${target}>${text}</a>`;
}

/** 渲染 inline 节点 */
function renderInline(node: RichTextNode): string {
  let text: string;
  if (node.type === "hardBreak") return "<br />";
  if (node.text !== undefined) {
    text = escapeHtml(node.text);
  } else if (node.content) {
    text = node.content.map(renderInline).join("");
  } else {
    text = "";
  }

  for (const mark of node.marks ?? []) {
    if (mark.type === "link") {
      text = renderLink(text, mark);
      continue;
    }
    const fn = ALLOWED_MARKS[mark.type];
    if (fn) text = fn(text);
  }

  return text;
}

/** 渲染块级节点 → HTML 字符串（可多行） */
function renderBlock(node: RichTextNode): string {
  const inner = (node.content ?? []).map(renderInline).join("");

  switch (node.type) {
    case "paragraph":
      return `<p>${inner}</p>`;
    case "heading": {
      const level = Number(node.attrs?.level ?? 2);
      const lv = level >= 1 && level <= 6 ? level : 2;
      return `<h${lv}>${inner}</h${lv}>`;
    }
    case "blockquote":
      return `<blockquote>${inner}</blockquote>`;
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      return `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${inner}</code></pre>`;
    }
    case "bulletList":
    case "orderedList": {
      const tag = node.type === "orderedList" ? "ol" : "ul";
      const items = (node.content ?? [])
        .filter((n) => n.type === "listItem")
        .map((li) => `<li>${(li.content ?? []).map(renderBlock).join("")}</li>`)
        .join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "listItem":
      return (node.content ?? []).map(renderBlock).join("");
    case "horizontalRule":
      return "<hr />";
    case "table": {
      // 表格：行 → 单元格。简单实现，不做合并单元格
      const rows = (node.content ?? [])
        .filter((r) => r.type === "tableRow")
        .map((r) => {
          const cells = (r.content ?? [])
            .map((c) => {
              const tag = c.type === "tableHeader" ? "th" : "td";
              const text = (c.content ?? []).map(renderInline).join("");
              return `<${tag}>${text}</${tag}>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<table><tbody>${rows}</tbody></table>`;
    }
    default: {
      // 未知块类型：渲染其 inline 内容，不丢内容也不产出奇怪标签
      if (node.content?.length) {
        const text = node.content.map(renderInline).join("");
        return `<p>${text}</p>`;
      }
      return "";
    }
  }
}

/** 富文本文档 → HTML 片段 */
export function docToHtml(doc: RichTextDoc | undefined | null): string {
  if (!doc?.content) return "";
  return doc.content.map(renderBlock).join("\n");
}

/**
 * 富文本 → Markdown —— 供 llms.txt / 全文导出用。
 *
 * AI 读 Markdown 比读 HTML 干净得多（没有样式噪声），
 * 且引用时更容易定位到段落。
 */
export function docToMarkdown(doc: RichTextDoc | undefined | null): string {
  if (!doc?.content) return "";
  const out: string[] = [];

  for (const block of doc.content) {
    switch (block.type) {
      case "paragraph":
        out.push(inlineText(block));
        break;
      case "heading": {
        const level = Number(block.attrs?.level ?? 2);
        const lv = level >= 1 && level <= 6 ? level : 2;
        out.push(`${"#".repeat(lv)} ${inlineText(block)}`);
        break;
      }
      case "blockquote":
        out.push(`> ${inlineText(block)}`);
        break;
      case "codeBlock":
        out.push("```\n" + inlineText(block) + "\n```");
        break;
      case "bulletList":
      case "orderedList": {
        const ordered = block.type === "orderedList";
        const items = (block.content ?? []).filter((n) => n.type === "listItem");
        items.forEach((li, i) => {
          const marker = ordered ? `${i + 1}.` : "-";
          out.push(`${marker} ${inlineText(li)}`);
        });
        break;
      }
      case "horizontalRule":
        out.push("---");
        break;
      default: {
        const t = inlineText(block);
        if (t) out.push(t);
      }
    }
  }

  return out.filter(Boolean).join("\n\n");
}

/** 节点的纯文本（inline 层） */
function inlineText(node: RichTextNode): string {
  if (node.text !== undefined) return node.text;
  if (!node.content) return "";
  return node.content.map(inlineText).join("");
}

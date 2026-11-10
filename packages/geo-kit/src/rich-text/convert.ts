/**
 * 富文本 ↔ 纯文本互转 —— 给 GEO 用。
 *
 * 为什么要能降级成纯文本：
 *   GEO 的核心指标（段落数、含数字的段落、答案先行、术语数）都是
 *   **按纯文本段落**算的。富文本是给人看的，段落才是 AI 引用的单位。
 *   所以富文本必须能无损降级成「段落数组」，供体检与 llms.txt 使用。
 */

import type { RichTextDoc, RichTextNode } from "./types.js";

/** 节点里的文字（含 mark 忽略 —— 文本内容与样式无关） */
function nodeText(node: RichTextNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(nodeText).join("");
}

/**
 * 提取**块级**文本 —— 每个顶层 block 一段。
 *
 * 列表项不拆散成独立段落（一个 bulletList 算一段，
 * 但内部用换行分隔），这样段落数反映的是「作者写了几个意思」，
 * 而不是「有几个 bullet」。
 */
export function docToParagraphs(doc: RichTextDoc | undefined | null): string[] {
  if (!doc?.content) return [];
  const out: string[] = [];

  for (const block of doc.content) {
    switch (block.type) {
      case "paragraph":
      case "heading":
      case "blockquote":
      case "codeBlock": {
        const t = nodeText(block).trim();
        if (t) out.push(t);
        break;
      }
      case "bulletList":
      case "orderedList": {
        const items = (block.content ?? [])
          .filter((n) => n.type === "listItem")
          .map((n) => nodeText(n).trim())
          .filter(Boolean);
        if (items.length) out.push(items.map((li) => `- ${li}`).join("\n"));
        break;
      }
      case "horizontalRule":
        break;
      default: {
        // 未知块类型：递归取文本，别丢内容
        const t = nodeText(block).trim();
        if (t) out.push(t);
      }
    }
  }

  return out;
}

/** 全文纯文本（段落用空行分隔） */
export function docToPlainText(doc: RichTextDoc | undefined | null): string {
  return docToParagraphs(doc).join("\n\n");
}

/** 词数（中文按字、英文按词）—— 阅读时长的估算依据 */
export function countWords(text: string): number {
  const cjk = (text.match(/[一-鿿]/g) ?? []).length;
  const words = (text.match(/[a-zA-Z0-9]+/g) ?? []).length;
  return cjk + words;
}

/** 粗略阅读时长（分钟）—— 中文按每分钟 400 字 */
export function readingMinutes(doc: RichTextDoc | undefined | null): number {
  const text = docToPlainText(doc);
  return Math.max(1, Math.round(countWords(text) / 400));
}

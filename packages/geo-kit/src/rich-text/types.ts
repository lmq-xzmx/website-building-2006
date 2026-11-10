/**
 * 富文本文档 —— ProseMirror / Tiptap 的 JSON 格式。
 *
 * 为什么直接用 ProseMirror 的 JSON 结构：
 *   - 后台编辑器用 Tiptap（MIT，React/vanilla 都行），存出来的就是这套 JSON
 *   - geo-kit **不 import Tiptap** —— 它是框架无关的核心包，
 *     只定义**数据结构**（纯 JSON），渲染与编辑都在外面做
 *   - JSON 而不是 HTML：对 GEO 有实质差别 ——
 *     AI 引擎要能精确引用「第 3 段的第 2 个列表项」，
 *     HTML 里那是一坨带样式的字符串，抽取要重新解析且容易丢语义
 *
 * 结构是 ProseMirror 的最小子集：
 *   doc → content: block[]
 *   block: paragraph / heading / bulletList / orderedList / listItem /
 *           blockquote / codeBlock / horizontalRule / table
 *   inline: text / hardBreak / mention
 *   marks: bold / italic / strike / code / link / underline
 *
 * 未知节点类型一律忽略 —— 上游编辑器加新节点不会让这里崩。
 */

export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
}

export interface RichTextDoc {
  type: "doc";
  content?: RichTextNode[];
}

/** 空文档 */
export function emptyDoc(): RichTextDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** 判断是不是空文档（无文本内容） */
export function isDocEmpty(doc: RichTextDoc | undefined | null): boolean {
  if (!doc) return true;
  return collectText(doc).trim().length === 0;
}

/** 递归收集文本 —— types.ts 不 import convert.ts（避免循环依赖） */
function collectText(node: RichTextNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(collectText).join("");
}

/**
 * 富文本编辑器 —— 块级，产出 ProseMirror JSON。
 *
 * 与旧实现的两处关键差别：
 *   1. **行内标记不再丢**。旧版 read() 只取 textContent，加粗/斜体保存后全没了。
 *      这里把行内 HTML 解析回 marks（bold / italic / underline / strike / link）。
 *   2. **列表是真列表**。旧版每个列表项各存成一个 bulletList 节点（非法结构）。
 *      这里连续的同类型列表项会合并成一个 bulletList / orderedList 节点。
 *
 * 为什么还是 execCommand：零依赖、自带 undo 栈、浏览器全都支持。
 * 存储格式与 Tiptap 兼容 —— 将来换编辑器不用迁移数据。
 */

import { h, icon } from "./dom.js";

const MARKS = [
  ["bold", "B", "加粗", "bold", "font-weight:700"],
  ["italic", "I", "斜体", "italic", "font-style:italic;font-family:var(--font-display)"],
  ["underline", "U", "下划线", "underline", "text-decoration:underline"],
  ["strike", "S", "删除线", "strikeThrough", "text-decoration:line-through"],
];

const BLOCK_TYPES = [
  ["paragraph", "正文"],
  ["heading2", "标题 H2"],
  ["heading3", "标题 H3"],
  ["bulletList", "无序列表"],
  ["orderedList", "有序列表"],
  ["blockquote", "引用"],
  ["codeBlock", "代码"],
];

const PLACEHOLDER = {
  paragraph: "写一段话 —— 一段一个重点，别超过 120 字",
  heading2: "小节标题",
  heading3: "更小的标题",
  bulletList: "一个要点",
  orderedList: "一步",
  blockquote: "引用一句话",
  codeBlock: "代码 / 命令",
};

/* ── doc ⇄ blocks ──────────────────────────────────────── */
function docToBlocks(doc) {
  const blocks = [];
  for (const node of doc?.content ?? []) {
    if (node.type === "heading") {
      blocks.push({ type: `heading${Math.min(3, node.level ?? 2)}`, html: inlineToHtml(node.content) });
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      for (const li of node.content ?? []) {
        const p = li.content?.[0] ?? li;
        blocks.push({ type: node.type, html: inlineToHtml(p.content) });
      }
    } else if (node.type === "blockquote" || node.type === "codeBlock") {
      blocks.push({ type: node.type, html: inlineToHtml(node.content) });
    } else if (node.type === "horizontalRule") {
      blocks.push({ type: "horizontalRule", html: "" });
    } else {
      blocks.push({ type: "paragraph", html: inlineToHtml(node.content) });
    }
  }
  if (!blocks.length) blocks.push({ type: "paragraph", html: "" });
  return blocks;
}

export function inlineToHtml(nodes) {
  return (nodes ?? [])
    .map((n) => {
      if (n.type !== "text") return "";
      let t = escapeHtml(n.text ?? "");
      const marks = n.marks ?? [];
      if (marks.some((m) => m.type === "bold")) t = `<b>${t}</b>`;
      if (marks.some((m) => m.type === "italic")) t = `<i>${t}</i>`;
      if (marks.some((m) => m.type === "underline")) t = `<u>${t}</u>`;
      if (marks.some((m) => m.type === "strike")) t = `<s>${t}</s>`;
      const link = marks.find((m) => m.type === "link");
      if (link?.attrs?.href) t = `<a href="${escapeHtml(link.attrs.href)}">${t}</a>`;
      return t;
    })
    .join("");
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function elToInline(el) {
  const out = [];
  const walk = (node, marks) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.nodeValue ?? "";
        if (!text) continue;
        const m = [...marks].map((type) => ({ type }));
        out.push(m.length ? { type: "text", text, marks: m } : { type: "text", text });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        const next = new Set(marks);
        if (tag === "b" || tag === "strong") next.add("bold");
        else if (tag === "i" || tag === "em") next.add("italic");
        else if (tag === "u") next.add("underline");
        else if (tag === "s" || tag === "strike" || tag === "del") next.add("strike");
        else if (tag === "a") {
          const href = child.getAttribute("href");
          const inner = [];
          const before = out.length;
          walk(child, next);
          if (href) {
            for (let i = before; i < out.length; i++) {
              out[i].marks = [...(out[i].marks ?? []), { type: "link", attrs: { href } }];
            }
          }
          continue;
        } else if (tag === "br") {
          out.push({ type: "text", text: "\n" });
          continue;
        }
        walk(child, next);
      }
    }
  };
  walk(el, new Set());
  return out;
}

function blocksToDoc(blocks) {
  const content = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === "bulletList" || b.type === "orderedList") {
      const items = [];
      while (i < blocks.length && blocks[i].type === b.type) {
        const inline = elToInline(blocks[i].el);
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: inline.length ? inline : [] }],
        });
        i++;
      }
      content.push({ type: b.type, content: items });
      continue;
    }
    if (b.type === "horizontalRule") {
      content.push({ type: "horizontalRule" });
      i++;
      continue;
    }
    const inline = elToInline(b.el);
    if (b.type.startsWith("heading")) {
      content.push({
        type: "heading",
        attrs: { level: Number(b.type.slice(7)) || 2 },
        content: inline,
      });
    } else {
      content.push({ type: b.type, content: inline });
    }
    i++;
  }
  if (!content.length) content.push({ type: "paragraph", content: [] });
  return { type: "doc", content };
}

/* ── 编辑器 ─────────────────────────────────────────────── */
export function richEditor({ value, onChange, placeholder = true, minHeight = 0 }) {
  const blocks = [];
  const body = h("div", { class: "rte__body" });

  const toolbar = h("div", { class: "rte__bar", role: "toolbar", "aria-label": "正文格式" });

  function makeBlock(data) {
    const el = h("div", {
      class: "rblk__body",
      contenteditable: "true",
      spellcheck: "false",
      "data-ph": placeholder ? PLACEHOLDER[data.type] ?? "" : "",
      html: data.html ?? "",
    });
    if (minHeight) el.style.minHeight = `${minHeight}px`;

    const gutter = h(
      "div",
      { class: "rblk__gutter" },
      h("button", { type: "button", title: "上移", "aria-label": "上移这一段", onclick: () => move(rec, -1) }, icon("arrowUp", 11)),
      h("button", { type: "button", title: "下移", "aria-label": "下移这一段", onclick: () => move(rec, 1) }, icon("arrowDown", 11)),
      h("button", { type: "button", title: "删除这一段", "aria-label": "删除这一段", onclick: () => removeBlock(rec) }, icon("x", 11)),
    );

    const rowEl = h(
      "div",
      { class: "rblk", "data-type": data.type, "data-level": data.type.startsWith("heading") ? data.type.slice(7) : null },
      gutter,
      el,
    );

    const rec = { type: data.type, el, rowEl };
    blocks.push(rec);

    el.addEventListener("input", fire);
    el.addEventListener("keydown", (e) => onKeyDown(e, rec));
    el.addEventListener("paste", (e) => {
      // 粘纯文本 —— 从别的网页粘过来会带一堆样式，把版面弄脏
      e.preventDefault();
      const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\r/g, "");
      const lines = text.split("\n");
      document.execCommand("insertText", false, lines[0] ?? "");
      for (const line of lines.slice(1)) {
        addBlock("paragraph", line, rec);
      }
    });
    return rowEl;
  }

  function fire() {
    onChange?.(blocksToDoc(blocks));
  }

  function onKeyDown(e, rec) {
    if (e.key === "Enter" && !e.shiftKey) {
      if (rec.type.startsWith("heading") || rec.type === "bulletList" || rec.type === "orderedList") {
        e.preventDefault();
        const next = rec.type.startsWith("heading") ? "paragraph" : rec.type;
        addBlock(next, "", rec);
      }
    }
    if (e.key === "Backspace" && !rec.el.textContent && blocks.length > 1) {
      e.preventDefault();
      const prev = blocks[blocks.indexOf(rec) - 1];
      removeBlock(rec, true);
      if (prev) {
        prev.el.focus();
        placeCaretEnd(prev.el);
      }
    }
    if (e.key === "ArrowUp" && e.altKey) {
      e.preventDefault();
      move(rec, -1);
    }
    if (e.key === "ArrowDown" && e.altKey) {
      e.preventDefault();
      move(rec, 1);
    }
  }

  function addBlock(type, text = "", after = null) {
    const data = { type, html: text ? escapeHtml(text) : "" };
    const el = makeBlock(data);
    if (after?.rowEl?.parentNode) after.rowEl.after(el);
    else body.appendChild(el);
    // 同步 blocks 顺序到 DOM 顺序
    reorderBlocksFromDom();
    el.focus();
    placeCaretEnd(el);
    fire();
    return el;
  }

  function removeBlock(rec, silent = false) {
    if (blocks.length <= 1) {
      rec.el.innerHTML = "";
      fire();
      return;
    }
    rec.rowEl.remove();
    const i = blocks.indexOf(rec);
    if (i >= 0) blocks.splice(i, 1);
    if (!silent) fire();
  }

  function move(rec, dir) {
    const i = blocks.indexOf(rec);
    const target = blocks[i + dir];
    if (!target) return;
    if (dir < 0) target.rowEl.before(rec.rowEl);
    else target.rowEl.after(rec.rowEl);
    blocks.splice(i, 1);
    blocks.splice(i + dir, 0, rec);
    fire();
    rec.el.focus();
  }

  function reorderBlocksFromDom() {
    const rows = [...body.querySelectorAll(".rblk")];
    const order = rows.map((row) => blocks.find((b) => b.rowEl === row)).filter(Boolean);
    blocks.length = 0;
    blocks.push(...order);
  }

  function setType(type) {
    const sel = window.getSelection();
    if (!sel?.anchorNode) return;
    const row = (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest(".rblk");
    const rec = blocks.find((b) => b.rowEl === row);
    if (!rec) return;
    rec.type = type;
    rec.rowEl.dataset.type = type;
    rec.rowEl.dataset.level = type.startsWith("heading") ? type.slice(7) : "";
    rec.el.dataset.ph = PLACEHOLDER[type] ?? "";
    fire();
  }

  /* 工具栏 */
  for (const [mark, label, title, cmd, style] of MARKS) {
    toolbar.appendChild(
      h("button", {
        class: "rte__btn",
        type: "button",
        title,
        "aria-label": title,
        style: { cssText: style },
        text: label,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => document.execCommand(cmd, false),
      }),
    );
  }
  toolbar.appendChild(h("span", { class: "sep" }));
  for (const [type, label] of BLOCK_TYPES) {
    toolbar.appendChild(
      h("button", {
        class: "rte__btn",
        type: "button",
        text: label,
        title: `设为${label}`,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => setType(type),
      }),
    );
  }
  toolbar.appendChild(h("span", { class: "sep" }));
  toolbar.appendChild(
    h("button", {
      class: "rte__btn",
      type: "button",
      title: "在末尾加一段",
      "aria-label": "加一段",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => addBlock("paragraph"),
    }, icon("plus", 13)),
  );

  const root = h("div", { class: "rte" }, toolbar, body);

  // 写入初值
  const initial = docToBlocks(value);
  for (const b of initial) {
    const data = { ...b };
    const el = makeBlock(data);
    body.appendChild(el);
  }
  reorderBlocksFromDom();

  root.__read = () => blocksToDoc(blocks);
  return root;
}

function placeCaretEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 只读渲染（校样、拆解视图、公众号侧栏用） */
export function richDocToHtml(doc) {
  const blocks = docToBlocks(doc);
  return blocks
    .map((b) => {
      const inner = b.html || "";
      if (b.type === "horizontalRule") return "<hr/>";
      if (b.type.startsWith("heading")) {
        const lv = b.type.slice(7);
        return `<h${lv}>${inner}</h${lv}>`;
      }
      if (b.type === "bulletList") return `<ul><li>${inner}</li></ul>`;
      if (b.type === "orderedList") return `<ol><li>${inner}</li></ol>`;
      if (b.type === "blockquote") return `<blockquote>${inner}</blockquote>`;
      if (b.type === "codeBlock") return `<pre><code>${inner}</code></pre>`;
      return `<p>${inner}</p>`;
    })
    .join("");
}

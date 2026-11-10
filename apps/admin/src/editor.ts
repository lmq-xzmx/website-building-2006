/**
 * 轻量富文本编辑器 —— 零依赖，产出 ProseMirror JSON。
 *
 * 为什么不用 Tiptap：
 *   后台是**零构建**的（一个 .ts + 原生 DOM，node 直接跑）。
 *   引 Tiptap 就要引 React + 打包链，把「启动快、部署简单」这个优势丢掉。
 *   等富文本需求真的复杂起来（协同编辑、表格、扩展市场）再换不迟 ——
 *   **存储格式是 ProseMirror JSON，换编辑器不换数据**。
 *
 * 能力（够用且不糊弄）：
 *   - 块类型：段落 / H2 / H3 / 无序列表 / 有序列表 / 引用 / 代码块 / 分割线
 *   - 行内标记：加粗 / 斜体 / 下划线 / 删除线
 *   - 块排序：上下移动
 *
 * 存储：与 Tiptap 完全兼容的 doc JSON：
 *   { type: "doc", content: [ { type: "paragraph", content: [ { type: "text", text, marks } ] } ] }
 *
 * 已知取舍：用的是 document.execCommand（已废弃但全浏览器支持）。
 *   它的好处是**不破坏 undo 栈**且零依赖；
 *   换成 Selection/Range API 要自己实现 undo，工作量大得多，不值。
 */

export interface EditorBlock {
  /** 块类型 */
  type:
    | "paragraph"
    | "heading"
    | "bulletList"
    | "orderedList"
    | "blockquote"
    | "codeBlock"
    | "horizontalRule";
  /** 标题级别（heading 用） */
  level?: number;
  /** 行内节点 */
  content?: Array<{
    type: "text";
    text: string;
    marks?: Array<{ type: string }>;
  }>;
}

/** 编辑器渲染的 HTML（一个函数，返回带初始值的 DOM 片段字符串） */
export function editorHtml(initial?: unknown): string {
  const doc = (initial ?? { type: "doc", content: [] }) as {
    type: "doc";
    content?: EditorBlock[];
  };
  const blocks = doc.content ?? [];

  const items = blocks
    .map((b, i) => {
      const text = (b.content ?? []).map((c) => c.text).join("");
      const type = b.type;
      const level = b.level ?? 2;
      return `
      <div class="eblock" data-type="${type}" data-level="${level}" data-i="${i}">
        <select class="eblock-type" title="块类型">
          ${Object.entries(BLOCK_LABEL)
            .map(
              ([k, v]) =>
                `<option value="${k}"${k === type ? " selected" : ""}>${v}</option>`,
            )
            .join("")}
        </select>
        <div class="eblock-body" contenteditable="true" spellcheck="false">${escapeText(text)}</div>
        <button type="button" class="eblock-move" data-dir="up" title="上移">↑</button>
        <button type="button" class="eblock-move" data-dir="down" title="下移">↓</button>
        <button type="button" class="eblock-del" title="删除">×</button>
      </div>`;
    })
    .join("");

  return `
  <div class="rte" data-rte="1">
    <div class="rte-toolbar">
      <button type="button" data-cmd="bold"><b>B</b></button>
      <button type="button" data-cmd="italic"><i>I</i></button>
      <button type="button" data-cmd="underline"><u>U</u></button>
      <button type="button" data-cmd="strikeThrough"><s>S</s></button>
      <span class="rte-sep"></span>
      <button type="button" data-block="paragraph">正文</button>
      <button type="button" data-block="heading">标题</button>
      <button type="button" data-block="bulletList">列表</button>
      <button type="button" data-block="blockquote">引用</button>
      <button type="button" data-block="codeBlock">代码</button>
      <span class="rte-sep"></span>
      <button type="button" data-add="paragraph">+ 段落</button>
    </div>
    <div class="rte-body">${items || '<div class="eblock" data-type="paragraph" data-level="2" data-i="0"><select class="eblock-type"></select><div class="eblock-body" contenteditable="true"></div></div>'}</div>
  </div>`;
}

const BLOCK_LABEL: Record<string, string> = {
  paragraph: "正文",
  heading: "标题",
  bulletList: "无序列表",
  orderedList: "有序列表",
  blockquote: "引用",
  codeBlock: "代码块",
  horizontalRule: "分割线",
};

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 编辑器的前端脚本 —— 挂在页面里，负责读写 ProseMirror JSON。
 *
 * 暴露的接口：
 *   window.__rte = {
 *     read(root): DocJSON,        // 从容器读出文档
 *     write(root, doc),           // 把文档写进容器
 *   }
 */
export const EDITOR_SCRIPT = `
(function () {
  const BLOCK_LABEL = ${JSON.stringify(BLOCK_LABEL)};

  function blocks(root) {
    return Array.from(root.querySelectorAll(".eblock"));
  }

  /** 从 contenteditable 读出行内节点与 mark */
  function readInline(el) {
    const out = [];
    function walk(node) {
      if (node.nodeType === 3) {
        if (node.nodeValue) out.push({ type: "text", text: node.nodeValue });
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      if (tag === "br") {
        out.push({ type: "text", text: "\\n" });
        return;
      }
      const mark = null;
      const marks = [];
      if (tag === "b" || tag === "strong") marks.push({ type: "bold" });
      else if (tag === "i" || tag === "em") marks.push({ type: "italic" });
      else if (tag === "u") marks.push({ type: "underline" });
      else if (tag === "s" || tag === "strike" || tag === "del") marks.push({ type: "strike" });

      const kids = Array.from(node.childNodes);
      if (!kids.length) return;
      // 先收集子节点内容，再套 mark
      const childOut = [];
      const savedPush = out.push.bind(out);
      out.length = 0;
      kids.forEach(walk);
      const inner = out.splice(0, out.length);
      inner.forEach((n) => {
        n.marks = (n.marks || []).concat(marks);
        childOut.push(n);
      });
      out.push.apply(out, childOut);
    }
    Array.from(el.childNodes).forEach(walk);
    return out;
  }

  function readBlock(el) {
    const type = el.dataset.type || "paragraph";
    const level = Number(el.dataset.level || 2);
    const body = el.querySelector(".eblock-body");
    const inline = body ? readInline(body) : [];
    if (type === "horizontalRule") return { type: "horizontalRule" };
    if (type === "bulletList" || type === "orderedList") {
      // 列表：每行一个 listItem
      const lines = inline.length
        ? inline.map((n) => n.text)
        : ((body && body.innerText) || "").split("\\n");
      const items = lines
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        }));
      if (!items.length) return { type: "paragraph", content: [] };
      return { type, content: items };
    }
    return { type, level: type === "heading" ? level : undefined, content: inline };
  }

  function read(root) {
    const content = blocks(root)
      .map(readBlock)
      .filter((b) => {
        if (b.type === "horizontalRule") return true;
        const t = (b.content || []).map((c) => c.text).join("");
        return t.trim().length > 0;
      });
    return { type: "doc", content };
  }

  function write(root, doc) {
    const body = root.querySelector(".rte-body");
    if (!body) return;
    const list = (doc && doc.content) || [];
    body.innerHTML = list
      .map((b, i) => {
        const type = b.type || "paragraph";
        const level = b.level || 2;
        let text = "";
        if (type === "bulletList" || type === "orderedList") {
          text = (b.content || [])
            .map((li) => (li.content || []).map((c) => c.text).join(""))
            .join("\\n");
        } else {
          text = (b.content || []).map((c) => c.text).join("");
        }
        const opts = Object.keys(BLOCK_LABEL)
          .map((k) => '<option value="' + k + '"' + (k === type ? " selected" : "") + ">" + BLOCK_LABEL[k] + "</option>")
          .join("");
        return (
          '<div class="eblock" data-type="' + type + '" data-level="' + level + '" data-i="' + i + '">' +
          '<select class="eblock-type">' + opts + "</select>" +
          '<div class="eblock-body" contenteditable="true" spellcheck="false"></div>' +
          '<button type="button" class="eblock-move" data-dir="up">↑</button>' +
          '<button type="button" class="eblock-move" data-dir="down">↓</button>' +
          '<button type="button" class="eblock-del">×</button>' +
          "</div>"
        );
      })
      .join("");
    // 内容用 textContent 写（避免 HTML 注入）
    body.querySelectorAll(".eblock").forEach((el, i) => {
      const b = list[i];
      if (!b) return;
      let text = "";
      if (b.type === "bulletList" || b.type === "orderedList") {
        text = (b.content || []).map((li) => (li.content || []).map((c) => c.text).join("")).join("\\n");
      } else {
        text = (b.content || []).map((c) => c.text).join("");
      }
      el.querySelector(".eblock-body").textContent = text;
    });
  }

  /** 新增一个块 */
  function addBlock(root, type, after) {
    const body = root.querySelector(".rte-body");
    if (!body) return;
    const el = document.createElement("div");
    el.className = "eblock";
    el.dataset.type = type || "paragraph";
    el.dataset.level = "2";
    el.innerHTML =
      '<select class="eblock-type">' +
      Object.keys(BLOCK_LABEL)
        .map((k) => '<option value="' + k + '"' + (k === type ? " selected" : "") + ">" + BLOCK_LABEL[k] + "</option>")
        .join("") +
      '</select><div class="eblock-body" contenteditable="true" spellcheck="false"></div>' +
      '<button type="button" class="eblock-move" data-dir="up">↑</button>' +
      '<button type="button" class="eblock-move" data-dir="down">↓</button>' +
      '<button type="button" class="eblock-del">×</button>';
    if (after && after.nextSibling) body.insertBefore(el, after.nextSibling);
    else body.appendChild(el);
    const b = el.querySelector(".eblock-body");
    if (b) b.focus();
  }

  document.addEventListener("click", function (e) {
    const t = e.target;
    const root = t.closest && t.closest(".rte");
    if (!root) return;

    // 行内命令
    const cmdBtn = t.closest("[data-cmd]");
    if (cmdBtn) {
      e.preventDefault();
      document.execCommand(cmdBtn.dataset.cmd, false, null);
      return;
    }

    // 块类型切换
    const blkBtn = t.closest("[data-block]");
    if (blkBtn) {
      e.preventDefault();
      const cur = root.querySelector(".eblock:focus .eblock-body") ||
        root.querySelector(".eblock-body");
      if (!cur) return;
      const el = cur.closest(".eblock");
      el.dataset.type = blkBtn.dataset.block;
      if (blkBtn.dataset.block === "heading") el.dataset.level = "2";
      cur.focus();
      return;
    }

    // 新增块
    const addBtn = t.closest("[data-add]");
    if (addBtn) {
      e.preventDefault();
      const body = root.querySelector(".rte-body");
      const last = body ? body.lastElementChild : null;
      addBlock(root, addBtn.dataset.add || "paragraph", last);
      return;
    }

    // 块类型下拉
    if (t.classList && t.classList.contains("eblock-type")) {
      const el = t.closest(".eblock");
      el.dataset.type = t.value;
      return;
    }

    // 上移 / 下移
    const mv = t.closest(".eblock-move");
    if (mv) {
      e.preventDefault();
      const el = mv.closest(".eblock");
      if (mv.dataset.dir === "up" && el.previousElementSibling) {
        el.parentNode.insertBefore(el, el.previousElementSibling);
      } else if (mv.dataset.dir === "down" && el.nextElementSibling) {
        el.parentNode.insertBefore(el.nextElementSibling, el);
      }
      return;
    }

    // 删除块
    const del = t.closest(".eblock-del");
    if (del) {
      e.preventDefault();
      const el = del.closest(".eblock");
      if (el) el.remove();
    }
  });

  window.__rte = { read, write };

  /** 生成编辑器容器 HTML（带初始内容） */
  window.__rteHtml = function (doc) {
    var list = (doc && doc.content) || [];
    var opts = Object.keys(BLOCK_LABEL)
      .map(function (k) {
        return '<option value="' + k + '">' + BLOCK_LABEL[k] + "</option>";
      })
      .join("");
    var blocks = list
      .map(function (b, i) {
        var type = b.type || "paragraph";
        var level = b.level || 2;
        return (
          '<div class="eblock" data-type="' + type + '" data-level="' + level + '" data-i="' + i + '">' +
          '<select class="eblock-type">' + opts + "</select>" +
          '<div class="eblock-body" contenteditable="true" spellcheck="false"></div>' +
          '<button type="button" class="eblock-move" data-dir="up">↑</button>' +
          '<button type="button" class="eblock-move" data-dir="down">↓</button>' +
          '<button type="button" class="eblock-del">×</button>' +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="rte" data-rte="1">' +
      '<div class="rte-toolbar">' +
      '<button type="button" data-cmd="bold"><b>B</b></button>' +
      '<button type="button" data-cmd="italic"><i>I</i></button>' +
      '<button type="button" data-cmd="underline"><u>U</u></button>' +
      '<button type="button" data-cmd="strikeThrough"><s>S</s></button>' +
      '<span class="rte-sep"></span>' +
      '<button type="button" data-block="paragraph">正文</button>' +
      '<button type="button" data-block="heading">标题</button>' +
      '<button type="button" data-block="bulletList">列表</button>' +
      '<button type="button" data-block="blockquote">引用</button>' +
      '<button type="button" data-block="codeBlock">代码</button>' +
      '<span class="rte-sep"></span>' +
      '<button type="button" data-add="paragraph">+ 段落</button>' +
      "</div>" +
      '<div class="rte-body">' +
      (blocks ||
        '<div class="eblock" data-type="paragraph" data-level="2" data-i="0">' +
          '<select class="eblock-type">' + opts + "</select>" +
          '<div class="eblock-body" contenteditable="true" spellcheck="false"></div>' +
          '<button type="button" class="eblock-move" data-dir="up">↑</button>' +
          '<button type="button" class="eblock-move" data-dir="down">↓</button>' +
          '<button type="button" class="eblock-del">×</button>' +
        "</div>") +
      "</div></div>"
    );
  };
})();
`;

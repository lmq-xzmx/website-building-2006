/**
 * 分发 —— 把站内内容排成公众号文章。
 *
 * 为什么不让人重新粘一遍正文：内容已经在模块里了，
 * 这里只做「换个皮肤输出」——服务端渲染，预览与复制走同一个接口，所见即所得。
 */

import { h, icon, mount, toast, empty } from "../lib/dom.js";
import * as store from "../lib/store.js";
import { api, ApiError } from "../lib/api.js";

const THEMES = [
  ["default", "简洁", "#576B95"],
  ["green", "微信绿", "#07C160"],
  ["blue", "商务蓝", "#1A73E8"],
  ["red", "政务红", "#C1272D"],
  ["sunset", "暖橙", "#E0703C"],
];

export function create() {
  const el = h("div", { class: "work" });
  const head = h("div", { class: "work__head" });
  const side = h("div", { class: "wc__side" });
  const paper = h("div", { class: "wc__paper wc__paper--empty" }, h("span", { text: "选一条内容开始" }));
  const stage = h("div", { class: "wc__stage" }, paper);

  let theme = "default";
  let title = "";
  let author = "";
  let html = "";
  let plain = "";
  let sourceItem = null;
  let busy = false;
  let lastError = "";

  el.append(
    h(
      "div",
      { class: "work__head" },
      h(
        "div",
        { class: "work__title" },
        h("h1", { text: "分发到公众号" }),
        h("p", { text: "同一份内容，换个皮肤粘进微信 —— 内联样式，不会被编辑器剥。" }),
      ),
      h(
        "div",
        { class: "work__actions" },
        h("button", {
          class: "btn btn--sm",
          type: "button",
          onclick: () => void copyRich(),
        }, icon("copy", 14), "复制富文本"),
        h("button", {
          class: "btn btn--ink btn--sm",
          type: "button",
          onclick: () => void copyPlain(),
        }, icon("text", 14), "复制纯文本"),
      ),
    ),
    h("div", { class: "wc" }, side, stage),
  );

  const sources = collectSources();

  function collectSources() {
    const out = [];
    for (const p of store.pages()) {
      for (const m of store.modulesOf(p)) {
        if (m.fragmentId) continue;
        for (const it of store.itemsOf(m)) {
          const hasBody = it.source === "manual" ? !!it.body : true;
          if (!hasBody) continue;
          if (!["rich-text", "hero", "faq"].includes(m.type) && !it.body) continue;
          out.push({ page: p, mod: m, item: it });
        }
      }
    }
    return out;
  }

  function paintSide() {
    if (!sources.length) {
      mount(
        side,
        empty({
          title: "还没有可排版的内容",
          text: "公众号文章从站内条目来 —— 先去内容区写一条富文本或问答。",
          mark: "send",
          action: h("button", {
            class: "btn btn--sm",
            type: "button",
            text: "去内容区",
            onclick: () => (location.hash = "#/content"),
          }),
        }),
      );
      return;
    }

    const sel = h(
      "select",
      {
        class: "select",
        onchange: (e) => {
          sourceItem = sources[Number(e.target.value)];
          title = title || sourceItem.item.title || "";
          paintSide();
          void render();
        },
      },
      ...sources.map((s, i) =>
        h("option", {
          value: String(i),
          selected: sourceItem === s,
          text: `${s.page.title} › ${s.item.title || s.item.question || "条目"}`,
        }),
      ),
    );
    if (!sourceItem) sourceItem = sources[0];

    mount(
      side,
      h(
        "div",
        { class: "field" },
        h("span", { class: "field__label", text: "内容来源" }),
        sel,
        h("span", {
          class: "form-note",
          text: `${sourceItem.mod.type} 模块 · ${sourceItem.item.source === "kb" ? "知识库正文" : "手写正文"}`,
        }),
      ),
      h(
        "div",
        { class: "field" },
        h("span", { class: "field__label", text: "文章标题" }),
        h("input", {
          class: "input",
          value: title,
          placeholder: "微信里单独填也可以",
          oninput: (e) => {
            title = e.target.value;
          },
          onchange: () => void render(),
        }),
      ),
      h(
        "div",
        { class: "field" },
        h("span", { class: "field__label", text: "作者 / 来源" }),
        h("input", {
          class: "input",
          value: author,
          placeholder: "例如：云枢科技",
          oninput: (e) => {
            author = e.target.value;
          },
          onchange: () => void render(),
        }),
      ),
      h(
        "div",
        { class: "field" },
        h("span", { class: "field__label", text: "排版主题" }),
        h(
          "div",
          { class: "theme-row" },
          ...THEMES.map(([id, label, color]) =>
            h(
              "button",
              {
                class: "theme-btn",
                type: "button",
                "aria-pressed": theme === id ? "true" : "false",
                onclick: () => {
                  theme = id;
                  paintSide();
                  void render();
                },
              },
              h("i", { style: { background: color } }),
              h("span", { text: label }),
            ),
          ),
        ),
      ),
      h(
        "p",
        { class: "form-note" },
        "微信编辑器会剥掉 <style> 与 class —— 所以导出的是带内联样式的 HTML。预览里看到什么样，粘进去就是什么样。",
      ),
      h(
        "div",
        { class: "hstack gap6" },
        h("button", {
          class: "btn btn--sm",
          type: "button",
          onclick: () => void render(true),
        }, icon("refresh", 13), "重新生成"),
        h("span", { class: "sp" }),
        h("span", { class: "muted mono", style: { fontSize: "11px" }, text: busy ? "生成中…" : `${plain.length} 字` }),
      ),
      lastError
        ? h("p", { class: "form-note", style: { borderLeftColor: "var(--stamp)", color: "var(--stamp)" }, text: lastError })
        : null,
    );
  }

  async function render(force = false) {
    if (!sourceItem) return;
    busy = true;
    paintSide();
    try {
      const doc = sourceItem.item.body ?? docFromText(sourceItem.item);
      const res = await api.wechat({ doc, title, author, theme });
      html = res.html ?? "";
      const plainRes = await api.wechat({ doc, plain: true });
      plain = plainRes.text ?? "";
      lastError = "";
      paper.classList.remove("wc__paper--empty");
      mount(paper, h("div", { html }));
    } catch (e) {
      lastError = e instanceof ApiError ? e.message : String(e);
      html = "";
      paper.classList.add("wc__paper--empty");
      mount(paper, h("span", { text: lastError }));
    } finally {
      busy = false;
      paintSide();
    }
  }

  function docFromText(item) {
    const text = item.answer || item.summary || item.title || "";
    return {
      type: "doc",
      content: text
        ? text.split(/\n{2,}/).map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] }))
        : [{ type: "paragraph", content: [] }],
    };
  }

  async function copyRich() {
    if (!html) {
      toast("先生成一次预览", { kind: "err" });
      return;
    }
    try {
      const blob = new Blob([html], { type: "text/html" });
      const plainBlob = new Blob([plain], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": blob, "text/plain": plainBlob }),
      ]);
      toast("已复制富文本 —— 粘进微信编辑器即可", { kind: "ok" });
    } catch {
      // 降级：选中预览区复制
      try {
        const range = document.createRange();
        range.selectNodeContents(paper);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("copy");
        toast("已复制（降级方式）", { kind: "ok" });
      } catch {
        toast("浏览器不允许写剪贴板 —— 手动选中预览区复制", { kind: "err" });
      }
    }
  }

  async function copyPlain() {
    if (!plain) {
      toast("先生成一次预览", { kind: "err" });
      return;
    }
    try {
      await navigator.clipboard.writeText(plain);
      toast("已复制纯文本", { kind: "ok" });
    } catch {
      toast("浏览器不允许写剪贴板", { kind: "err" });
    }
  }

  paintSide();
  void render();

  return {
    el,
    update(reason) {
      if (reason === "plan") {
        const before = sources.length;
        sources.splice(0, sources.length, ...collectSources());
        paintSide();
        if (before !== sources.length) void render();
      }
    },
  };
}

/**
 * 公众号排版面板 —— 把模块里的手工条目排成公众号文章。
 *
 * 为什么单独一个面板：
 *   公众号排版是**导出态**，不是编辑态 ——
 *   内容在模块面板里编辑，这里只负责「换个皮肤输出成能粘进微信的样子」。
 *
 * 核心能力：
 *   - 选排版主题（简洁 / 微信绿 / 商务蓝 / 政务红 / 暖橙）
 *   - 实时预览（就是最终粘出去的 HTML，所见即所得）
 *   - 一键复制富文本（带内联样式，微信编辑器认）
 *   - 一键复制纯文本（有些场景要）
 *
 * 为什么必须内联样式：
 *   微信编辑器会剥离 <style> 与 class，只保留 style 属性。
 *   网页上好看的类样式，粘过去会变成一团白 —— 所以导出必须自带样式。
 */

export const WECHAT_PANEL_HTML = `
<section id="wechatPane" class="wechat-pane" hidden>
  <aside class="wc-side">
    <div class="pane-head"><h2>排版</h2></div>
    <div class="pane-body" id="wcSide"></div>
  </aside>
  <div class="wc-preview-wrap">
    <div class="pane-head">
      <h2>预览（粘进微信就是这个样子）</h2><span class="sp"></span>
      <button id="wcCopyRich">复制富文本</button>
      <button id="wcCopyPlain">复制纯文本</button>
    </div>
    <div class="pane-body wc-preview" id="wcPreview"></div>
  </div>
</section>
`;

export const WECHAT_PANEL_CSS = `
.wechat-pane {
  flex: 1; display: grid; grid-template-columns: 320px 1fr;
  min-height: 0; overflow: hidden;
}
.wechat-pane[hidden] { display: none; }
.wechat-pane > aside {
  border-right: 1px solid var(--line);
  display: flex; flex-direction: column; min-height: 0;
}
.wc-side .pane-body { overflow-y: auto; padding: 10px 12px; flex: 1; }
.wc-preview-wrap { display: flex; flex-direction: column; min-height: 0; }
.wc-preview {
  overflow-y: auto; padding: 24px; flex: 1;
  background: #f5f6f8; display: flex; justify-content: center;
}
.wc-paper {
  background: #fff; width: 100%; max-width: 677px;   /* 微信正文宽度 */
  min-height: 200px; padding: 28px 24px;
  border-radius: 6px; box-shadow: 0 1px 8px rgba(0,0,0,.08);
}
.wc-field { margin-bottom: 12px; }
.wc-field label { font-size: 12px; color: var(--dim); display: block; margin-bottom: 4px; }
.wc-field input, .wc-field select, .wc-field textarea {
  width: 100%; box-sizing: border-box;
}
.wc-themes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.wc-theme-btn {
  padding: 8px 6px; font-size: 12px; text-align: left;
  display: flex; align-items: center; gap: 6px;
}
.wc-theme-btn .dot {
  width: 14px; height: 14px; border-radius: 4px; flex-shrink: 0;
}
.wc-theme-btn.on { border-color: var(--accent); background: var(--panel-2); }
.wc-sec { margin-bottom: 16px; }
.wc-sec h3 {
  font-size: 12px; margin: 0 0 8px; color: var(--accent);
  text-transform: uppercase; letter-spacing: .5px;
}
.wc-note {
  font-size: 11px; color: var(--dim); margin-top: 6px; line-height: 1.6;
}
`;

export const WECHAT_PANEL_SCRIPT = `
<script>
// ── 公众号排版状态 ──────────────────────────────────────
let wcTheme = "default";
let wcArticle = null;    // { title, author, doc }

const WC_THEMES = [
  { id: "default", label: "简洁", dot: "#576b95" },
  { id: "green", label: "微信绿", dot: "#07c160" },
  { id: "blue", label: "商务蓝", dot: "#1a73e8" },
  { id: "red", label: "政务红", dot: "#c9302c" },
  { id: "sunset", label: "暖橙", dot: "#e8684a" },
];

function wcEsc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** 取当前要排版的内容：优先当前选中的手工条目，否则取模块里的第一条 */
function wcCurrentArticle() {
  const item = (typeof curItem === "function") ? curItem() : null;
  if (item && item.source === "manual") return item;
  const mod = (typeof curModule === "function") ? curModule() : null;
  if (!mod) return null;
  const manual = (mod.items ?? []).find((i) => i.source === "manual");
  return manual ?? null;
}

function wcRenderSide() {
  const el = document.getElementById("wcSide");
  if (!el) return;
  const item = wcCurrentArticle();
  const mod = (typeof curModule === "function") ? curModule() : null;

  el.innerHTML =
    '<div class="wc-sec"><h3>来源</h3>' +
    (item
      ? '<div class="hint">模块：' + wcEsc(mod?.title || mod?.type || "") + "</div>" +
        '<div class="hint">条目：' + wcEsc(item.title || "(未命名)") + "</div>" +
        '<div class="hint">来源：' + (item.source === "kb" ? "知识库" : "手工创作") + "</div>" +
        (item.source === "kb"
          ? '<div class="wc-note">知识库来源的条目，正文来自知识库原文，排版只改样式不改字。</div>'
          : "")
      : '<div class="wc-note">先在「模块」视图里选中一个条目（手工创作的可改标题与作者）。</div>') +
    "</div>" +

    '<div class="wc-sec"><h3>文章信息</h3>' +
    '<div class="wc-field"><label>标题</label>' +
    '<input id="wcTitle" value="' + wcEsc(item?.title ?? "") + '" placeholder="公众号文章标题" /></div>' +
    '<div class="wc-field"><label>作者 / 署名</label>' +
    '<input id="wcAuthor" value="" placeholder="选填" /></div>' +
    "</div>" +

    '<div class="wc-sec"><h3>排版主题</h3><div class="wc-themes">' +
    WC_THEMES.map((t) =>
      '<button class="wc-theme-btn' + (t.id === wcTheme ? " on" : "") + '" data-wctheme="' + t.id + '">' +
      '<span class="dot" style="background:' + t.dot + '"></span>' + t.label + "</button>").join("") +
    "</div>" +
    '<div class="wc-note">主题只改字号、颜色、间距与引用样式 —— <b>内容一字不改</b>，' +
    "保证 AI 引用的是原文。</div></div>" +

    '<div class="wc-sec"><h3>导出</h3>' +
    '<div class="wc-note">「复制富文本」生成的是<b>内联样式</b>的 HTML —— ' +
    "微信编辑器会剥离 class 与 &lt;style&gt;，只有内联样式能留住。" +
    "粘进微信编辑器后仍可在微信里改。</div></div>";
}

function wcRenderPreview() {
  const el = document.getElementById("wcPreview");
  if (!el) return;
  const item = wcCurrentArticle();
  if (!item) {
    el.innerHTML = '<div class="wc-paper"><div class="empty">选中一个条目后显示预览</div></div>';
    return;
  }
  const title = document.getElementById("wcTitle")?.value ?? item.title ?? "";
  const author = document.getElementById("wcAuthor")?.value ?? "";
  wcRenderPreviewAsync(item, title, author);
}

/**
 * 预览走服务端 —— 排版逻辑只有一份（geo-kit），浏览器端不重复实现。
 * 本地网络很快，防抖 200ms 足够。
 */
let wcPreviewTimer = null;
function wcRenderPreviewAsync(item, title, author) {
  if (wcPreviewTimer) clearTimeout(wcPreviewTimer);
  wcPreviewTimer = setTimeout(async () => {
    try {
      const r = await fetch("/api/wechat/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: item.body, title, author, theme: wcTheme }),
      });
      const d = await r.json();
      const el = document.getElementById("wcPreview");
      if (!el) return;
      if (d.error) {
        el.innerHTML = '<div class="wc-paper"><div class="empty">' + wcEsc(d.error) + "</div></div>";
        return;
      }
      el.innerHTML = '<div class="wc-paper">' + d.html + "</div>";
    } catch (e) {
      const el = document.getElementById("wcPreview");
      if (el) el.innerHTML = '<div class="wc-paper"><div class="empty">预览失败</div></div>';
    }
  }, 200);
}

function bindWechatPanel() {
  const side = document.getElementById("wcSide");
  if (!side) return;

  side.addEventListener("click", (e) => {
    const b = e.target.closest("[data-wctheme]");
    if (!b) return;
    wcTheme = b.dataset.wctheme;
    wcRenderSide();
    wcRenderPreview();
  });

  side.addEventListener("input", (e) => {
    if (e.target.id === "wcTitle" || e.target.id === "wcAuthor") wcRenderPreview();
  });

  document.getElementById("wcCopyRich")?.addEventListener("click", async () => {
    const item = wcCurrentArticle();
    if (!item) { toast("先选一个条目", true); return; }
    const title = document.getElementById("wcTitle")?.value ?? item.title ?? "";
    const author = document.getElementById("wcAuthor")?.value ?? "";
    const r = await fetch("/api/wechat/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc: item.body, title, author, theme: wcTheme, bare: true }),
    });
    const d = await r.json();
    if (d.error) { toast(d.error, true); return; }
    const ok = await copyText(d.html, "text/html");
    toast(ok ? "已复制富文本 —— 粘进微信编辑器" : "复制失败，请手动选中", !ok);
  });

  document.getElementById("wcCopyPlain")?.addEventListener("click", async () => {
    const item = wcCurrentArticle();
    if (!item) { toast("先选一个条目", true); return; }
    const r = await fetch("/api/wechat/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc: item.body, plain: true }),
    });
    const d = await r.json();
    if (d.error) { toast(d.error, true); return; }
    const ok = await copyText(d.text ?? "", "text/plain");
    toast(ok ? "已复制纯文本" : "复制失败，请手动选中", !ok);
  });
}

/**
 * 复制到剪贴板 —— 优先 Clipboard API，失败退回 execCommand。
 */
async function copyText(text, mime) {
  try {
    if (mime === "text/html" && navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        "text/html": new Blob([text], { type: "text/html" }),
        "text/plain": new Blob([text.replace(/<[^>]+>/g, "")], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // 退回老办法
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e2) {
      return false;
    }
  }
}
</script>
`;

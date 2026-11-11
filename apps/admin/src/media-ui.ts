/**
 * 媒体库面板 —— 图片等静态资源的统一管理。
 *
 * 为什么要有：
 *   没有媒体库时，案例卡片/产品图只能填**外链 URL** ——
 *   客户改了图要去别处改、外链挂了页面就空图、换 CDN 要逐条改。
 *
 * 能力：
 *   - 拖拽 / 选择上传（前端转 base64，走 JSON 接口）
 *   - 列表浏览、按分类过滤
 *   - 改 alt / 说明 / 分类
 *   - 复制引用路径（直接粘到条目的图片字段）
 *   - 删除
 *
 * alt 文本在上传时提示必填 —— 图片缺 alt 是可访问性与 SEO 的硬伤，
 * 而 AI 引擎读站时也把 alt 当图片的语义说明。
 */

export const MEDIA_PANEL_HTML = `
<section id="mediaPane" class="media-pane" hidden>
  <div class="pane-head">
    <h2>媒体库</h2><span class="sp"></span>
    <input type="search" id="mediaQ" placeholder="搜索文件名 / alt / 分类…" style="min-width:200px" />
    <select id="mediaCat"><option value="">全部分类</option></select>
    <button id="mediaUpload">+ 上传图片</button>
    <input type="file" id="mediaFile" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif" multiple hidden />
  </div>
  <div class="pane-body media-grid" id="mediaGrid"></div>
</section>
`;

export const MEDIA_PANEL_CSS = `
.media-pane {
  flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;
}
.media-pane[hidden] { display: none; }
.media-grid {
  overflow-y: auto; padding: 14px; flex: 1;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px; align-content: start;
}
.mcard {
  border: 1px solid var(--line-soft); border-radius: var(--radius);
  background: var(--panel); overflow: hidden; display: flex; flex-direction: column;
  box-shadow: var(--shadow-sm); transition: border-color .15s, transform .12s, box-shadow .15s;
}
.mcard:hover { border-color: var(--line-strong); transform: translateY(-2px); box-shadow: var(--shadow-md); }
.mcard .thumb {
  height: 120px; background: var(--panel-2);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.mcard .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
.mcard .meta { padding: 7px 9px; }
.mcard .meta .fn {
  font-size: 12px; font-weight: 500; margin-bottom: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mcard .meta .alt {
  font-size: 11px; color: var(--dim); margin-bottom: 5px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.mcard .meta .alt.missing { color: var(--warn); }
.mcard .meta .row2 { display: flex; gap: 4px; flex-wrap: wrap; }
.mcard .meta button { padding: 2px 7px; font-size: 11px; }
.mcard .meta input {
  width: 100%; box-sizing: border-box; font-size: 11px; padding: 3px 6px;
  margin-bottom: 5px;
}
.drop-hint {
  border: 2px dashed var(--line); border-radius: var(--radius);
  padding: 30px; text-align: center; color: var(--dim); grid-column: 1 / -1;
  font-size: 13px;
}
.drop-hint.on { border-color: var(--accent); color: var(--accent); }
`;

export const MEDIA_PANEL_SCRIPT = `
<script>
// ── 媒体库状态 ──────────────────────────────────────────
let mediaAssets = [];
let mediaFilter = { q: "", cat: "" };

function mdEsc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtSize(n) {
  if (!n) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

async function loadMedia() {
  if (!siteId) return;
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/media");
  const d = await r.json();
  mediaAssets = d.assets ?? [];
  // 模块面板的图片选择器也要用媒体库数据 —— 挂到全局供那边读
  // （每次刷新都同步一次 —— 数组是整体替换的，指针会失效）
  window.mediaAssets = mediaAssets;
  renderMedia();
}

function renderMedia() {
  const grid = document.getElementById("mediaGrid");
  if (!grid) return;

  // 分类下拉
  const cats = [...new Set(mediaAssets.map((a) => a.category).filter(Boolean))];
  const sel = document.getElementById("mediaCat");
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">全部分类</option>' +
      cats.map((c) => '<option value="' + mdEsc(c) + '">' + mdEsc(c) + "</option>").join("");
    sel.value = cur;
  }

  const q = mediaFilter.q.toLowerCase();
  const list = mediaAssets.filter((a) => {
    if (mediaFilter.cat && a.category !== mediaFilter.cat) return false;
    if (!q) return true;
    return ((a.filename ?? "") + " " + (a.alt ?? "") + " " + (a.category ?? ""))
      .toLowerCase().includes(q);
  });

  if (!mediaAssets.length) {
    grid.innerHTML = '<div class="drop-hint" id="mediaDrop">' +
      "还没有图片<br/>点右上「+ 上传图片」，或把文件拖到这里<br/>" +
      '<span style="font-size:11px">支持 PNG / JPG / WebP / GIF / SVG / AVIF，单个 ≤8MB</span></div>';
    bindDrop();
    return;
  }

  if (!list.length) {
    grid.innerHTML = '<div class="drop-hint">没有匹配的图片</div>';
    return;
  }

  grid.innerHTML = list.map((a) =>
    '<div class="mcard" data-media="' + mdEsc(a.id) + '">' +
      '<div class="thumb">' +
        '<img src="' + mdEsc(a.url) + '" alt="' + mdEsc(a.alt) + '" loading="lazy" />' +
      "</div>" +
      '<div class="meta">' +
        '<div class="fn" title="' + mdEsc(a.filename) + '">' + mdEsc(a.filename) + "</div>" +
        '<div class="alt' + (a.alt ? "" : " missing") + '">' +
          (a.alt ? mdEsc(a.alt) : "⚠ 缺替代文本（alt）—— 影响可访问性与 SEO") +
        "</div>" +
        '<input data-malt="' + mdEsc(a.id) + '" placeholder="替代文本（alt）" value="' + mdEsc(a.alt ?? "") + '" />' +
        '<div class="row2">' +
          '<button data-mcopy="' + mdEsc(a.id) + '">复制路径</button>' +
          '<button data-msub="' + mdEsc(a.id) + '">保存</button>' +
          '<button data-mdel="' + mdEsc(a.id) + '">删除</button>' +
        "</div>" +
        '<div style="font-size:10px;color:var(--dim);margin-top:4px">' +
          fmtSize(a.size) + (a.category ? " · " + mdEsc(a.category) : "") +
        "</div>" +
      "</div>" +
    "</div>").join("");
}

// ── 上传 ────────────────────────────────────────────────

/**
 * 上传单个文件。
 *
 * 走 base64 + JSON 而不是 multipart ——
 * 后台是无依赖的原生 Node http，解析 multipart 要引包；
 * base64 用 FileReader 就能做，且图片体积下完全够用。
 */
async function uploadFile(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("读取文件失败"));
    fr.readAsDataURL(file);
  });

  // alt 先留空 —— 上传后可以补。校验会提示但不拦（硬拦会让批量上传很难用）
  const r = await fetch("/api/sites/" + encodeURIComponent(siteId) + "/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mime: file.type,
      data: dataUrl,
      alt: "",
    }),
  });
  const d = await r.json();
  if (d.error) {
    toast(file.name + "：" + d.error, true);
    return false;
  }
  return true;
}

async function uploadFiles(files) {
  if (!siteId) { toast("先选站点", true); return; }
  let ok = 0;
  for (const f of files) {
    if (await uploadFile(f)) ok++;
  }
  await loadMedia();
  toast("已上传 " + ok + " 个文件");
}

function bindDrop() {
  const hint = document.getElementById("mediaDrop");
  if (!hint) return;
  hint.addEventListener("dragover", (e) => {
    e.preventDefault();
    hint.classList.add("on");
  });
  hint.addEventListener("dragleave", () => hint.classList.remove("on"));
  hint.addEventListener("drop", (e) => {
    e.preventDefault();
    hint.classList.remove("on");
    uploadFiles(Array.from(e.dataTransfer.files ?? []));
  });
}

function bindMediaPanel() {
  const fileInput = document.getElementById("mediaFile");
  document.getElementById("mediaUpload")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", () => {
    uploadFiles(Array.from(fileInput.files ?? []));
    fileInput.value = "";
  });

  document.getElementById("mediaQ")?.addEventListener("input", (e) => {
    mediaFilter.q = e.target.value;
    renderMedia();
  });
  document.getElementById("mediaCat")?.addEventListener("change", (e) => {
    mediaFilter.cat = e.target.value;
    renderMedia();
  });

  const grid = document.getElementById("mediaGrid");
  if (!grid) return;

  grid.addEventListener("click", async (e) => {
    const t = e.target;
    const copyId = t.dataset?.mcopy;
    const subId = t.dataset?.msub;
    const delId = t.dataset?.mdel;

    if (copyId) {
      const a = mediaAssets.find((x) => x.id === copyId);
      if (!a) return;
      try {
        await navigator.clipboard.writeText(a.url);
        toast("已复制：" + a.url);
      } catch {
        prompt("复制这个路径：", a.url);
      }
      return;
    }

    if (subId) {
      const a = mediaAssets.find((x) => x.id === subId);
      if (!a) return;
      const input = grid.querySelector('[data-malt="' + subId + '"]');
      const alt = input ? input.value.trim() : a.alt;
      const r = await fetch(
        "/api/sites/" + encodeURIComponent(siteId) + "/media/" + encodeURIComponent(subId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alt }),
        },
      );
      const d = await r.json();
      if (d.error) { toast(d.error, true); return; }
      toast("已保存");
      await loadMedia();
      return;
    }

    if (delId) {
      const a = mediaAssets.find((x) => x.id === delId);
      if (!a) return;
      if (!confirm("删除图片「" + a.filename + "」？\\n引用了它的位置会变成空图")) return;
      const r = await fetch(
        "/api/sites/" + encodeURIComponent(siteId) + "/media/" + encodeURIComponent(delId),
        { method: "DELETE" },
      );
      const d = await r.json();
      if (d.error) { toast(d.error, true); return; }
      toast("已删除");
      await loadMedia();
    }
  });
}
</script>
`;

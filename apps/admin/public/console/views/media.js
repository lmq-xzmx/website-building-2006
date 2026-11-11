/**
 * 素材 —— 图片资产。
 *
 * 旧界面把上传、列表、改 alt 挤在一栏，且删除用原生 confirm。
 * 这里按「先看、再改、再删」排：网格在前，字段就地可改，删除有明确的后果说明。
 */

import { h, icon, mount, toast, dialog, empty, bytes, debounce } from "../lib/dom.js";
import * as store from "../lib/store.js";
import { api, ApiError, mediaUrl } from "../lib/api.js";

const CATEGORIES = ["全部", "产品图", "案例图", "团队", "资质", "其它"];

export function create() {
  const el = h("div", { class: "work" });
  const head = h("div", { class: "work__head" });
  const bar = h("div", { class: "media-bar" });
  const grid = h("div", { class: "media-grid" });
  const fileInput = h("input", {
    type: "file",
    accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif",
    multiple: true,
    class: "hidden",
    onchange: (e) => void uploadFiles([...e.target.files]),
  });

  let assets = [];
  let loading = true;
  let error = "";
  let q = "";
  let cat = "全部";
  let uploading = 0;

  el.append(head, bar, h("div", { class: "work__body" }, grid), fileInput);

  mount(
    head,
    h(
      "div",
      { class: "work__title" },
      h("h1", { text: "素材" }),
      h("p", { text: "图片进站点之前先过这一道：替代文本、尺寸、引用路径。" }),
    ),
    h(
      "div",
      { class: "work__actions" },
      h("button", {
        class: "btn btn--ink btn--sm",
        type: "button",
        onclick: () => fileInput.click(),
      }, icon("upload", 14), "上传图片"),
    ),
  );

  const search = h("input", {
    class: "input",
    placeholder: "搜文件名 / 替代文本 / 分类",
    style: { maxWidth: "280px" },
    oninput: debounce((e) => {
      q = e.target.value.trim().toLowerCase();
      paintGrid();
    }, 120),
  });

  mount(
    bar,
    h("div", { class: "search" }, icon("search", 14), search),
    h(
      "div",
      { class: "chips" },
      ...CATEGORIES.map((c) =>
        h("button", {
          class: "chip",
          type: "button",
          "data-on": c === cat ? "1" : null,
          style: c === cat ? { borderColor: "var(--ink)", boxShadow: "inset 0 0 0 1px var(--ink)" } : null,
          text: c,
          onclick: () => {
            cat = c;
            paintBar();
            paintGrid();
          },
        }),
      ),
    ),
    h("span", { class: "sp" }),
    h("span", { class: "muted", style: { fontSize: "11.5px" } }, `${assets.length} 张 · 单张 ≤ 8MB`),
  );

  function paintBar() {
    // 分类按钮的选中态
    bar.querySelectorAll(".chip").forEach((b) => {
      const on = b.textContent === cat;
      b.dataset.on = on ? "1" : "";
      b.style.borderColor = on ? "var(--ink)" : "";
      b.style.boxShadow = on ? "inset 0 0 0 1px var(--ink)" : "";
    });
  }

  function paintGrid() {
    if (loading) {
      mount(grid, h("div", { class: "skel", style: { height: "180px" } }), h("div", { class: "skel", style: { height: "180px" } }));
      return;
    }
    if (error) {
      mount(grid, empty({ title: "读不到素材库", text: error, mark: "alert" }));
      return;
    }

    const list = assets.filter((a) => {
      if (cat !== "全部" && (a.category ?? "其它") !== cat) return false;
      if (!q) return true;
      return `${a.filename} ${a.alt ?? ""} ${a.category ?? ""}`.toLowerCase().includes(q);
    });

    const drop = h(
      "div",
      {
        class: "dropzone",
        style: { gridColumn: "1 / -1", padding: uploading ? "20px" : "26px" },
        ondragover: (e) => {
          e.preventDefault();
          drop.classList.add("dropzone--over");
        },
        ondragleave: () => drop.classList.remove("dropzone--over"),
        ondrop: (e) => {
          e.preventDefault();
          drop.classList.remove("dropzone--over");
          const files = [...(e.dataTransfer?.files ?? [])];
          if (files.length) void uploadFiles(files);
        },
        onclick: () => fileInput.click(),
      },
      h(
        "div",
        { class: "hstack gap8", style: { justifyContent: "center" } },
        icon(uploading ? "refresh" : "upload", 16),
        h("span", {
          text: uploading ? `正在上传 ${uploading} 张…` : "把图片拖到这里，或点击选择（可多选）",
        }),
      ),
      h("div", {
        class: "muted",
        style: { fontSize: "11px", marginTop: "6px" },
        text: "PNG / JPG / WebP / GIF / SVG / AVIF · 单张 ≤ 8MB · 替代文本可后补",
      }),
    );

    if (!list.length) {
      mount(
        grid,
        drop,
        h(
          "div",
          { style: { gridColumn: "1 / -1" } },
          empty({
            title: q || cat !== "全部" ? "没有匹配的图片" : "素材库是空的",
            text: q || cat !== "全部" ? "换个关键词或分类。" : "上传第一张图，案例卡片和产品图就有落脚点了。",
            mark: "image",
          }),
        ),
      );
      return;
    }

    mount(
      grid,
      drop,
      ...list.map((a) => assetCard(a)),
    );
  }

  function assetCard(a) {
    const altInput = h("input", {
      class: "input",
      value: a.alt ?? "",
      placeholder: "缺替代文本",
      "aria-label": "替代文本",
      style: { height: "26px", fontSize: "12px", borderColor: a.alt ? "" : "var(--stamp)" },
      onchange: async (e) => {
        const alt = e.target.value.trim();
        try {
          await api.patchMedia(store.state.siteId, a.id, { alt });
          a.alt = alt;
          e.target.style.borderColor = alt ? "" : "var(--stamp)";
          toast("替代文本已保存", { kind: "ok", timeout: 1400 });
        } catch (err) {
          toast(err instanceof ApiError ? err.message : String(err), { kind: "err" });
        }
      },
    });

    return h(
      "article",
      { class: "asset" },
      h(
        "div",
        { class: "asset__img" },
        h("img", { src: mediaUrl(store.state.siteId, a.url), alt: a.alt || a.filename, loading: "lazy" }),
      ),
      h(
        "div",
        { class: "asset__body" },
        h(
          "div",
          { class: "hstack gap6" },
          h("span", { class: "asset__name", text: a.filename, title: a.filename }),
          h("span", { class: "sp" }),
          h("span", { class: "muted mono", style: { fontSize: "10.5px" }, text: bytes(a.size) }),
        ),
        altInput,
        h(
          "div",
          { class: "hstack gap4" },
          h("span", { class: `tag ${a.alt ? "" : "tag--err"}`, text: a.alt ? "可访问" : "缺 alt" }),
          a.category ? h("span", { class: "tag", text: a.category }) : null,
        ),
        h(
          "div",
          { class: "asset__tools" },
          h("button", {
            class: "btn btn--ghost btn--sm",
            type: "button",
            text: "复制路径",
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(a.url);
                toast(`已复制 ${a.url}`, { kind: "ok", timeout: 1600 });
              } catch {
                toast(`路径：${a.url}`, { timeout: 4000 });
              }
            },
          }),
          h("button", {
            class: "btn btn--ghost btn--sm",
            type: "button",
            text: "分类",
            onclick: () => changeCategory(a),
          }),
          h("button", {
            class: "btn btn--ghost btn--sm",
            type: "button",
            text: "删除",
            onclick: () => confirmDelete(a),
          }),
        ),
      ),
    );
  }

  function changeCategory(a) {
    const sel = h(
      "select",
      { class: "select" },
      ...CATEGORIES.filter((c) => c !== "全部").map((c) =>
        h("option", { value: c, selected: (a.category ?? "其它") === c, text: c }),
      ),
    );
    dialog({
      title: "归到哪一类",
      body: sel,
      confirmLabel: "保存",
      onConfirm: async () => {
        try {
          await api.patchMedia(store.state.siteId, a.id, { category: sel.value });
          a.category = sel.value;
          paintGrid();
        } catch (e) {
          toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
        }
      },
    });
  }

  function confirmDelete(a) {
    const used = usageOf(a.url);
    dialog({
      title: `删除「${a.filename}」？`,
      body: used.length
        ? `有 ${used.length} 处内容在用它（${used.slice(0, 3).join("、")}）。删除后那些位置会变成空图。`
        : "这张图没有被任何内容引用。",
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => {
        try {
          await api.delMedia(store.state.siteId, a.id);
          assets = assets.filter((x) => x.id !== a.id);
          paintGrid();
          toast("已删除", { kind: "ok" });
        } catch (e) {
          toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
        }
      },
    });
  }

  /** 站内谁在引用这张图 —— 删除前必须知道 */
  function usageOf(url) {
    const out = [];
    for (const p of store.pages()) {
      for (const m of store.modulesOf(p)) {
        for (const it of store.itemsOf(m)) {
          if (it.image === url) out.push(`${p.title} › ${it.title ?? "条目"}`);
        }
      }
    }
    return out;
  }

  async function uploadFiles(files) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      toast("只收图片文件", { kind: "err" });
      return;
    }
    uploading = images.length;
    paintGrid();
    let ok = 0;
    for (const f of images) {
      try {
        const data = await readBase64(f);
        await api.uploadMedia(store.state.siteId, {
          filename: f.name,
          mime: f.type,
          data,
          alt: "",
        });
        ok++;
      } catch (e) {
        toast(`${f.name}：${e instanceof ApiError ? e.message : String(e)}`, { kind: "err", timeout: 5000 });
      } finally {
        uploading--;
        paintGrid();
      }
    }
    if (ok) {
      toast(`已上传 ${ok} 张 —— 记得补替代文本`, { kind: "ok" });
      await load();
    }
    uploading = 0;
    fileInput.value = "";
  }

  function readBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("读取文件失败"));
      r.readAsDataURL(file);
    });
  }

  async function load() {
    loading = true;
    error = "";
    paintGrid();
    try {
      const d = await api.media(store.state.siteId);
      assets = d.assets ?? d.media?.assets ?? [];
    } catch (e) {
      error = e instanceof ApiError ? e.message : String(e);
    } finally {
      loading = false;
      paintBar();
      paintGrid();
    }
  }

  load();

  return {
    el,
    update(reason) {
      if (reason === "plan") paintGrid();
    },
  };
}

/**
 * 两个选择器 —— 图片与知识条目。
 *
 * 都用抽屉：选择是「在别的素材里挑一件」，不该把当前页面的表单顶掉。
 */

import { h, icon, drawer, toast, empty, loadingRows, debounce } from "./dom.js";
import { api, ApiError, mediaUrl } from "./api.js";
import * as store from "./store.js";

/* ── 图片 ───────────────────────────────────────────────── */
export async function openImagePicker({ siteId, onPick, current = "" }) {
  const grid = h("div", { class: "media-grid", style: { padding: "14px" } });
  const urlInput = h("input", { class: "input", placeholder: "或直接粘贴图片地址 https://…", value: current });
  let assets = [];

  const body = h(
    "div",
    { class: "stack" },
    h(
      "div",
      { style: { padding: "12px 14px", borderBottom: "1px solid var(--rule)" } },
      h("div", { class: "field" }, h("span", { class: "field__label", text: "外链地址" }), urlInput),
      h(
        "div",
        { class: "hstack gap8", style: { marginTop: "8px" } },
        h("button", {
          class: "btn btn--sm",
          type: "button",
          text: "使用这个地址",
          onclick: () => {
            const v = urlInput.value.trim();
            if (!v) return;
            onPick(v);
            d.close();
          },
        }),
        h("span", { class: "muted", style: { fontSize: "11px" }, text: "素材库里的图片用站内路径，换 CDN 时不用逐条改。" }),
      ),
    ),
    grid,
  );

  const d = drawer({ title: "选一张图片", subtitle: "来自本站素材库", body, width: "620px" });
  grid.appendChild(loadingRows(4));

  try {
    const res = await api.media(siteId);
    assets = res.assets ?? res.media?.assets ?? [];
    grid.replaceChildren();
    if (!assets.length) {
      grid.appendChild(
        empty({
          title: "素材库还是空的",
          text: "去「素材」上传第一张图，或在上面直接贴一个外链地址。",
          mark: "image",
        }),
      );
    }
    for (const a of assets) {
      grid.appendChild(
        h(
          "button",
          {
            class: "asset",
            type: "button",
            style: { cursor: "pointer", textAlign: "left" },
            onclick: () => {
              onPick(a.url);
              d.close();
              toast(`已选用 ${a.filename}`, { kind: "ok", timeout: 1400 });
            },
          },
          h(
            "div",
            { class: "asset__img" },
            h("img", { src: mediaUrl(siteId, a.url), alt: a.alt || a.filename, loading: "lazy" }),
          ),
          h(
            "div",
            { class: "asset__body" },
            h("div", { class: "asset__name", text: a.filename }),
            h(
              "div",
              { class: `asset__alt ${a.alt ? "" : "miss"}`, text: a.alt || "缺替代文本" },
            ),
          ),
        ),
      );
    }
  } catch (e) {
    grid.replaceChildren(
      h("div", { class: "empty" }, h("p", { text: e instanceof ApiError ? e.message : String(e) })),
    );
  }
}

/* ── 知识条目 ───────────────────────────────────────────── */
export function openKbPicker({ onPick, moduleId }) {
  const list = h("div", { class: "stack", style: { padding: "6px" } });
  const used = store.usedKbIds();
  let q = "";
  let base = store.state.kbId || "";

  const search = h("input", {
    class: "input",
    placeholder: "搜标题 / 摘要 / 标签",
    oninput: debounce((e) => {
      q = e.target.value.trim().toLowerCase();
      paint();
    }, 140),
  });

  const baseSel = h(
    "select",
    {
      class: "select",
      onchange: (e) => {
        base = e.target.value;
        paint();
      },
    },
    h("option", { value: "", text: "全部库" }),
    ...store.state.kb.bases.map((b) => h("option", { value: b.id, text: b.name, selected: b.id === base })),
  );

  const foot = h(
    "div",
    { class: "hstack gap8", style: { width: "100%" } },
    h("span", { class: "muted", style: { fontSize: "11px" }, text: "引用不会复制正文 —— 知识库改了，这里跟着改。" }),
    h("span", { class: "sp" }),
    h("button", {
      class: "btn btn--ghost btn--sm",
      type: "button",
      text: "刷新",
      onclick: async () => {
        await store.loadKb({ force: true });
        paint();
        toast("知识库已刷新");
      },
    }),
  );

  const body = h(
    "div",
    { class: "stack" },
    h(
      "div",
      { style: { padding: "12px 14px", borderBottom: "1px solid var(--rule)", display: "grid", gap: "8px" } },
      search,
      baseSel,
    ),
    list,
  );

  drawer({
    title: "从知识库引用",
    subtitle: moduleId ? "引用到当前模块" : "先选一个模块，否则会引用到当前页最后一个模块",
    body,
    foot,
    width: "640px",
  });

  function paint() {
    const items = store.state.kb.items.filter((i) => {
      if (base && i.kb_id !== base) return false;
      if (!q) return true;
      return `${i.title} ${i.summary ?? ""} ${(i.tags ?? []).join(" ")}`.toLowerCase().includes(q);
    });
    if (store.state.kb.loading) {
      list.replaceChildren(loadingRows(5));
      return;
    }
    if (store.state.kb.error) {
      list.replaceChildren(
        empty({
          title: "知识库连不上",
          text: store.state.kb.error + "。后台仍然可以手工创作内容。",
          mark: "alert",
        }),
      );
      return;
    }
    if (!items.length) {
      list.replaceChildren(
        empty({ title: "没有匹配的条目", text: "换个关键词，或切换知识库。", mark: "search" }),
      );
      return;
    }
    list.replaceChildren(
      ...items.map((it) =>
        h(
          "div",
          {
            class: "row",
            style: {
              display: "flex",
              gap: "10px",
              alignItems: "flex-start",
              padding: "9px 11px",
              borderBottom: "1px solid var(--rule-soft)",
            },
          },
          h(
            "div",
            { class: "stack", style: { flex: "1", minWidth: "0", gap: "3px" } },
            h("div", { style: { fontSize: "13px", fontWeight: "500" }, text: it.title }),
            it.summary
              ? h("div", {
                  class: "muted",
                  style: {
                    fontSize: "11.5px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: "2",
                    WebkitBoxOrient: "vertical",
                  },
                  text: it.summary,
                })
              : null,
            h(
              "div",
              { class: "hstack gap4", style: { flexWrap: "wrap", marginTop: "2px" } },
              it.sync_status ? h("span", { class: `tag ${it.sync_status === "conflict" ? "tag--err" : ""}`, text: it.sync_status }) : null,
              (it.tags ?? []).slice(0, 3).map((t) => h("span", { class: "tag", text: t })),
              h("span", { class: "tag", text: `${Math.round((it.content_length ?? 0) / 100) / 10}k 字` }),
            ),
          ),
          h(
            "div",
            { class: "stack gap4", style: { flex: "none", alignItems: "flex-end" } },
            h("button", {
              class: "btn btn--sm",
              type: "button",
              text: used.has(it.id) ? "再引用" : "引用",
              onclick: () => {
                onPick(it);
                toast(`已引用「${it.title}」`, { kind: "ok", timeout: 1600 });
              },
            }),
            h("button", {
              class: "btn btn--ghost btn--sm",
              type: "button",
              text: "看原文",
              onclick: () => viewKbItem(it),
            }),
          ),
        ),
      ),
    );
  }

  paint();
}

async function viewKbItem(it) {
  const bodyBox = h("div", { style: { padding: "8px 0", lineHeight: "1.75", fontSize: "13px" } }, loadingRows(6));
  const d = drawer({
    title: it.title,
    subtitle: `${it.kb_id ?? ""} · ${it.sync_status ?? ""}`,
    body: bodyBox,
    width: "660px",
  });
  try {
    const full = await api.kbItem(it.id);
    bodyBox.replaceChildren(
      ...String(full.content ?? full.text ?? "（这条没有正文）")
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((p) =>
          h("p", { style: { margin: "0 0 12px" }, text: p }),
        ),
    );
  } catch (e) {
    bodyBox.replaceChildren(h("p", { class: "muted", text: e instanceof ApiError ? e.message : String(e) }));
  }
  return d;
}

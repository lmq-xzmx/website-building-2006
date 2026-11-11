/**
 * 组件（片段）—— 一份内容，多处引用。
 *
 * 旧界面最大的信息缺失：看不出「这个片段被哪些页面用着」，
 * 于是改名、删除全靠记忆。这里把引用点摆在详情页第一块。
 */

import { h, icon, mount, toast, dialog, empty, relTime } from "../lib/dom.js";
import * as store from "../lib/store.js";
import { api, ApiError } from "../lib/api.js";
import { go } from "../lib/router.js";

export function create() {
  const el = h("div", { class: "work" });
  const head = h("div", { class: "work__head" });
  const listCol = h("div", { class: "col__body" });
  const detail = h("div", { class: "col__body", style: { padding: "18px 22px 60px" } });
  const structMeta = h("span", { class: "muted", style: { fontSize: "11px" } });

  let fragments = [];
  let problems = [];
  let selected = null;
  let loading = true;
  let error = "";

  el.append(
    head,
    h(
      "div",
      { class: "split", style: { gridTemplateColumns: "300px minmax(0,1fr)" } },
      h(
        "section",
        { class: "split__col" },
        h(
          "div",
          { class: "col__head" },
          h("h2", { text: "片段" }),
          structMeta,
          h("span", { class: "sp" }),
          h("button", {
            class: "btn btn--ghost btn--icon btn--sm",
            type: "button",
            title: "刷新",
            "aria-label": "刷新",
            onclick: () => void load(),
          }, icon("refresh", 14)),
        ),
        listCol,
        h(
          "div",
          { class: "col__foot" },
          h("span", { class: "muted", style: { fontSize: "11px" }, text: "在模块上点「存成片段」即可新建" }),
        ),
      ),
      h("section", { class: "split__col" }, detail),
    ),
  );

  mount(
    head,
    h(
      "div",
      { class: "work__title" },
      h("h1", { text: "可复用片段" }),
      h("p", { text: "公司简介、联系方式、常见问题收成一份 —— 改一次，所有引用点跟着改。" }),
    ),
    h(
      "div",
      { class: "work__actions" },
      h("button", {
        class: "btn btn--sm",
        type: "button",
        onclick: () => go("content"),
      }, icon("layers", 14), "去内容区建片段"),
    ),
  );

  function paintList() {
    if (loading) {
      mount(listCol, h("div", { style: { padding: "10px" } }, h("div", { class: "skel skel--row" })));
      return;
    }
    if (error) {
      mount(listCol, empty({ title: "读不到片段库", text: error, mark: "alert" }));
      return;
    }
    if (!fragments.length) {
      mount(
        listCol,
        empty({
          title: "还没有片段",
          text: "在内容区选一个模块，点「存成片段」。以后改电话只改一处。",
          mark: "block",
          action: h("button", { class: "btn btn--sm", type: "button", text: "去内容区", onclick: () => go("content") }),
        }),
      );
      return;
    }
    structMeta.textContent = `${fragments.length}`;
    mount(
      listCol,
      h(
        "div",
        { class: "tree" },
        ...fragments.map((f) => {
          const uses = store.fragmentUsage(f.id).length;
          return h(
            "div",
            {
              class: "tree__node",
              role: "treeitem",
              "aria-selected": selected?.id === f.id ? "true" : "false",
              style: { alignItems: "flex-start" },
              onclick: () => {
                selected = f;
                paintList();
                paintDetail();
              },
            },
            h(
              "span",
              { class: "stack", style: { gap: "2px", minWidth: "0", flex: "1" } },
              h("span", { class: "tree__title", text: f.name }),
              h(
                "span",
                { class: "hstack gap6" },
                h("span", { class: "tree__path", text: f.type }),
                h("span", { class: "tag", style: { height: "15px" }, text: `${uses} 处引用` }),
              ),
            ),
          );
        }),
      ),
    );
  }

  function paintDetail() {
    if (!selected) {
      mount(
        detail,
        empty({
          title: "选一个片段",
          text: "左边是库里的片段。选中后能看到它被哪些页面引用、内容长什么样。",
          mark: "block",
        }),
      );
      return;
    }
    const f = selected;
    const uses = store.fragmentUsage(f.id);
    const fragProblems = problems.filter((p) => p.fragmentId === f.id);

    mount(
      detail,
      h(
        "div",
        { class: "hstack gap8", style: { flexWrap: "wrap", marginBottom: "6px" } },
        h("span", { class: "tag", text: f.type }),
        h("span", { class: "muted", style: { fontSize: "11.5px" }, text: `更新于 ${relTime(f.updatedAt)}` }),
        fragProblems.length ? h("span", { class: "tag tag--err", text: `${fragProblems.length} 处问题` }) : null,
        h("span", { class: "sp" }),
        h("button", {
          id: "btn-fragment-insert",
          class: "btn btn--sm",
          type: "button",
          "aria-label": `把片段 ${f.name} 插入到当前页`,
          text: "插入到当前页",
          onclick: () => {
            if (!store.currentPage()) {
              toast("先选一个页面", { kind: "err" });
              return;
            }
            store.appendFragment(f);
            toast(`已插入「${f.name}」到「${store.currentPage().title}」`, { kind: "ok" });
          },
        }),
        h("button", {
          id: "btn-fragment-rename",
          class: "btn btn--sm",
          type: "button",
          text: "重命名",
          onclick: () => rename(f),
        }),
        h("button", {
          id: "btn-fragment-delete",
          class: "btn btn--stamp btn--sm",
          type: "button",
          text: "删除",
          onclick: () => remove(f, uses),
        }),
      ),
      h("h2", { style: { font: "600 22px/1.3 var(--font-display)", margin: "4px 0 4px" }, text: f.name }),
      h("p", { class: "muted", style: { fontSize: "12.5px", marginBottom: "16px" }, text: f.description || "没有说明" }),

      h(
        "div",
        { class: "hstack gap8", style: { alignItems: "center", marginBottom: "8px" } },
        h("span", { class: "section-label", text: `被引用的位置 · ${uses.length}` }),
        h("span", { class: "sp" }),
        h("button", {
          id: "btn-fragment-highlight",
          class: `btn btn--ghost btn--sm ${store.highlightFragmentId() === f.id ? "btn--stamp" : ""}`,
          type: "button",
          text: store.highlightFragmentId() === f.id ? "取消标注" : "在内容区标出",
          title: "把用到这个组件的位置全部加框高亮",
          onclick: () => {
            store.setHighlightFragment(f.id);
            paintDetail();
          },
        }),
      ),
      uses.length
        ? h(
            "div",
            { class: "frag-usage" },
            ...uses.map((u) =>
              h(
                "button",
                {
                  class: "todo__row",
                  type: "button",
                  style: { border: "1px solid var(--rule)", borderRadius: "4px", background: "var(--sheet)" },
                  title: `第 ${u.position} 块 / 共 ${u.moduleCount} 块 · ${u.moduleTitle}`,
                  onclick: () => {
                    store.select({ pageId: u.pageId, moduleId: u.moduleId });
                    store.flashModule(u.pageId, u.moduleId);
                    go("content");
                  },
                },
                icon("layers", 14),
                h(
                  "span",
                  { class: "todo__t" },
                  h("span", { text: u.pageTitle }),
                  h("small", { text: `${u.pagePath} · 第 ${u.position} 块 · ${u.moduleTitle}` }),
                ),
                h("span", { class: "tag", style: { height: "15px" }, text: `${u.itemCount} 条` }),
                icon("chevronRight", 13),
              ),
            ),
          )
        : h("p", { class: "muted", style: { fontSize: "12px" }, text: "还没有页面引用它 —— 插进去才会生效。" }),

      h("div", { class: "section-label", style: { marginTop: "20px" }, text: `内容 · ${f.items?.length ?? 0} 条` }),
      h(
        "div",
        { class: "stack gap6" },
        ...(f.items ?? []).map((it) =>
          h(
            "div",
            {
              style: {
                border: "1px solid var(--rule)",
                borderRadius: "4px",
                padding: "9px 11px",
                background: "var(--sheet)",
              },
            },
            h("div", { style: { fontSize: "13px", fontWeight: "500" }, text: it.title || it.question || it.label || "无标题" }),
            it.summary ? h("div", { class: "muted", style: { fontSize: "12px", marginTop: "2px" }, text: it.summary }) : null,
          ),
        ),
      ),

      h(
        "p",
        { class: "form-note", style: { marginTop: "18px" } },
        "片段的内容在引用点可以局部覆盖（换个标题、少两段），但改片段本体就会影响所有引用 —— 这是刻意的。",
      ),
    );
  }

  function rename(f) {
    dialog({
      title: "重命名片段",
      input: { value: f.name, required: true, label: "片段名", placeholder: "例如：公司简介" },
      confirmLabel: "保存",
      onConfirm: async (value) => {
        try {
          const d = await api.updateFragment(store.state.siteId, f.id, { name: value });
          f.name = d.fragment?.name ?? value;
          paintList();
          paintDetail();
          toast("已重命名", { kind: "ok" });
        } catch (e) {
          toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
        }
      },
    });
  }

  function remove(f, uses) {
    dialog({
      title: `删除片段「${f.name}」？`,
      body: uses.length
        ? `有 ${uses.length} 个页面在引用它。删掉之后这些位置会变成空模块 —— 建议先到页面里脱离引用。`
        : "没有页面引用它，可以安全删除。",
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => {
        try {
          await api.delFragment(store.state.siteId, f.id);
          toast("已删除", {
            kind: "ok",
            actionLabel: "重新加载",
            onAction: () => void load(),
          });
          selected = null;
          await load();
        } catch (e) {
          toast(e instanceof ApiError ? e.message : String(e), { kind: "err", timeout: 6000 });
        }
      },
    });
  }

  async function load() {
    loading = true;
    error = "";
    paintList();
    try {
      const d = await api.fragments(store.state.siteId);
      fragments = d.fragments ?? d.lib?.fragments ?? [];
      problems = d.problems ?? [];
      if (selected) selected = fragments.find((f) => f.id === selected.id) ?? null;
      if (!selected && fragments.length) selected = fragments[0];
    } catch (e) {
      error = e instanceof ApiError ? e.message : String(e);
    } finally {
      loading = false;
      paintList();
      paintDetail();
    }
  }

  load();

  return {
    el,
    update(reason) {
      if (reason === "plan") {
        paintList();
        paintDetail();
      }
    },
  };
}

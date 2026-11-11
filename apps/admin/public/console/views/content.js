/**
 * 内容作业区 —— 页面树 / 结构 / 工位。
 *
 * 这是整个后台的主战场。设计的三个判断：
 *   1. 结构（页面→模块→条目）常驻左二栏，不藏在弹层里 —— 编排是主任务。
 *   2. 编辑区只显示"当前选中的那一件事"，不把页面、模块、条目的表单堆在一屏。
 *   3. 预览是第三等公民，但随手可及：切一个 tab 就是真站点渲染，不是条数统计。
 */

import { h, icon, mount, toast, dialog, drawer, debounce, empty, tag, stamp, relTime } from "../lib/dom.js";
import * as store from "../lib/store.js";
import { api, ApiError, mediaUrl } from "../lib/api.js";
import { richEditor } from "../lib/rich.js";
import { previewFrame } from "../lib/preview.js";
import { sortable } from "../lib/drag.js";
import { openKbPicker, openImagePicker } from "../lib/picker.js";
import { fixBanner, classify, canReview, howTo } from "../lib/fixes.js";
import { go } from "../lib/router.js";
import { openPublishPanel } from "../lib/publish.js";

export function create(ctx) {
  const el = h("div", { class: "work" });
  const head = h("div", { class: "work__head" });
  const treeBody = h("div", { class: "tree" });
  const structBody = h("div", { class: "struct" });
  const structHeadMeta = h("span", { class: "muted", style: { fontSize: "11px" } });
  const desk = h("div", { class: "desk" });
  const tabsBar = h("div", { class: "tabs" });
  const paneHost = h("div", { style: { flex: "1", minHeight: "0", display: "flex" } });

  let mode = "edit";
  let deskKey = "";
  let preview = null;
  let livePreview = true;
  let previewDirty = false;

  /* ── 骨架 ─────────────────────────────────────────────── */
  const treeCol = h(
    "section",
    { class: "split__col split__col--tree" },
    h(
      "div",
      { class: "col__head" },
      h("h2", { text: "页面" }),
      h("span", { class: "sp" }),
      h("button", {
        class: "btn btn--ghost btn--icon btn--sm",
        type: "button",
        title: "新建页面",
        "aria-label": "新建页面",
        onclick: () => {
          const p = store.newPage();
          openPageSettings(p, true);
        },
      }, icon("plus", 14)),
    ),
    treeBody,
    h(
      "div",
      { class: "col__foot" },
      h(
        "div",
        { class: "hstack gap6 muted", style: { fontSize: "11px" } },
        icon("info", 12),
        h("span", { text: "拖动可排序，子页面挂在父页面下" }),
      ),
    ),
  );

  const structCol = h(
    "section",
    { class: "split__col split__col--struct" },
    h(
      "div",
      { class: "col__head" },
      h("h2", { text: "结构" }),
      structHeadMeta,
      h("span", { class: "sp" }),
      h("button", {
        class: "btn btn--ghost btn--icon btn--sm",
        type: "button",
        title: "插入片段（可复用组件）",
        "aria-label": "插入片段",
        onclick: () => openFragmentPicker(),
      }, icon("block", 14)),
      h("button", {
        class: "btn btn--ghost btn--icon btn--sm",
        type: "button",
        title: "加模块",
        "aria-label": "加模块",
        onclick: (e) => openModuleMenu(e.currentTarget),
      }, icon("plus", 14)),
    ),
    structBody,
  );

  const deskCol = h("section", { class: "split__col split__col--desk" }, desk);

  el.append(
    head,
    h(
      "div",
      { class: "split" },
      treeCol,
      structCol,
      deskCol,
    ),
  );

  desk.append(tabsBar, paneHost);

  /* ── 顶栏 ─────────────────────────────────────────────── */
  function paintHead() {
    const page = store.currentPage();
    if (!page) {
      mount(
        head,
        h(
          "div",
          { class: "work__title" },
          h("h1", { text: "还没有页面" }),
          h("p", { text: "站点需要一个首页。先建一页，再往里加模块。" }),
        ),
        h(
          "div",
          { class: "work__actions" },
          h("button", {
            class: "btn btn--ink",
            type: "button",
            text: "新建首页",
            onclick: () => {
              const p = store.newPage();
              store.updatePage(p.id, { path: "/", title: "首页", published: true });
              openPageSettings(p, true);
            },
          }),
        ),
      );
      return;
    }

    const mods = store.modulesOf(page);
    const itemCount = mods.reduce((n, m) => n + (m.items?.length ?? 0), 0);
    const pageIssues = store.state.check.problems.filter((p) => p.pageId === page.id).length;

    mount(
      head,
      h(
        "div",
        { class: "work__title" },
        h(
          "div",
          { class: "hstack gap8" },
          h("h1", { text: page.title || "未命名页面" }),
          page.published
            ? tag("已上线", "ok")
            : tag(page.publishAt ? `定时 ${relTime(page.publishAt)}` : "草稿", "draft"),
          pageIssues ? tag(`${pageIssues} 处待修`, "err") : null,
        ),
        h(
          "p",
          { class: "mono", style: { fontSize: "11.5px" } },
          `${page.path || "/"} · ${mods.length} 模块 · ${itemCount} 条目${
            page.description ? "" : " · 缺页面描述"
          }`,
        ),
      ),
      h(
        "div",
        { class: "work__actions" },
        h("button", {
          class: "btn btn--sm",
          type: "button",
          onclick: () => openKbPicker({ onPick: (it) => addKbToCurrent(it) }),
        }, icon("book", 14), "引用知识"),
        h("button", {
          class: "btn btn--sm",
          type: "button",
          onclick: (e) => openModuleMenu(e.currentTarget),
        }, icon("plus", 14), "加模块"),
        h("button", {
          class: "btn btn--sm",
          type: "button",
          onclick: () => openPageSettings(page),
        }, icon("file", 14), "页面设置"),
      ),
    );
  }

  /* ── 页面树 ───────────────────────────────────────────── */
  function paintTree() {
    const pages = store.pages();
    const cur = store.state.sel.pageId;
    if (!pages.length) {
      mount(
        treeBody,
        empty({
          title: "还没有页面",
          text: "建一页，站点才有落点。",
          mark: "file",
          action: h("button", {
            class: "btn btn--sm",
            type: "button",
            text: "新建页面",
            onclick: () => {
              const p = store.newPage();
              openPageSettings(p, true);
            },
          }),
        }),
      );
      return;
    }

    const roots = pages.filter((p) => !p.parentId || !pages.some((x) => x.id === p.parentId));
    const childrenOf = (id) => pages.filter((p) => p.parentId === id);

    const node = (page, depth) => {
      const kids = childrenOf(page.id);
      const issues = store.state.check.problems.filter((x) => x.pageId === page.id).length;
      return [
        h(
          "div",
          {
            class: `tree__node ${depth ? "tree__node--child" : ""}`,
            role: "treeitem",
            "aria-selected": page.id === cur ? "true" : "false",
            "data-drag-id": page.id,
            draggable: "true",
            title: `${page.title} · ${page.path}`,
            onclick: () => store.select({ pageId: page.id }),
          },
          h(
            "span",
            { class: "stack", style: { gap: "0", minWidth: "0", flex: "1" } },
            h(
              "span",
              { class: "hstack gap6" },
              h("span", { class: "tree__title", text: page.title || "未命名" }),
              issues ? h("span", { class: "tag tag--err", style: { height: "16px" }, text: String(issues) }) : null,
            ),
            h(
              "span",
              { class: "hstack gap6" },
              h("span", { class: "tree__path", text: page.path || "/" }),
              page.published ? null : h("span", { class: "tag tag--draft", style: { height: "15px" }, text: "草稿" }),
            ),
          ),
          h(
            "span",
            { class: "tree__dots" },
            h("button", {
              class: "btn btn--ghost btn--icon btn--sm",
              type: "button",
              title: "页面设置",
              "aria-label": "页面设置",
              onclick: (e) => {
                e.stopPropagation();
                openPageSettings(page);
              },
            }, icon("chevronRight", 13)),
          ),
        ),
        ...kids.flatMap((k) => node(k, depth + 1)),
      ];
    };

    mount(treeBody, ...roots.flatMap((p) => node(p, 0)));
  }

  /* ── 结构栏 ───────────────────────────────────────────── */
  function paintStruct() {
    const page = store.currentPage();
    if (!page) {
      mount(structBody, empty({ title: "没有页面", text: "先建页面。", mark: "file" }));
      structHeadMeta.textContent = "";
      return;
    }
    const mods = store.modulesOf(page);
    structHeadMeta.textContent = `${page.path || "/"}`;

    if (!mods.length) {
      mount(
        structBody,
        empty({
          title: "这一页还是空的",
          text: "先放一个英雄区（首屏一句话），再按顺序往下加：正文、卡片、问答、行动号召。",
          mark: "block",
          action: h("button", {
            class: "btn btn--ink btn--sm",
            type: "button",
            text: "加第一个模块",
            onclick: () => store.addModule("hero"),
          }),
        }),
      );
      return;
    }

    mount(
      structBody,
      ...mods.map((mod, mi) => {
        const isSel = mod.id === store.state.sel.moduleId;
        const items = store.itemsOf(mod);
        const isFrag = !!mod.fragmentId;
        // 组件高亮模式：所有引用同一个片段的模块都加框
        const hl = store.highlightFragmentId();
        const isHl = hl && mod.fragmentId === hl;
        const fragName = isFrag ? store.fragmentById(mod.fragmentId)?.name ?? "" : "";
        return h(
          "div",
          {
            class: `mod ${mod.id === store.state.sel.moduleId ? "mod--sel" : ""} ${mod.enabled ? "" : "mod--off"} ${
              isHl ? "mod--fragmark" : ""
            }`,
            "data-drag-id": mod.id,
            draggable: "true",
            "data-mod-id": mod.id,
          },
          h(
            "div",
            {
              class: "mod__head",
              onclick: () => store.select({ pageId: page.id, moduleId: mod.id }),
            },
            h("span", { class: "mod__grip" }, icon("grip", 13)),
            h("span", { class: "mod__type", text: mod.type }),
            h("span", { class: "mod__title", text: mod.title || store.MODULE_TYPE_LABEL[mod.type] || "模块" }),
            isFrag
              ? h("span", { class: "tag tag--frag", title: `组件「${fragName}」 · 本页第 ${mi + 1} 块`, text: "片段" })
              : null,
            isHl ? h("span", { class: "tag tag--frag", text: "组件位置" }) : null,
            h("span", { class: "mod__count", text: isFrag ? "引用" : String(items.length) }),
            h(
              "span",
              { class: "mod__tools" },
              h("button", {
                class: "btn btn--ghost btn--icon btn--sm",
                type: "button",
                title: mod.enabled ? "整块下线" : "重新启用",
                "aria-label": mod.enabled ? "停用模块" : "启用模块",
                onclick: (e) => {
                  e.stopPropagation();
                  store.updateModule(mod.id, { enabled: !mod.enabled });
                },
              }, icon(mod.enabled ? "eye" : "minus", 13)),
              h("button", {
                class: "btn btn--ghost btn--icon btn--sm",
                type: "button",
                title: "删除模块",
                "aria-label": "删除模块",
                onclick: (e) => {
                  e.stopPropagation();
                  confirmDeleteModule(mod);
                },
              }, icon("trash", 13)),
            ),
          ),
          isFrag
            ? h(
                "div",
                { class: "mod__items" },
                ...fragmentItemRows(page, mod),
                h(
                  "div",
                  { class: "hstack", style: { padding: "5px 8px", gap: "4px" } },
                  h("button", {
                    class: "btn btn--ghost btn--sm",
                    type: "button",
                    text: "+ 本地一条",
                    title: "只在这一处追加，不改片段本体",
                    onclick: (e) => {
                      e.stopPropagation();
                      const it = store.addLocalItem(mod.id);
                      if (it) {
                        store.select({ pageId: page.id, moduleId: mod.id, itemId: it.id });
                        setMode("edit");
                      }
                    },
                  }),
                  h("button", {
                    class: "btn btn--ghost btn--sm",
                    type: "button",
                    text: "去组件",
                    onclick: (e) => {
                      e.stopPropagation();
                      go("components");
                    },
                  }),
                ),
              )
            : h(
                "div",
                { class: "mod__items" },
                ...items.map((it) =>
                  h(
                    "div",
                    {
                      class: `item ${it.id === store.state.sel.itemId ? "item--sel" : ""} ${it.published ? "" : "item--draft"}`,
                      "data-drag-id": it.id,
                      draggable: "true",
                      onclick: () => store.select({ pageId: page.id, moduleId: mod.id, itemId: it.id }),
                    },
                    it.source === "kb" ? h("span", { class: "tag tag--kb", style: { height: "15px" }, text: "知识库" }) : null,
                    it.sticky ? h("span", { title: "置顶" }, icon("pin", 11)) : null,
                    h("span", {
                      class: "item__t",
                      text: it.title || it.question || it.label || "无标题条目",
                    }),
                    h("button", {
                      class: "item__x",
                      type: "button",
                      title: "移除条目",
                      "aria-label": "移除条目",
                      onclick: (e) => {
                        e.stopPropagation();
                        removeItem(mod, it);
                      },
                    }, icon("x", 12)),
                  ),
                ),
                h(
                  "div",
                  { class: "hstack", style: { padding: "5px 8px", gap: "4px" } },
                  h("button", {
                    class: "btn btn--ghost btn--sm",
                    type: "button",
                    text: "+ 条目",
                    onclick: (e) => {
                      e.stopPropagation();
                      store.addManualItem(mod.id);
                      setMode("edit");
                    },
                  }),
                  h("button", {
                    class: "btn btn--ghost btn--sm",
                    type: "button",
                    text: "+ 引用",
                    onclick: () => {
                      store.select({ pageId: page.id, moduleId: mod.id });
                      openKbPicker({
                        moduleId: mod.id,
                        onPick: (it) => store.addKbItem(it, mod.id),
                      });
                    },
                  }),
                ),
              ),
        );
      }),
    );
  }

  sortable(structBody, ".mod", {
    handle: ".mod__grip",
    onDrop: (from, to, after) => store.reorderModules(from, to, after),
  });

  /* ── 工位 ─────────────────────────────────────────────── */
  function setMode(next) {
    mode = next;
    if (mode === "preview") paintPreview();
    paintDesk(true);
  }

  function paintDesk(force = false) {
    const page = store.currentPage();
    const mod = store.currentModule(page);
    const item = store.currentItem(mod);
    const key = `${page?.id ?? "-"}|${mod?.id ?? "-"}|${item?.id ?? "-"}|${mode}`;
    paintTabs();

    if (!force && key === deskKey) {
      // 同一件事：只更新校样角标与预览状态，不重建表单（否则光标会飞）
      updateLiveBits();
      return;
    }
    deskKey = key;
    mount(paneHost);
    if (!page) {
      paneHost.appendChild(empty({ title: "没有页面", text: "先建页面再编辑。", mark: "file" }));
      return;
    }
    if (mode === "issues") {
      paneHost.appendChild(issuesPane());
      return;
    }
    if (mode === "preview") {
      paneHost.appendChild(previewPane(page));
      return;
    }
    if (item && mod) {
      paneHost.appendChild(mod.fragmentId ? fragmentItemEditor(page, mod, item) : itemEditor(page, mod, item));
      return;
    }
    if (mod) {
      paneHost.appendChild(moduleEditor(page, mod));
      return;
    }
    paneHost.appendChild(pageOnly());
  }

  function paintTabs() {
    const problems = store.state.check.problems.length + store.state.check.warnings.length;
    const page = store.currentPage();
    const mod = store.currentModule(page);
    const item = store.currentItem(mod);
    mount(
      tabsBar,
      h(
        "button",
        { class: "tab", type: "button", "aria-selected": mode === "edit" ? "true" : "false", onclick: () => setMode("edit") },
        icon("text", 14),
        h("span", { text: item ? "条目" : mod ? "模块" : "页面" }),
      ),
      h(
        "button",
        { class: "tab", type: "button", "aria-selected": mode === "preview" ? "true" : "false", onclick: () => setMode("preview") },
        icon("eye", 14),
        h("span", { text: "预览" }),
      ),
      h(
        "button",
        { class: "tab", type: "button", "aria-selected": mode === "issues" ? "true" : "false", onclick: () => setMode("issues") },
        icon("alert", 14),
        h("span", { text: "校样" }),
        problems ? h("span", { class: "tab__badge", text: String(problems) }) : null,
      ),
      h("span", { class: "sp" }),
      item ? h("span", { class: "muted", style: { fontSize: "11px" }, text: `${mod?.title || mod?.type} / ${item.title || "条目"}` }) : null,
    );
  }

  function updateLiveBits() {
    const problems = store.state.check.problems.length + store.state.check.warnings.length;
    const badge = tabsBar.querySelector(".tab__badge");
    if (badge) badge.textContent = String(problems);
    else if (problems) paintTabs();
    if (mode === "preview" && livePreview && store.state.check.at) {
      previewDirty = true;
      paintPreview();
    }
  }

  /* ── 预览 ─────────────────────────────────────────────── */
  function pageForPreview(page) {
    const mat = store.state.check.pages.find((p) => p.id === page.id || p.path === page.path);
    if (mat) return { page: mat, note: store.state.check.materialized ? "" : "知识库未连接，正文以占位显示" };
    // 未发布的页面：本地拼一份草稿预览
    return {
      page: {
        id: page.id,
        path: page.path,
        title: page.title,
        description: page.description,
        modules: store.modulesOf(page).map((m) => ({
          ...m,
          items: store.itemsOf(m).map((it) => ({
            ...it,
            paragraphs: it.body ? store.bodyToParagraphs(it.body) : [],
          })),
        })),
      },
      note: "这一页还没上线，预览的是草稿（含未发布条目）",
    };
  }

  function previewPane(page) {
    const state = pageForPreview(page);
    const device = store.state.ui.device;
    preview = previewFrame({
      getPage: () => state.page,
      getAppearance: () => store.state.plan?.appearance ?? {},
      getNav: () => store.pages(),
      siteId: store.state.siteId,
      siteName: store.state.sites.find((s) => s.id === store.state.siteId)?.name ?? "",
      device,
    });
    previewDirty = false;

    const bar = h(
      "div",
      { class: "preview__bar" },
      h(
        "div",
        { class: "seg", role: "group", "aria-label": "预览宽度" },
        ...[
          ["desktop", "monitor", "桌面"],
          ["tablet", "tablet", "平板"],
          ["phone", "phone", "手机"],
        ].map(([id, ic, label]) =>
          h("button", {
            type: "button",
            "aria-pressed": device === id ? "true" : "false",
            title: label,
            onclick: (e) => {
              store.state.ui.device = id;
              preview.setDevice(id);
              bar.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", "false"));
              e.currentTarget.setAttribute("aria-pressed", "true");
            },
          }, icon(ic, 13), h("span", { text: label })),
        ),
      ),
      h("span", { class: "sp" }),
      h(
        "label",
        { class: "check" },
        h("input", {
          type: "checkbox",
          checked: livePreview,
          onchange: (e) => {
            livePreview = e.target.checked;
            if (livePreview) paintPreview();
          },
        }),
        h("span", { text: "跟手刷新" }),
      ),
      h("button", {
        class: "btn btn--ghost btn--sm",
        type: "button",
        onclick: () => paintPreview(),
      }, icon("refresh", 13), "刷新"),
    );

    const stage = h("div", { class: "preview__stage" }, preview.el);

    // 「我在这儿改了英雄区，怎么点开站点看不到？」
    // 这边是编排草稿，那边是已发布的 out/ 静态站，还按页面路径分开。
    // 把两者关系直接写在预览里，连地址一起给，别让人自己猜 URL。
    const siteId = store.state.siteId ?? "";
    const raw = (page?.path || "/").trim();
    const pagePath = raw === "/" ? "/" : `/${raw.replace(/^\/+|\/+$/g, "")}/`;
    const publicPath = `/preview/${encodeURIComponent(siteId)}${pagePath}`;
    const site = store.state.sites.find((s) => s.id === siteId);
    const hint = h(
      "div",
      { class: "preview__hint" },
      h("span", {
        text: `${state.note ? `${state.note} · ` : ""}这里是编排草稿（含未发布条目）。网络预览按页面路径打开：${publicPath} 才是已发布版本；站点首页 /preview/${siteId}/ 是固定首屏，不放内容区模块。改动要「保存 → 发布 → 重建」才会上线。`,
      }),
      h("a", { href: publicPath, target: "_blank", rel: "noopener", text: "打开这一页 ↗" }),
    );
    const stale = site?.outStale
      ? h("div", {
          class: "preview__hint preview__hint--stale",
          text: `本地预览还是 ${relTime(site.outBuiltAt)} 构建的旧版，内容包更新于 ${relTime(site.contentBuiltAt)} —— 后加的模块要重建后才会出现。`,
        })
      : null;
    const wrap = h("div", { class: "preview" }, bar, stage, hint, stale);
    preview.paint();
    return wrap;
  }

  function paintPreview() {
    if (!preview) return;
    preview.paint();
    previewDirty = false;
  }

  /* ── 校样 ─────────────────────────────────────────────── */
  function issuesPane() {
    const { problems, warnings, error, materialized } = store.state.check;
    const all = [...problems, ...warnings];

    if (!all.length && error) {
      return h(
        "div",
        { class: "issues" },
        empty({
          title: "校验没跑起来",
          text: `${error}。发布前必须在有知识库的环境里跑一次校样。`,
          mark: "alert",
          action: h("button", {
            class: "btn btn--sm",
            type: "button",
            text: "重试",
            onclick: () => void store.runCheck(),
          }),
        }),
      );
    }

    if (!all.length) {
      return h(
        "div",
        { class: "issues" },
        empty({
          title: "校样通过",
          text: "没有阻断问题，也没有提醒。可以发布了。",
          mark: "check",
          action: h("button", {
            class: "btn btn--ink btn--sm",
            type: "button",
            text: "发布",
            onclick: () => openPublishPanel(),
          }),
        }),
      );
    }

    const row = (p) =>
      h(
        "button",
        {
          class: `issue ${p.level === "error" ? "issue--error" : "issue--warn"}`,
          type: "button",
          onclick: () => {
            store.locate(p);
            setMode("edit");
          },
        },
        h("span", { class: "issue__icon" }, icon(p.level === "error" ? "alert" : "info", 15)),
        h(
          "span",
          { class: "issue__body" },
          h("span", { class: "issue__msg", text: p.message }),
          h("span", {
            class: "issue__where",
            text: [p.pageTitle, p.moduleTitle, p.itemTitle].filter(Boolean).join(" › ") || "站点级",
          }),
          p.level === "error" ? h("span", { class: "issue__how", text: howTo(p) }) : null,
        ),
        h("span", { class: "issue__go" }, icon("chevronRight", 14)),
      );

    return h(
      "div",
      { class: "issues" },
      h(
        "div",
        { class: "hstack gap8", style: { marginBottom: "6px" } },
        h("span", { class: "section-label", style: { flex: "1" }, text: problems.length ? `阻断 ${problems.length} 处` : "没有阻断问题" }),
        h("button", {
          class: "btn btn--ghost btn--sm",
          type: "button",
          onclick: () => void store.runCheck().then(() => toast("已重新校验")),
        }, icon("refresh", 12), "重新校验"),
      ),
      ...problems.map(row),
      warnings.length
        ? h("div", { class: "section-label", style: { marginTop: "14px" }, text: `提醒 ${warnings.length} 处` })
        : null,
      ...warnings.map(row),
      !materialized
        ? h(
            "p",
            { class: "form-note", style: { marginTop: "14px" } },
            "这次校样是在本地算的（知识库未连接），知识库引用的内容没有被检查。",
          )
        : null,
    );
  }

  /* ── 条目编辑 ─────────────────────────────────────────── */
  /**
   * @param opts.patch 覆盖「改动落到哪儿」——
   *   普通模块写进模块自己的 items；引用型模块写进 overrides / extraItems。
   *   两种条目长得一样，落点不同 —— 所以把落点做成参数，而不是写两套表单。
   */
  function itemEditor(page, mod, item, opts = {}) {
    const pane = h("div", { class: "pane pane--pad" });
    const form = h("div", { class: "form-grid form-grid--wide" });

    const patch = opts.patch ?? ((p, { repaint = false } = {}) => {
      store.clearFocus({ silent: true });
      store.updateItem(mod.id, item.id, p, { quiet: !repaint });
      if (repaint) paintStruct();
      else repaintStructSoon();
    });

    /* 从待办跳过来的：先说清「为什么在这、要改什么」，别让人自己找 */
    const fi = store.state.ui.focusIssue;
    if (fi && fi.itemId === item.id && fi.moduleId === mod.id) {
      pane.appendChild(fixBanner(fi, { onDismiss: () => { deskKey = ""; paintDesk(true); } }));
    }

    /* 头部：来源 / 审核 / 发布 —— 审核动作放在这里，不再藏在「更多」里 */
    pane.appendChild(
      h(
        "div",
        { class: "hstack gap8", style: { marginBottom: "14px", flexWrap: "wrap" } },
        item.source === "kb" ? tag("知识库引用", "kb") : tag("手写", ""),
        item.review === "pending"
          ? stamp("pending")
          : item.review === "rejected"
            ? stamp("rejected")
            : item.published
              ? stamp("approved")
              : tag("草稿", "draft"),
        ...(opts.hideReview ? [] : reviewControls(page, mod, item)),
        h("span", { class: "sp" }),
        h(
          "label",
          { class: "check", title: "草稿不进站点；发布才物化" },
          h("input", {
            type: "checkbox",
            checked: item.published,
            onchange: (e) => patch({ published: e.target.checked }, { repaint: true }),
          }),
          h("span", { text: "发布这条" }),
        ),
        ...(opts.origin === "fragment"
          ? []
          : [
              h(
                "label",
                { class: "check", title: "同类里排最前" },
                h("input", {
                  type: "checkbox",
                  checked: !!item.sticky,
                  onchange: (e) => patch({ sticky: e.target.checked }, { repaint: true }),
                }),
                h("span", { text: "置顶" }),
              ),
            ]),
        h("button", {
          class: "btn btn--ghost btn--sm",
          type: "button",
          title: "移到其他模块",
          onclick: () => openMoveDialog(page, mod, item),
        }, icon("split", 13), "移动"),
        h("button", {
          class: "btn btn--ghost btn--icon btn--sm",
          type: "button",
          title: "删除条目",
          "aria-label": "删除条目",
          onclick: () => (opts.onDelete ? opts.onDelete() : removeItem(mod, item)),
        }, icon("trash", 14)),
      ),
    );

    /* 字段：按模块类型决定 */
    const t = mod.type;

    if (t === "faq") {
      form.append(
        field("问题", inputText(item.question ?? "", (v) => patch({ question: v }), { placeholder: "客户会怎么问？用他们的原话" })),
        field("答案", textarea(item.answer ?? "", (v) => patch({ answer: v }), { rows: 5, placeholder: "先给结论，再补一句依据" })),
      );
    } else if (t === "stats") {
      form.append(
        h(
          "div",
          { class: "row2" },
          field("数值", inputText(item.value ?? "", (v) => patch({ value: v }), { placeholder: "99.95" })),
          field("单位", inputText(item.unit ?? "", (v) => patch({ unit: v }), { placeholder: "% / 家 / 天" })),
        ),
        field("标签", inputText(item.label ?? "", (v) => patch({ label: v }), { placeholder: "可用性 / 服务客户" })),
      );
    } else if (t === "process") {
      form.append(
        h(
          "div",
          { class: "row2" },
          field("第几步", inputText(String(item.step ?? ""), (v) => patch({ step: Number(v) || 0 }), { type: "number" })),
          field("步骤标题", inputText(item.title ?? "", (v) => patch({ title: v }), { placeholder: "立项评估" })),
        ),
        field("这一步做什么", textarea(item.summary ?? "", (v) => patch({ summary: v }), { rows: 3 })),
      );
    } else if (t === "logo-wall") {
      form.append(
        field("客户名", inputText(item.client ?? item.title ?? "", (v) => patch({ client: v, title: v }))),
        imageField(item, patch, page),
        field("替代文本（必填）", inputText(item.alt ?? "", (v) => patch({ alt: v }), { placeholder: "客户 logo 的文字说明，给读屏和 AI 看" })),
      );
    } else if (t === "trust") {
      form.append(
        field("名称", inputText(item.title ?? "", (v) => patch({ title: v }), { placeholder: "ISO 27001 / 信创兼容认证" })),
        imageField(item, patch, page),
        field("说明", inputText(item.caption ?? "", (v) => patch({ caption: v }), { placeholder: "颁发机构、年份" })),
        field("替代文本（必填）", inputText(item.alt ?? "", (v) => patch({ alt: v }))),
      );
    } else if (t === "cta") {
      form.append(
        field("按钮上的话", inputText(item.title ?? "", (v) => patch({ title: v }), { placeholder: "预约演示" })),
        field("跳到哪里", inputText(item.href ?? "", (v) => patch({ href: v }), { placeholder: "/contact" })),
        field("一句补充", inputText(item.summary ?? "", (v) => patch({ summary: v }))),
      );
    } else {
      form.append(
        field(t === "hero" ? "首屏一句话（H1）" : "标题", inputText(item.title ?? "", (v) => patch({ title: v }), {
          placeholder: t === "hero" ? "一句话说清你是谁、为谁解决什么" : "标题",
        })),
      );
      if (t !== "rich-text") {
        form.append(
          field("摘要", textarea(item.summary ?? "", (v) => patch({ summary: v }), {
            rows: 3,
            placeholder: "一到两句，让人想继续看",
          })),
        );
      }
    }

    /* 卡片网格：产品要规格表，案例要客户名 + 量化结果 */
    if (t === "card-grid") {
      const kind = store.effectiveProps(mod).kind ?? "products";
      if (kind === "cases") {
        form.append(
          field("客户名（必填）", inputText(item.client ?? "", (v) => patch({ client: v }), { placeholder: "某城商行" })),
          field(
            "量化结果（必填，一行一条）",
            textarea((item.results ?? []).join("\n"), (v) => patch({ results: v.split("\n").map((s) => s.trim()).filter(Boolean) }), {
              rows: 3,
              placeholder: "审批时效从 3 天缩短到 4 小时\n人工工单下降 62%",
            }),
            "AI 引用案例时，看的就是这一行数字。",
          ),
        );
      } else if (kind === "products") {
        form.append(field("规格表", specsEditor(item, patch), "三到五条，客户拿来比价的就是这些。"));
      }
      form.append(imageField(item, patch, page));
    }

    /* 正文：手写可编辑，知识库只读 */
    if (t === "rich-text" || t === "hero" || t === "faq") {
      if (item.source === "manual") {
        form.append(
          field(
            "正文",
            richEditor({
              value: item.body,
              onChange: (doc) => patch({ body: doc }),
            }),
          ),
        );
      } else {
        form.append(
          h(
            "div",
            { class: "field" },
            h("span", { class: "field__label", text: "正文（来自知识库，只读）" }),
            h(
              "div",
              {
                class: "form-note",
                style: { borderLeftColor: "var(--press)", color: "var(--ink-2)", padding: "8px 10px", background: "var(--press-soft)" },
              },
              "正文由知识条目提供 —— 在知识库里改，这里会跟着变。后台只覆盖标题与摘要，避免两份正文各说各话。",
            ),
          ),
        );
      }
    }

    /* 次要字段：折叠起来，别挡路 */
    const advanced = h(
      "details",
      { style: { marginTop: "4px" } },
      h("summary", { style: { cursor: "pointer", fontSize: "12px", color: "var(--ink-3)" }, text: "更多：标签 / 定时发布" }),
      h(
        "div",
        { class: "stack gap12", style: { marginTop: "10px" } },
        field(
          "标签",
          inputText((item.tags ?? []).join("，"), (v) =>
            patch({ tags: v.split(/[，,]/).map((s) => s.trim()).filter(Boolean) }),
          ),
          "用中文逗号分隔",
        ),
        field(
          "定时发布",
          inputText(item.publishAt ?? "", (v) => patch({ publishAt: v || undefined }), {
            placeholder: "2026-12-01T09:00（留空=立即）",
          }),
          "到点自动生效 —— 不需要守着后台。",
        ),
      ),
    );

    pane.append(form, advanced);
    focusField(pane, fi);
    return pane;
  }

  /** 把待办指向的字段滚到眼前并高亮 —— 到了内容区不用再找 */
  function focusField(pane, issue) {
    const label = issue ? classify(issue).fieldLabel : "";
    if (!label) return;
    requestAnimationFrame(() => {
      const target = [...pane.querySelectorAll(".field")].find((f) => f.dataset.field === label);
      if (!target) return;
      target.classList.add("field--focus");
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      const input = target.querySelector("input, textarea, [contenteditable]");
      if (input) input.focus({ preventScroll: true });
    });
  }

  /** 审核：只给当前状态需要的那一个动作，不再平铺三个按钮 */
  function reviewControls(page, mod, item) {
    const r = item.review;
    const btn = (decision, label, primary) =>
      h("button", {
        class: `btn btn--sm ${primary ? "btn--stamp" : "btn--ghost"}`,
        type: "button",
        title: decision === "approved" ? "通过后这条就不再挡着发布" : undefined,
        onclick: () => void setReview(decision, page, mod, item),
      }, icon(decision === "approved" ? "check" : decision === "rejected" ? "x" : "clock", 12), label);

    if (r === "pending" || r === "rejected") {
      return canReview()
        ? [btn("approved", "通过审核", true), r === "pending" ? btn("rejected", "驳回", false) : btn("pending", "重新提交", false)]
        : [h("span", { class: "muted", style: { fontSize: "11px" }, text: "等审核员通过" })];
    }
    return [btn("pending", "提交审核", false)];
  }

  function imageField(item, patch, page) {
    const thumbBox = h("div", { style: { flex: "none" } });
    const paintThumb = (url) => {
      mount(
        thumbBox,
        url
          ? h("img", {
              src: mediaUrl(store.state.siteId, url),
              alt: "",
              style: { width: "56px", height: "42px", objectFit: "cover", border: "1px solid var(--rule)", borderRadius: "3px" },
            })
          : h("div", {
              style: { width: "56px", height: "42px", border: "1px dashed var(--rule-strong)", borderRadius: "3px" },
            }),
      );
    };
    paintThumb(item.image);

    return h(
      "div",
      { class: "field" },
      h("span", { class: "field__label", text: "图片" }),
      h(
        "div",
        { class: "hstack gap8" },
        thumbBox,
        inputText(item.image ?? "", (v) => {
          patch({ image: v });
          paintThumb(v);
        }, { placeholder: "/media/xxx.png 或 https://…", mono: true }),
        h("button", {
          class: "btn btn--sm nowrap",
          type: "button",
          text: "选图",
          onclick: () =>
            openImagePicker({
              siteId: store.state.siteId,
              current: item.image ?? "",
              onPick: (url) => {
                patch({ image: url }, { repaint: true });
                paintThumb(url);
              },
            }),
        }),
      ),
    );
  }

  function specsEditor(item, patch) {
    const list = h("div", { class: "kv" });
    const rows = item.specs ?? [];

    const paint = () => {
      mount(
        list,
        ...(item.specs ?? []).map((s, i) =>
          h(
            "div",
            { class: "kv__row" },
            h("input", { class: "input", value: s.name, placeholder: "项目", oninput: (e) => (s.name = e.target.value), onchange: () => patch({ specs: item.specs }) }),
            h("input", { class: "input", value: s.value, placeholder: "数值", oninput: (e) => (s.value = e.target.value), onchange: () => patch({ specs: item.specs }) }),
            h("input", { class: "input", value: s.unit ?? "", placeholder: "单位", oninput: (e) => (s.unit = e.target.value), onchange: () => patch({ specs: item.specs }) }),
            h("button", {
              class: "btn btn--ghost btn--icon",
              type: "button",
              title: "删除这一行",
              onclick: () => {
                item.specs.splice(i, 1);
                patch({ specs: item.specs });
                paint();
              },
            }, icon("x", 13)),
          ),
        ),
        h("button", {
          class: "btn btn--sm",
          type: "button",
          text: "+ 一行规格",
          style: { alignSelf: "flex-start" },
          onclick: () => {
            item.specs = [...(item.specs ?? []), { name: "", value: "", unit: "" }];
            paint();
          },
        }),
      );
    };
    if (!item.specs) item.specs = rows;
    paint();
    return list;
  }

  /* ── 引用型模块里的条目编辑 ───────────────────────────── */
  /**
   * 组件引入站点后的条目编辑。
   *
   * 表单跟普通条目**一模一样**（同一套 itemEditor），
   * 只有「改动落到哪儿」不同：
   *   片段里的条目 → 写 override（只改这一处）
   *   本地追加的   → 写 extraItems
   */
  function fragmentItemEditor(page, mod, item) {
    const entry = store.fragmentEntries(mod).find((e) => e.id === item.id);
    const isLocal = entry?.origin === "local";

    const patch = (p, { repaint = false } = {}) => {
      store.clearFocus({ silent: true });
      if (isLocal) store.updateLocalItem(mod.id, item.id, p);
      else store.setFragmentOverride(mod.id, item.id, p);
      if (repaint) paintStruct();
      else repaintStructSoon();
    };

    const pane = itemEditor(page, mod, item, {
      patch,
      hideReview: true,
      origin: isLocal ? "local" : "fragment",
      onDelete: () => {
        if (isLocal) store.deleteLocalItem(mod.id, item.id);
        else store.hideFragmentItem(mod.id, item.id, true);
        deskKey = "";
        paintStruct();
        paintDesk(true);
      },
    });

    // 顶部补一条来源说明 —— 让人知道改的是「这一处」还是「片段本体」
    const banner = h(
      "div",
      {
        class: "form-note",
        style: {
          marginBottom: "12px",
          borderLeftColor: "var(--press)",
          background: "var(--press-soft)",
          color: "var(--ink-2)",
        },
      },
      isLocal
        ? "这是「这一处本地追加」的条目 —— 只在这一页出现，不影响片段本体。"
        : "这是片段里的条目。在这里改只改这一处 —— 片段本体和其他引用点不变。想全局改，去「组件」标签页。",
    );
    pane.insertBefore(banner, pane.firstChild);

    // 底部加一排「这一处专属」的动作
    const foot = h(
      "div",
      { class: "hstack gap8", style: { marginTop: "16px", flexWrap: "wrap" } },
      h("button", {
        class: "btn btn--ghost btn--sm",
        type: "button",
        text: "恢复成片段原样",
        title: "撤掉这一处对片段的覆盖",
        onclick: () => {
          store.resetFragmentOverride(mod.id, item.id);
          deskKey = "";
          paintStruct();
          paintDesk(true);
        },
      }),
      h("button", {
        class: "btn btn--ghost btn--sm",
        type: "button",
        text: isLocal ? "删掉这条" : "在这一处隐藏",
        onclick: () => {
          if (isLocal) store.deleteLocalItem(mod.id, item.id);
          else store.hideFragmentItem(mod.id, item.id, true);
          deskKey = "";
          paintStruct();
          paintDesk(true);
        },
      }),
      h("button", {
        class: "btn btn--ghost btn--sm",
        type: "button",
        text: "去组件区改本体",
        onclick: () => go("components"),
      }),
    );
    pane.appendChild(foot);
    return pane;
  }

  /* ── 模块编辑 ─────────────────────────────────────────── */
  /**
   * 引用型模块的条目列表 —— 显示的是「这一处实际显示的内容」。
   *
   * 组件引入站点后也要能增删改查：
   *   改 → 写 override（只改这一处）
   *   删 → hidden 覆盖（片段本体不动）
   *   增 → 本地追加一条
   *   查 → 这里列出来的就是片段本体 + 覆盖算出来的结果
   */
  function fragmentItemRows(page, mod) {
    const entries = store.fragmentEntries(mod);
    if (!entries.length) {
      return [
        h(
          "div",
          { class: "item", style: { cursor: "default" } },
          h("span", { class: "item__t muted", text: "片段本体是空的 —— 去组件里加内容" }),
        ),
      ];
    }
    return entries.map((e) =>
      h(
        "div",
        {
          class: `item ${e.id === store.state.sel.itemId ? "item--sel" : ""} ${e.hidden ? "item--draft" : ""}`,
          onclick: () => store.select({ pageId: page.id, moduleId: mod.id, itemId: e.id }),
        },
        e.origin === "local"
          ? h("span", { class: "tag tag--kb", style: { height: "15px" }, text: "本地" })
          : h("span", { class: "tag tag--frag", style: { height: "15px" }, text: "片段" }),
        e.override
          ? h("span", { class: "tag", style: { height: "15px" }, title: "这一处覆盖过片段本体", text: "改过" })
          : null,
        h("span", { class: "item__t", text: e.label }),
        h(
          "span",
          { class: "hstack gap4" },
          h("button", {
            class: "item__x",
            type: "button",
            title: e.hidden ? "在这一处恢复" : "在这一处隐藏",
            "aria-label": e.hidden ? "恢复" : "隐藏",
            onclick: (ev) => {
              ev.stopPropagation();
              store.hideFragmentItem(mod.id, e.id, !e.hidden);
              paintStruct();
            },
          }, icon(e.hidden ? "refresh" : "eye", 12)),
          h("button", {
            class: "item__x",
            type: "button",
            title: e.origin === "local" ? "删掉这条本地追加" : "在这一处删掉（片段本体保留）",
            "aria-label": "删除",
            onclick: (ev) => {
              ev.stopPropagation();
              if (e.origin === "local") store.deleteLocalItem(mod.id, e.id);
              else store.hideFragmentItem(mod.id, e.id, true);
              paintStruct();
              deskKey = "";
              paintDesk(true);
            },
          }, icon("trash", 12)),
        ),
      ),
    );
  }

  function moduleEditor(page, mod) {
    const pane = h("div", { class: "pane pane--pad" });
    const form = h("div", { class: "form-grid" });
    const isFrag = !!mod.fragmentId;
    const props = store.effectiveProps(mod);
    const heading = store.effectiveHeading(mod);
    form.append(
      h(
        "div",
        { class: "hstack gap8" },
        h("span", { class: "tag", text: mod.type }),
        h("span", { class: "muted", style: { fontSize: "12px" }, text: store.MODULE_TYPE_DESC[mod.type] ?? "" }),
      ),
      field("区块标题", inputText(heading.title, (v) => store.setModuleHeading(mod.id, { title: v }), { placeholder: "例如：客户怎么说" })),
      field("副标题", inputText(heading.subtitle, (v) => store.setModuleHeading(mod.id, { subtitle: v }), { placeholder: "可选，一行说明" })),
    );

    if (isFrag) {
      form.append(
        h(
          "div",
          { class: "form-note", style: { borderLeftColor: "var(--press)", background: "var(--press-soft)" } },
          `这一块引用的是组件「${store.fragmentById(mod.fragmentId)?.name ?? mod.fragmentId}」。` +
            "在这里改标题、配置只影响这一处；改内容请到下面的条目列表里逐条覆盖，或去「组件」标签页改本体。",
        ),
      );
    }

    if (mod.type === "card-grid") {
      form.append(
        field(
          "卡片类型",
          h(
            "select",
            {
              class: "select",
              onchange: (e) => store.updateModuleProps(mod.id, { kind: e.target.value }),
            },
            ...[
              ["products", "产品 / 服务（要规格表）"],
              ["cases", "案例（要客户名与量化结果）"],
              ["insights", "洞察 / 文章"],
            ].map(([v, label]) => h("option", { value: v, selected: (props?.kind ?? "products") === v, text: label })),
          ),
          "类型决定校验规则：案例缺客户名会拦住发布。",
        ),
      );
    }

    form.append(
      h(
        "div",
        { class: "hstack gap8", style: { marginTop: "6px" } },
        h("button", {
          class: "btn btn--sm",
          type: "button",
          text: "+ 加一条",
          onclick: () => store.addManualItem(mod.id),
        }),
        h("button", {
          class: "btn btn--sm",
          type: "button",
          text: "从知识库引用",
          onclick: () => openKbPicker({ moduleId: mod.id, onPick: (it) => store.addKbItem(it, mod.id) }),
        }),
        h("span", { class: "sp" }),
        h("button", {
          class: "btn btn--sm",
          type: "button",
          text: "存成片段",
          title: "把这一块内容存进片段库，别的页面可以复用",
          onclick: () => saveAsFragment(mod),
        }),
        h("button", {
          class: "btn btn--stamp btn--sm",
          type: "button",
          text: "删除模块",
          onclick: () => confirmDeleteModule(mod),
        }),
      ),
    );

    pane.append(
      form,
      h("div", { class: "section-label", style: { marginTop: "20px" }, text: isFrag ? "条目（片段本体 + 本地追加）" : "条目" }),
      h(
        "div",
        { class: "stack gap4" },
        ...(isFrag
          ? store.fragmentEntries(mod).map((e, i) =>
              h(
                "button",
                {
                  class: "item",
                  type: "button",
                  style: { border: "1px solid var(--rule)", background: "var(--sheet)", borderRadius: "4px" },
                  onclick: () => store.select({ pageId: page.id, moduleId: mod.id, itemId: e.id }),
                },
                h("span", { class: "mod__count", text: String(i + 1) }),
                h("span", { class: "item__t", text: e.label }),
                h("span", { class: "tag tag--frag", text: e.origin === "local" ? "本地" : "片段" }),
                e.override ? h("span", { class: "tag", text: "改过" }) : null,
                e.hidden ? h("span", { class: "tag tag--draft", text: "已隐藏" }) : null,
                icon("chevronRight", 12),
              ),
            )
          : store.itemsOf(mod).map((it, i) =>
              h(
                "button",
                {
                  class: "item",
                  type: "button",
                  style: { border: "1px solid var(--rule)", background: "var(--sheet)", borderRadius: "4px" },
                  onclick: () => store.select({ pageId: page.id, moduleId: mod.id, itemId: it.id }),
                },
                h("span", { class: "mod__count", text: String(i + 1) }),
                h("span", { class: "item__t", text: it.title || it.question || it.label || "无标题" }),
                it.source === "kb" ? h("span", { class: "tag tag--kb", text: "知识库" }) : null,
                it.published ? null : h("span", { class: "tag tag--draft", text: "草稿" }),
                icon("chevronRight", 12),
              ),
            )),
      ),
    );
    return pane;
  }

  /* ── 只有页面 ─────────────────────────────────────────── */
  function pageOnly() {
    const page = store.currentPage();
    const pane = h("div", { class: "pane pane--pad" });
    pane.append(
      empty({
        title: "这一页还没有模块",
        text: "从英雄区开始：一屏之内说清「你是谁、为谁解决什么」，再往下加证据。",
        mark: "block",
        action: h(
          "div",
          { class: "hstack gap6" },
          h("button", { class: "btn btn--ink btn--sm", type: "button", text: "加英雄区", onclick: () => store.addModule("hero") }),
          h("button", { class: "btn btn--sm", type: "button", text: "页面设置", onclick: () => openPageSettings(page) }),
        ),
      }),
    );
    return pane;
  }

  /* ── 页面设置 ─────────────────────────────────────────── */
  function openPageSettings(page, isNew = false) {
    const body = h("div", { class: "stack gap12", style: { padding: "4px 0" } });
    const draft = { ...page };
    const fieldBox = (label, ctl, hint) => h("div", { class: "field" }, h("span", { class: "field__label", text: label }), ctl, hint ? h("span", { class: "form-note", text: hint }) : null);

    body.append(
      fieldBox("页面标题", h("input", { class: "input", value: page.title, oninput: (e) => (draft.title = e.target.value) })),
      fieldBox(
        "路径",
        h("input", { class: "input mono", value: page.path, oninput: (e) => (draft.path = e.target.value) }),
        "以 / 开头。首页用 /，其余如 /about、/products/gateway。",
      ),
      fieldBox(
        "页面描述",
        h("textarea", { class: "textarea", rows: 2, oninput: (e) => (draft.description = e.target.value) }, page.description ?? ""),
        "给搜索引擎与 AI 看的一句话。每页都要有自己的一份。",
      ),
    );

    const parentSel = h(
      "select",
      { class: "select", onchange: (e) => (draft.parentId = e.target.value || undefined) },
      h("option", { value: "", text: "顶级页面" }),
      ...store.pages().filter((p) => p.id !== page.id).map((p) =>
        h("option", { value: p.id, selected: page.parentId === p.id, text: `${p.title}（${p.path}）` }),
      ),
    );
    body.append(fieldBox("父页面", parentSel, "挂在父页面下会组成栏目树。"));

    body.append(
      h(
        "div",
        { class: "hstack gap12" },
        h(
          "label",
          { class: "check" },
          h("input", { type: "checkbox", checked: page.published, onchange: (e) => (draft.published = e.target.checked) }),
          h("span", { text: "上线这一页" }),
        ),
        h(
          "label",
          { class: "check" },
          h("input", { type: "checkbox", checked: page.inNav !== false, onchange: (e) => (draft.inNav = e.target.checked) }),
          h("span", { text: "出现在导航" }),
        ),
      ),
    );

    const foot = [
      !isNew
        ? h("button", {
            class: "btn btn--stamp",
            type: "button",
            text: "删除页面",
            onclick: () => {
              dialog({
                title: `删除「${page.title}」？`,
                body: "页面上的模块与条目会一起消失。这一步可以 ⌘Z 撤销，但撤销后要重新保存。",
                confirmLabel: "删除",
                danger: true,
                onConfirm: () => {
                  store.deletePage(page.id);
                  d.close();
                  toast("页面已删除", {
                    actionLabel: "撤销",
                    onAction: () => {
                      store.undo();
                      paintAll();
                    },
                  });
                },
              });
            },
          })
        : null,
      h("span", { class: "sp" }),
      h("button", { class: "btn", type: "button", text: "取消", onclick: () => d.close() }),
      h("button", {
        class: "btn btn--ink",
        type: "button",
        text: isNew ? "创建页面" : "保存设置",
        onclick: () => {
          if (!draft.path?.startsWith("/")) {
            toast("路径要以 / 开头", { kind: "err" });
            return;
          }
          store.updatePage(page.id, draft);
          d.close();
          paintAll();
        },
      }),
    ];

    const d = drawer({ title: isNew ? "新页面" : "页面设置", body, foot, width: "520px" });
    if (isNew) setTimeout(() => body.querySelector("input")?.select(), 60);
  }

  /* ── 动作 ─────────────────────────────────────────────── */
  function addKbToCurrent(kbItem) {
    const page = store.currentPage();
    let mod = store.currentModule(page);
    if (!mod) {
      mod = store.addModule("rich-text");
    }
    if (!mod) return;
    store.addKbItem(kbItem, mod.id);
    setMode("edit");
  }

  function removeItem(mod, item) {
    store.deleteItem(mod.id, item.id);
    toast(`已移除「${item.title || item.question || "条目"}」`, {
      actionLabel: "撤销",
      onAction: () => {
        store.undo();
        paintAll();
      },
    });
  }

  function confirmDeleteModule(mod) {
    dialog({
      title: `删除模块「${mod.title || store.MODULE_TYPE_LABEL[mod.type]}」？`,
      body: `这个模块里的 ${mod.items?.length ?? 0} 条内容会一起删除。`,
      confirmLabel: "删除",
      danger: true,
      onConfirm: () => {
        store.deleteModule(mod.id);
        toast("模块已删除", {
          actionLabel: "撤销",
          onAction: () => {
            store.undo();
            paintAll();
          },
        });
      },
    });
  }

  async function setReview(decision, page, mod, item) {
    try {
      // 统一走 store：服务端写盘 → 本地同步 → 立刻重算校样，阻断随即消失
      await store.reviewItem({ pageId: page.id, moduleId: mod.id, itemId: item.id }, decision);
      deskKey = "";
      paintDesk(true);
      paintStruct();
      toast(`已${{ pending: "提交审核", approved: "通过审核", rejected: "驳回" }[decision]} · 已重新校验`, { kind: "ok" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
    }
  }

  async function saveAsFragment(mod) {
    const name = mod.title || store.MODULE_TYPE_LABEL[mod.type] || "片段";
    try {
      await api.createFragment(store.state.siteId, {
        name,
        description: `来自「${store.currentPage()?.title}」`,
        module: {
          type: mod.type,
          title: mod.title,
          subtitle: mod.subtitle,
          items: store.itemsOf(mod),
          props: mod.props,
        },
      });
      toast(`已存为片段「${name}」—— 在组件区可以复用`, { kind: "ok" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
    }
  }

  function openMoveDialog(page, mod, item) {
    const options = [];
    for (const p of store.pages()) {
      for (const m of store.modulesOf(p)) options.push({ page: p, mod: m });
    }
    const sel = h(
      "select",
      { class: "select" },
      ...options.map((o) =>
        h("option", {
          value: `${o.page.id}::${o.mod.id}`,
          selected: o.mod.id === mod.id,
          text: `${o.page.title} › ${o.mod.title || o.mod.type}`,
        }),
      ),
    );
    dialog({
      title: "移到别的模块",
      body: sel,
      confirmLabel: "移动",
      onConfirm: () => {
        const [pid, mid] = sel.value.split("::");
        if (mid === mod.id) return;
        const targetPage = store.pageById(pid);
        const targetMod = targetPage.modules.find((m) => m.id === mid);
        const clone = JSON.parse(JSON.stringify(item));
        store.deleteItem(mod.id, item.id);
        clone.order = (targetMod.items?.length ?? 0) + 1;
        targetMod.items.push(clone);
        store.touch();
        store.select({ pageId: pid, moduleId: mid, itemId: clone.id });
        toast("已移动");
      },
    });
  }

  /* ── 模块类型菜单 ─────────────────────────────────────── */
  function openModuleMenu(anchor) {
    if (!store.currentPage()) {
      toast("先建一个页面", { kind: "err" });
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const pop = h("div", {
      class: "card",
      style: {
        position: "fixed",
        top: `${rect.bottom + 6}px`,
        right: `${Math.max(12, window.innerWidth - rect.right)}px`,
        width: "320px",
        zIndex: "85",
        padding: "5px",
        maxHeight: "70vh",
        overflowY: "auto",
        boxShadow: "var(--shadow-lift)",
      },
    });
    pop.append(
      h("div", { class: "section-label", style: { margin: "4px 6px 6px" }, text: "加一个模块" }),
      ...Object.entries(store.MODULE_TYPE_LABEL).map(([type, label]) =>
        h(
          "button",
          {
            class: "cmdk__item",
            type: "button",
            style: { alignItems: "flex-start" },
            onclick: () => {
              close();
              store.addModule(type);
              setMode("edit");
            },
          },
          h("span", { style: { marginTop: "2px" } }, icon("block", 14)),
          h(
            "span",
            { class: "stack", style: { gap: "1px", minWidth: "0" } },
            h("span", { text: label }),
            h("span", { class: "muted", style: { fontSize: "11px" }, text: store.MODULE_TYPE_DESC[type] ?? "" }),
          ),
        ),
      ),
    );
    const scrim = h("div", { style: { position: "fixed", inset: "0", zIndex: "84" }, onclick: close });
    document.body.append(scrim, pop);
    function close() {
      pop.remove();
      scrim.remove();
    }
  }

  async function openFragmentPicker() {
    try {
      const d = await api.fragments(store.state.siteId);
      const fragments = d.fragments ?? d.lib?.fragments ?? [];
      const list = h("div", { class: "stack", style: { padding: "8px" } });
      const dd = drawer({
        title: "插入片段",
        subtitle: "片段只有一份内容，改一次全站跟着改",
        body: list,
        width: "520px",
        foot: h("button", {
          class: "btn",
          type: "button",
          text: "去组件区管理",
          onclick: () => {
            dd.close();
            go("components");
          },
        }),
      });
      if (!fragments.length) {
        list.appendChild(
          empty({
            title: "还没有片段",
            text: "在模块上点「存成片段」，就能把公司简介、联系方式这类内容收成一份。",
            mark: "block",
          }),
        );
        return;
      }
      for (const f of fragments) {
        list.appendChild(
          h(
            "button",
            {
              class: "cmdk__item",
              type: "button",
              style: { justifyContent: "flex-start" },
              onclick: () => {
                store.appendFragment(f);
                dd.close();
                toast(`已插入「${f.name}」`, { kind: "ok" });
              },
            },
            icon("block", 14),
            h("span", { text: f.name }),
            h("small", { text: `${f.items?.length ?? 0} 条` }),
          ),
        );
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
    }
  }

  /* ── 小工具 ───────────────────────────────────────────── */
  function field(label, control, hint) {
    return h(
      "label",
      { class: "field", dataset: { field: label } },
      h("span", { class: "field__label" }, h("span", { text: label })),
      control,
      hint ? h("span", { class: "form-note", text: hint }) : null,
    );
  }

  function inputText(value, onInput, opts = {}) {
    return h("input", {
      class: `input ${opts.mono ? "mono" : ""}`,
      value: value ?? "",
      type: opts.type ?? "text",
      placeholder: opts.placeholder ?? "",
      oninput: (e) => onInput(e.target.value),
    });
  }

  function textarea(value, onInput, opts = {}) {
    return h("textarea", {
      class: "textarea",
      rows: opts.rows ?? 3,
      placeholder: opts.placeholder ?? "",
      oninput: (e) => onInput(e.target.value),
    }, value ?? "");
  }

  const repaintStructSoon = debounce(() => paintStruct(), 220);

  function paintAll() {
    deskKey = "";
    paintHead();
    paintTree();
    paintStruct();
    paintDesk(true);
  }

  /* ── 生命周期 ─────────────────────────────────────────── */
  paintAll();
  scrollToFlash();

  /**
   * 从组件区跳过来时，把那一块滚到眼前并闪一下。
   *
   * 「这个组件被用在了哪些页面的哪些位置」——
   * 清单说有几处，**框**说在哪。这一下就是那个框。
   */
  function scrollToFlash() {
    const flash = store.state.ui.flash;
    if (!flash) return;
    const el = structBody.querySelector(`[data-mod-id="${flash.moduleId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("mod--flash");
    setTimeout(() => el.classList.remove("mod--flash"), 2600);
  }

  sortable(treeBody, ".tree__node", {
    onDrop: (from, to, after) => store.reorderPages(from, to, after),
  });

  return {
    el,
    update(reason) {
      if (reason === "select") {
        paintHead();
        paintStruct();
        // 带了待办过来：强制重绘工位，让「改什么」的提示条出现
        paintDesk(!!store.state.ui.focusIssue);
        scrollToFlash();
        return;
      }
      if (reason === "flash" || reason === "highlight") {
        paintStruct();
        scrollToFlash();
        return;
      }
      if (reason === "check") {
        paintTabsSafe();
        updateLiveBits();
        // 这条修完了就把提示收掉 —— 闭环的最后一环
        const fi = store.state.ui.focusIssue;
        if (fi && !store.state.check.problems.some((p) => p.itemId === fi.itemId && p.message === fi.message)) {
          store.clearFocus({ silent: true });
          paneHost.querySelector(".fixbar")?.remove();
          paneHost.querySelectorAll(".field--focus").forEach((f) => f.classList.remove("field--focus"));
        }
        return;
      }
      if (reason === "kb") {
        return;
      }
      if (reason === "plan" || reason === "boot") {
        paintHead();
        paintTree();
        paintStruct();
        paintDesk();
        return;
      }
      if (reason === "dirty" || reason === "saved" || reason === "saving") {
        return;
      }
    },
    destroy() {
      preview = null;
    },
  };

  function paintTabsSafe() {
    paintTabs();
  }
}

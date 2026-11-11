/**
 * 概览 —— 打开后台第一屏该回答的问题：
 *   「现在站点什么状态」「我今天该动哪里」。
 *
 * 旧后台没有这一层，打开就是三栏空列表，人得自己猜从哪开始。
 */

import { h, icon, mount, empty, toast, relTime, fullTime } from "../lib/dom.js";
import * as store from "../lib/store.js";
import { api, ApiError } from "../lib/api.js";
import { classify, gotoIssue } from "../lib/fixes.js";
import { go } from "../lib/router.js";
import { openPublishPanel } from "../lib/publish.js";

export function create() {
  const el = h("div", { class: "work" });
  const body = h("div", { class: "work__body" });
  el.appendChild(body);

  let versions = [];
  let versionError = "";

  function paint() {
    const c = store.counts();
    const problems = store.state.check.problems;
    const warnings = store.state.check.warnings;
    const hold = store.state.check.checking || !store.state.check.ready || store.state.check.kbDown;
    const site = store.state.sites.find((s) => s.id === store.state.siteId);
    const pages = store.pages();
    const noDesc = pages.filter((p) => p.published && !p.description);
    const drafts = [];
    for (const pg of pages) {
      for (const m of pg.modules ?? []) {
        for (const it of m.items ?? []) if (!it.published) drafts.push({ page: pg, mod: m, item: it });
      }
    }

    const pending = store.pendingItems();
    const firstPending = pending[0];
    const pendingIssue = firstPending
      ? {
          pageId: firstPending.page.id,
          pageTitle: firstPending.page.title,
          moduleId: firstPending.mod.id,
          moduleTitle: firstPending.mod.title ?? firstPending.mod.type,
          itemId: firstPending.item.id,
          itemTitle: firstPending.item.title ?? "",
          message: firstPending.item.review === "rejected"
            ? "内容被驳回 —— 改完重新提交审核再发布"
            : "内容待审核 —— 请先让审核员通过再发布",
          level: "error",
        }
      : null;
    // 「待审」是阻断项的**子集** —— 待审内容本身就不许发布。
    //
    // 以前这里写的是「如果待审已经被算成阻断，就不显示这一行」。
    // 而待审**永远**会被算成阻断 —— 所以这一行**从来没有显示过**。
    // 「待办」入口就是这么废掉的。
    //
    // 现在反过来：阻断行给总数并说明构成，审核行永远在（有待审就在）。
    // 两个数字是包含关系，不是两个口径 —— 说得清就不会被当成矛盾。
    const reviewCount = problems.filter((p) => {
      const k = classify(p).kind;
      return k === "review" || k === "resubmit";
    }).length;

    const todos = [
      hold
        ? {
            n: "…",
            alert: true,
            title: "正在校样…",
            hint: "结果还没回来，先别发布",
            run: () => void store.runCheck().then(() => toast("已重新校验")),
          }
        : problems.length
        ? {
            n: problems.length,
            alert: true,
            title: `${problems.length} 处阻断，发布会拦下`,
            hint: reviewCount
              ? `其中 ${reviewCount} 条要审核，其余 ${problems.length - reviewCount} 条是字段问题`
              : classify(problems[0]).how,
            run: () => gotoIssue(problems[0]),
          }
        : {
            n: "✓",
            title: "没有阻断问题",
            hint: "校样通过 —— 点右上角「发布」推上线",
            run: () => openPublishPanel(),
          },
      drafts.length
        ? {
            n: drafts.length,
            title: `${drafts.length} 条草稿没上线`,
            hint: "草稿不进站点 —— 要么发布，要么删掉",
            run: () => go("content"),
          }
        : null,
      pending.length
        ? {
            n: pending.length,
            title: `${pending.length} 条内容等着审`,
            hint: "审完才进站点 —— 点这里逐条处理",
            run: () => {
              store.locate(pendingIssue);
              go("content");
            },
          }
        : null,
      noDesc.length
        ? {
            n: noDesc.length,
            title: `${noDesc.length} 个已上线页面缺描述`,
            hint: "页面描述是 AI 区分页面实体的依据",
            run: () => {
              store.select({ pageId: noDesc[0].id });
              go("content");
            },
          }
        : null,
    ].filter(Boolean);

    mount(
      body,
      h(
        "div",
        { class: "overview" },
        /* 开场：一句话 + 站点现状 */
        h(
          "div",
          { class: "lede" },
          h(
            "div",
            {},
            h("h1", {}, "先修阻断，再补草稿，", h("em", { text: "最后发布" }), "。"),
            h("p", {
              text: `${site?.name ?? "这个站点"} · ${c.publishedPages} 个页面已上线 · ${c.items} 条内容 · ${warnings.length} 处提醒。校样是持续跑的，改动会在半秒后重新校验。`,
            }),
          ),
          h(
            "div",
            { class: "lede__meta" },
            h("b", { text: store.state.lastSavedAt ? relTime(store.state.lastSavedAt) : "未保存" }),
            h("span", { text: "最近一次保存" }),
          ),
        ),

        /* 左主栏 */
        h(
          "div",
          { class: "stack gap12" },
          h(
            "div",
            { class: "stats" },
            stat("页面", c.pages, `已上线 ${c.publishedPages}`, () => go("content")),
            stat("条目", c.items, `知识库引用 ${c.kb}`, () => go("content")),
            stat("草稿", c.drafts, "未进站点", () => go("content"), c.drafts > 0),
            stat("待修", problems.length, `${warnings.length} 提醒`, () => openPublishPanel(), problems.length > 0),
          ),

          h(
            "div",
            { class: "card" },
            h(
              "div",
              { class: "card__head" },
              h("h2", { text: "待办" }),
              h("span", { class: "sp" }),
              h("button", {
                class: "btn btn--ghost btn--sm",
                type: "button",
                onclick: () => void store.runCheck().then(() => toast("已重新校验")),
              }, icon("refresh", 12), "重新校验"),
            ),
            h(
              "div",
              { class: "todo" },
              ...(todos.length
                ? todos.map((t) =>
                    h(
                      "button",
                      { class: "todo__row", type: "button", onclick: t.run },
                      h("span", { class: `todo__n ${t.alert ? "todo__n--stamp" : ""}`, text: String(t.n) }),
                      h(
                        "span",
                        { class: "todo__t" },
                        h("span", { text: t.title }),
                        t.hint ? h("small", { text: t.hint }) : null,
                      ),
                      h("span", { class: "todo__go" }, icon("chevronRight", 14)),
                    ),
                  )
                : [
                    h(
                      "div",
                      { class: "empty", style: { padding: "30px" } },
                      h("div", { class: "empty__mark" }, icon("check", 18)),
                      h("h3", { text: "干净" }),
                      h("p", { text: "没有待办。点右上角「发布」把当前编排推上线。" }),
                    ),
                  ]),
            ),
          ),

          h(
            "div",
            { class: "card" },
            h(
              "div",
              { class: "card__head" },
              h("h2", { text: "站点结构" }),
              h("span", { class: "sp" }),
              h("button", {
                class: "btn btn--ghost btn--sm",
                type: "button",
                onclick: () => go("content"),
              }, "去编排", icon("chevronRight", 12)),
            ),
            pages.length
              ? h(
                  "div",
                  { class: "structure-map" },
                  ...pages.map((p) => {
                    const mods = store.modulesOf(p);
                    const items = mods.reduce((n, m) => n + (m.items?.length ?? 0), 0);
                    const widths = mods.slice(0, 12).map((m) => Math.max(4, Math.min(28, (m.items?.length ?? 0) * 4 + 6)));
                    return h(
                      "button",
                      {
                        class: "sm__page",
                        type: "button",
                        style: { background: "none", padding: "2px 0", width: "100%", textAlign: "left" },
                        onclick: () => {
                          store.select({ pageId: p.id });
                          go("content");
                        },
                      },
                      h("span", { style: { width: "132px" }, class: "trunc", text: p.title || "未命名" }),
                      h(
                        "span",
                        { class: "sm__bar", title: `${mods.length} 模块 / ${items} 条目` },
                        ...widths.map((w) => h("i", { style: { width: `${w}%` } })),
                      ),
                      h("span", { class: "mono muted", style: { fontSize: "11px", width: "58px", textAlign: "right" }, text: `${mods.length} 模块` }),
                      p.published ? null : h("span", { class: "tag tag--draft", style: { height: "15px" }, text: "草稿" }),
                    );
                  }),
                )
              : empty({
                  title: "还没有页面",
                  text: "站点至少需要一个首页。",
                  mark: "file",
                  action: h("button", {
                    class: "btn btn--ink btn--sm",
                    type: "button",
                    text: "新建页面",
                    onclick: () => go("content"),
                  }),
                }),
          ),
        ),

        /* 右栏 */
        h(
          "div",
          { class: "stack gap12" },
          h(
            "div",
            { class: "card" },
            h(
              "div",
              { class: "card__head" },
              h("h2", { text: "最近版本" }),
              h("span", { class: "sp" }),
              h("button", {
                class: "btn btn--ghost btn--sm",
                type: "button",
                onclick: () => go("release"),
              }, "全部"),
            ),
            h(
              "div",
              { class: "timeline" },
              ...(versionError
                ? [h("div", { class: "empty", style: { padding: "20px" } }, h("p", { text: versionError }))]
                : versions.length
                  ? versions.slice(0, 5).map((v) =>
                      h(
                        "div",
                        { class: "tl" },
                        h("span", { class: "tl__dot" }),
                        h(
                          "div",
                          { class: "tl__body" },
                          h("div", { class: "tl__r", text: v.reason || "发布" }),
                          h("div", {
                            class: "tl__m",
                            text: `${fullTime(v.createdAt)} · ${v.author ?? "—"} · ${v.stats?.pages ?? 0} 页`,
                          }),
                        ),
                      ),
                    )
                  : [
                      h(
                        "div",
                        { class: "empty", style: { padding: "22px" } },
                        h("p", { text: "还没有版本记录 —— 第一次发布后会出现在这里。" }),
                      ),
                    ]),
            ),
          ),

          h(
            "div",
            { class: "card" },
            h("div", { class: "card__head" }, h("h2", { text: "快捷入口" })),
            h(
              "div",
              { class: "card__body" },
              ...[
                ["内容", "页面 · 模块 · 条目", "layers", () => go("content")],
                ["素材", "上传图片、补替代文本", "image", () => go("media")],
                ["组件", "公司简介、联系方式", "block", () => go("components")],
                ["分发", "排成公众号文章", "send", () => go("wechat")],
                ["外观", "版式与色板", "palette", () => go("appearance")],
              ].map(([t, d, ic, run]) =>
                h(
                  "button",
                  { class: "todo__row", type: "button", onclick: run },
                  h("span", { style: { color: "var(--ink-3)" } }, icon(ic, 15)),
                  h("span", { class: "todo__t" }, h("span", { text: t }), h("small", { text: d })),
                  h("span", { class: "todo__go" }, icon("chevronRight", 13)),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  function stat(k, n, sub, run, alert = false) {
    return h(
      "button",
      { class: `stat ${alert ? "stat--alert" : ""}`, type: "button", onclick: run },
      h("span", { class: "stat__n" }, String(n), h("small", { text: sub })),
      h("span", { class: "stat__k", text: k }),
    );
  }

  paint();

  api
    .history(store.state.siteId)
    .then((d) => {
      versions = d.versions ?? [];
      paint();
    })
    .catch((e) => {
      versionError = e instanceof ApiError ? e.message : String(e);
      paint();
    });

  return {
    el,
    update(reason) {
      if (reason === "check" || reason === "plan" || reason === "select" || reason === "boot") paint();
    },
  };
}

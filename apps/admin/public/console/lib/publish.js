/**
 * 发布 —— 一个动作，一处执行。
 *
 * ── 为什么要有这个模块 ────────────────────────────────
 *   旧界面里「发布」这个词出现在五个地方，其中三个是死跳转、两个挂的数字
 *   互相矛盾（见 docs/11 的「发布口径统一」）。根因不是图标多，是**职责混了**：
 *     发布 = 动作（把当前编排推上线）
 *     记录 = 档案（发过什么、怎么退回去）
 *   两者被塞进同一个「发布台」，于是每一处都得自带一个跳转按钮，
 *   用户点开才发现什么都没发生。
 *
 * ── 现在的分工 ──────────────────────────────────────
 *   顶栏「发布」按钮  →  唯一的发布入口，打开这个面板
 *   这个面板          →  唯一能真正发布的地方（发布并重建）
 *   导轨「上线记录」  →  只管版本与回滚，不放发布动作
 *
 * 按内容站的通行做法（Ghost / Contentful / Webflow）：
 *   「能不能发」的读数到处都有，执行动作只有一处；
 *   阻断清单出现在**你按下发布的那一刻**，而不是另一个页面里。
 */

import { h, icon, mount, toast, drawer, empty } from "./dom.js";
import * as store from "./store.js";
import { api, ApiError } from "./api.js";
import {
  classify,
  where,
  howTo,
  issueAction,
  publishState,
  publishStateLabel,
  canReview,
} from "./fixes.js";

/**
 * 发布动作本体 —— 全站只有这一处真的在发布。
 *
 * 顶栏按钮、发布面板、上线记录页都走它，
 * 所以「按了发布会发生什么」在代码里也是一处。
 */
export async function publishNow() {
  // 1. 有未保存的改动先落盘 —— 不然发布的是上一版
  if (store.state.dirty) {
    await store.savePlan();
    toast("已保存改动", { timeout: 1400 });
  }
  // 2. 发布前再校一次样 —— 面板打开到点发布之间可能又改了
  const plan = await store.runCheck({ silent: true });
  if (plan?.kbDown) {
    throw new Error("知识库没连上，正文没法核对 —— 恢复后再发布");
  }
  if (plan?.problems?.length) {
    throw new Error(`校验没通过 —— 刚冒出来 ${plan.problems.length} 处阻断`);
  }
  // 3. 物化 + 重建
  const d = await api.publishModules(store.state.siteId, { rebuild: true });
  void store.runCheck();
  return d;
}

/** 站点摘要 —— 发布前让人看清「要发的是什么」 */
function summaryRows() {
  const c = store.counts();
  const site = store.state.sites.find((s) => s.id === store.state.siteId);
  const base = store.state.siteBaseUrl || `${location.origin}/`;
  return [
    { k: "站点", v: site?.name ?? "—" },
    { k: "页面", v: `${c.pages} 页（${c.publishedPages} 页已上线）` },
    { k: "内容", v: `${c.items} 条（${c.kb} 条引用知识库）` },
    { k: "草稿", v: c.drafts ? `${c.drafts} 条不进站点` : "无" },
    { k: "地址", v: base },
  ];
}

/**
 * 打开发布面板。
 *
 * 面板是**动作发生的地方**，不是又一个跳转页：
 *   状态 → 阻断清单（分待审核/待修正）→ 发布并重建 → 结果
 */
export function openPublishPanel() {
  const body = h("div", { class: "stack gap12" });
  const foot = h("div", { class: "hstack gap8" });

  const panel = drawer({
    title: "发布站点",
    subtitle: "校样 → 物化 → 重建静态站",
    body,
    foot,
    width: "560px",
  });

  let busy = false;

  function paint() {
    const st = publishState();
    const problems = st.blockers ? (store.state.check.problems ?? []) : [];

    // 阻断清单按「审核 / 字段」分两段 ——
    // 「审核后才发布」这条规矩要**看得见**，不能混在一堆报错里。
    const reviewGroup = problems.filter((p) => {
      const k = classify(p).kind;
      return k === "review" || k === "resubmit";
    });
    const fixGroup = problems.filter((p) => {
      const k = classify(p).kind;
      return k !== "review" && k !== "resubmit";
    });

    mount(
      body,
      /* 摘要 */
      h(
        "div",
        { class: "publish-sum" },
        ...summaryRows().map((r) =>
          h(
            "div",
            { class: "publish-sum__row" },
            h("span", { class: "publish-sum__k", text: r.k }),
            h("span", { class: "publish-sum__v", text: r.v }),
          ),
        ),
      ),

      /* 状态 */
      h(
        "div",
        { class: `verdict ${st.hold || st.blockers ? "verdict--blocked" : ""}` },
        h("div", { class: "verdict__mark" }, icon(st.hold ? "clock" : st.blockers ? "alert" : "check", 20)),
        h(
          "div",
          { class: "verdict__t" },
          h("h3", { text: st.hold ? (st.kbDown ? "知识库没连上" : "校样还没完") : st.blockers ? "还差几处才能发" : "可以发布了" }),
          h("p", {
            text: st.hold
              ? "结果还没回来，先别发 —— 等一下就好。"
              : st.blockers
                ? "下面每条都写了要改什么，点右边的按钮就能做完。"
                : "校样通过。发布 = 校验 → 物化 → 重建静态站。",
          }),
        ),
        h("span", { class: "verdict__sp" }),
        h(
          "div",
          { class: "verdict__count" },
          h("b", { text: st.hold ? "…" : String(st.blockers) }),
          h("span", { text: st.hold ? "校样中" : st.blockers ? "处待处理" : "无阻断" }),
        ),
      ),

      /* 阻断清单 —— 分两段 */
      st.hold
        ? h("div", { class: "empty", style: { padding: "26px" } },
            h("div", { class: "empty__mark" }, icon("clock", 18)),
            h("h3", { text: "正在校样" }),
            h("p", { text: "结果还没回来。" }))
        : null,

      !st.hold && st.blockers
        ? h(
            "div",
            { class: "stack gap10" },
            reviewGroup.length
              ? group("待审核", reviewGroup, "审完才进站点 —— 不审就发不出去")
              : null,
            fixGroup.length
              ? group("待修正", fixGroup, "缺字段、链接失效之类 —— 改完自动重校验")
              : null,
          )
        : null,

      !st.hold && !st.blockers
        ? h(
            "div",
            { class: "empty", style: { padding: "26px" } },
            h("div", { class: "empty__mark" }, icon("check", 18)),
            h("h3", { text: "都处理完了" }),
            h("p", { text: "没有阻断问题，可以发布。" }),
          )
        : null,

      /* 提醒（不挡发布） */
      st.warnings
        ? h(
            "div",
            { class: "muted", style: { fontSize: "11.5px" } },
            `另有 ${st.warnings} 处提醒不挡发布。`,
          )
        : null,

      /* 结果 */
      resultBox(),
    );

    paintFoot(st);
  }

  function group(title, items, hint) {
    return h(
      "div",
      { class: "stack gap6" },
      h(
        "div",
        { class: "hstack gap8" },
        h("span", { class: "section-label", style: { flex: "1", margin: 0 }, text: title }),
        h("span", { class: "muted", style: { fontSize: "11px" }, text: `${items.length} 条 · ${hint}` }),
      ),
      h(
        "div",
        { class: "todos" },
        ...items.map((p) => todoRow(p)),
      ),
    );
  }

  function todoRow(p) {
    const s = classify(p);
    const locked = s.kind === "review" && !canReview();
    return h(
      "div",
      { class: "task" },
      h("span", { class: "task__mark" }, icon(s.kind === "review" ? "clock" : "alert", 14)),
      h(
        "div",
        { class: "task__body" },
        h("div", { class: "task__top" }, h("b", { text: s.short }), h("span", { class: "task__where", text: where(p) })),
        h("p", { class: "task__how", text: locked ? `${howTo(p)} 你没有审核权限，点右边看内容。` : howTo(p) }),
        p.itemTitle ? h("span", { class: "task__item mono", text: p.itemTitle }) : null,
      ),
      h("div", { class: "task__act" }, issueAction(p, { onDone: () => paint() })),
    );
  }

  let lastResult = null;

  function resultBox() {
    if (!lastResult) return null;
    const r = lastResult;
    const ok = r.ok !== false;
    const rb = r.rebuild;
    const rebuilt = !!rb?.ok;
    const stale = ok && !rebuilt;
    const base = store.state.siteBaseUrl || `${location.origin}/`;
    const fromEnv = store.state.siteBaseFrom === "env";
    const previewUrl = fromEnv
      ? base
      : store.state.sites.find((s) => s.id === store.state.siteId)?.previewUrl
        ? new URL(store.state.sites.find((s) => s.id === store.state.siteId).previewUrl, base).href
        : base;
    const siteId = store.state.siteId ?? "";
    const edited = (store.currentPage?.()?.path || "/").trim();
    const pagePath = edited === "/" ? "/" : `/${edited.replace(/^\/+|\/+$/g, "")}/`;
    const pageUrl = fromEnv
      ? new URL(pagePath, base).href
      : new URL(`/preview/${encodeURIComponent(siteId)}${pagePath}`, base).href;
    const rebuildText = !rb
      ? "未重建（只物化）"
      : rb.ok
        ? `已重建 · ${Math.round((rb.ms ?? 0) / 1000)} 秒 · ${rb.pages ?? "?"} 页`
        : `站点还没更新：${rb.reason ?? "重建失败"}`;

    return h(
      "div",
      { class: "publish-box", style: { borderColor: !ok || stale ? "var(--stamp)" : "var(--rule)" } },
      h("h3", { text: ok ? "发布完成" : "发布被拦下" }),
      ok
        ? h(
            "div",
            { class: "publish-open" },
            h(
              "div",
              { class: "publish-open__t" },
              h("b", { text: stale ? "内容已发布，本地预览还是上一版" : "站点已经更新" }),
              h("p", {
                text: stale
                  ? "站点域名由部署流水线更新；本地重建没成功，看下面的构建输出排查。"
                  : "点开是站点首页；内容区编辑的页面在它自己的路径下。",
              }),
            ),
            h(
              "div",
              { class: "hstack gap8" },
              h(
                "a",
                { class: `btn ${stale ? "" : "btn--stamp"} btn--sm`, href: previewUrl, target: "_blank", rel: "noopener" },
                icon("external", 14),
                stale ? "打开本地预览" : "打开站点",
              ),
              h(
                "a",
                { class: "btn btn--ghost btn--sm", href: pageUrl, target: "_blank", rel: "noopener" },
                icon("external", 14),
                `打开 ${pagePath}`,
              ),
            ),
          )
        : null,
      h(
        "div",
        { class: "publish-box__list" },
        h("div", {}, "页面：", h("b", { text: String(r.pages ?? 0) })),
        h("div", {}, "版本：", h("b", { text: r.version?.id ?? "未留档" })),
        h("div", {}, "重建：", h("b", { text: rebuildText })),
      ),
    );
  }

  function paintFoot(st) {
    mount(
      foot,
      h("span", { class: "muted", style: { fontSize: "11.5px", flex: "1" }, text: publishStateLabel(st) }),
      h("button", {
        class: "btn btn--ghost btn--sm",
        type: "button",
        disabled: busy,
        onclick: () => panel.close(),
      }, "取消"),
      h(
        "button",
        {
          class: `btn ${st.blockers || st.hold ? "" : "btn--stamp"} btn--sm`,
          type: "button",
          disabled: busy || st.hold || !!st.blockers,
          title: st.hold ? "校样还没就绪" : st.blockers ? "先把上面的阻断处理完" : "保存 → 物化 → 重建",
          onclick: () => void run(),
        },
        icon("upload", 14),
        busy ? "发布中…" : "发布并重建",
      ),
    );
  }

  async function run() {
    if (busy) return;
    busy = true;
    paint();
    try {
      const d = await publishNow();
      lastResult = d;
      busy = false;
      paint();
      if (d.rebuild && d.rebuild.ok === false) {
        toast("已物化，但站点还没更新 —— 看构建输出", { kind: "err", timeout: 6000 });
      } else {
        toast("发布完成，站点已重建", { kind: "ok" });
      }
      store.emit("published");
    } catch (e) {
      busy = false;
      paint();
      const err = e instanceof ApiError ? e : null;
      if (err?.body?.problems) lastResult = { ok: false, problems: err.body.problems, pages: 0 };
      toast(err?.message ?? String(e?.message ?? e), { kind: "err", timeout: 6000 });
    }
  }

  paint();
  return panel;
}

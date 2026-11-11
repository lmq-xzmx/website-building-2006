/**
 * 上线记录 —— 只管**档案**：发过什么、每一版改了什么、怎么退回去。
 *
 * ── 为什么这一页不再有「发布」按钮 ──────────────────────
 *   旧界面里这一页叫「发布台」，左边管校验、右边管版本，
 *   顶栏还挂着一颗同名的「发布」按钮 —— 三个入口，一个动作。
 *   用户点开顶栏那颗发现只是换了个页，繁琐就是这么来的。
 *
 *   现在的分工：
 *     发布 = 动作 → 顶栏的「发布」按钮 → 发布面板（全站唯一执行处）
 *     记录 = 档案 → 这一页
 *
 *   发布动作不搬来这里，是刻意的：**执行点只能有一个**。
 *   这一页放的是读数（现在什么状态、上次什么时候发的），不是按钮。
 */

import { h, icon, mount, toast, dialog, empty, fullTime } from "../lib/dom.js";
import * as store from "../lib/store.js";
import { api, ApiError } from "../lib/api.js";
import { publishState, publishStateLabel } from "../lib/fixes.js";

export function create() {
  const el = h("div", { class: "work" });
  const head = h("div", { class: "work__head" });
  const main = h("div", { class: "release__main" });
  const side = h("div", { class: "release__side" });

  let versions = [];
  let selectedVersion = null;
  let diff = null;
  let historyError = "";

  el.append(head, h("div", { class: "release" }, main, side));

  function paintHead() {
    mount(
      head,
      h(
        "div",
        { class: "work__title" },
        h("h1", { text: "上线记录" }),
        h("p", { text: "发过什么、每一版改了什么、怎么退回去。发布在右上角那顆按钮。" }),
      ),
      h(
        "div",
        { class: "work__actions" },
        h("button", {
          class: "btn btn--ghost btn--sm",
          type: "button",
          title: "重新跑一遍校样",
          onclick: () => void store.runCheck().then(() => toast("已重新校验")),
        }, icon("refresh", 14), "重新校验"),
      ),
    );
  }

  function paintMain() {
    const st = publishState();
    const site = store.state.sites.find((s) => s.id === store.state.siteId);
    const last = versions[0];

    const stateCard = h(
      "div",
      { class: `verdict ${st.hold || st.blockers ? "verdict--blocked" : ""}` },
      h("div", { class: "verdict__mark" }, icon(st.hold ? "clock" : st.blockers ? "alert" : "check", 22)),
      h(
        "div",
        { class: "verdict__t" },
        h("h2", { text: st.hold ? "校样还没完" : st.blockers ? "现在还发不出去" : "现在可以发布" }),
        h("p", {
          text: st.hold
            ? "结果还没回来，先别发 —— 等一下就好。"
            : st.blockers
              ? `${st.blockers} 处待处理（其中 ${st.review} 条待审）。点右上角「发布」逐条处理。`
              : "校样通过。点右上角「发布」就能把当前编排推上线。",
        }),
      ),
      h("span", { class: "verdict__sp" }),
      h(
        "div",
        { class: "verdict__count" },
        h("b", { text: st.hold ? "…" : String(st.blockers) }),
        h("span", { text: st.hold ? "校样中" : st.blockers ? "处待处理" : "无阻断" }),
      ),
    );

    const lastRelease = last
      ? h(
          "div",
          { class: "publish-box__list", style: { marginTop: "10px" } },
          h("div", {}, "上次上线：", h("b", { text: fullTime(last.createdAt) })),
          h("div", {}, "操作者：", h("b", { text: last.author ?? "—" })),
          h("div", {}, "那一版：", h("b", { text: `${last.stats?.pages ?? 0} 页 / ${last.stats?.items ?? 0} 条` })),
        )
      : null;

    mount(
      main,
      h(
        "div",
        { class: "work__body", style: { overflowY: "auto" } },
        h(
          "div",
          { style: { padding: "16px 22px 40px" } },
          stateCard,
          lastRelease,
          h(
            "div",
            { class: "muted", style: { fontSize: "11.5px", marginTop: "14px", lineHeight: "1.7" } },
            h("div", { text: `站点：${site?.name ?? "—"} · 当前 ${publishStateLabel(st)}` }),
            h("div", { text: "发布 = 校样 → 物化到 content/modules.generated.ts → 重建静态站 → 留档。" }),
            h("div", { text: "回滚只把编排退回去，不会自动上线 —— 退完还要再发布一次。" }),
          ),
        ),
      ),
    );
  }

  function paintSide() {
    if (historyError) {
      mount(side, empty({ title: "读不到版本", text: historyError, mark: "alert" }));
      return;
    }
    if (!versions.length) {
      mount(
        side,
        empty({
          title: "还没有版本",
          text: "第一次发布后会在这里留档。回滚就是回到某一版。",
          mark: "clock",
        }),
      );
      return;
    }

    mount(
      side,
      h(
        "div",
        { class: "col__head", style: { background: "var(--paper)" } },
        h("h2", { text: "版本" }),
        h("span", { class: "sp" }),
        h("span", { class: "muted mono", style: { fontSize: "10.5px" }, text: `${versions.length} 版` }),
      ),
      h(
        "div",
        { class: "col__body" },
        h(
          "div",
          { class: "vers" },
          ...versions.map((v) =>
            h(
              "button",
              {
                class: `ver ${selectedVersion?.id === v.id ? "ver--sel" : ""}`,
                type: "button",
                onclick: () => {
                  selectedVersion = v;
                  diff = null;
                  paintSide();
                  void loadDiff(v.id);
                },
              },
              h("div", { class: "ver__r", text: v.reason || "发布" }),
              h("div", {
                class: "ver__m",
                text: `${fullTime(v.createdAt)} · ${v.author ?? "—"}`,
              }),
              h("div", {
                class: "ver__m",
                text: `${v.stats?.pages ?? 0} 页 / ${v.stats?.items ?? 0} 条`,
              }),
            ),
          ),
        ),
        selectedVersion ? h("div", { style: { borderTop: "1px solid var(--rule)" } }, diffPanel()) : null,
      ),
    );
  }

  function diffPanel() {
    if (!diff) {
      return h("div", { style: { padding: "12px 14px" } }, h("span", { class: "muted", style: { fontSize: "11.5px" }, text: "正在比对与当前的差异…" }));
    }
    const entries = diff.diff?.entries ?? [];
    return h(
      "div",
      {},
      h(
        "div",
        { class: "hstack gap6", style: { padding: "10px 14px 0" } },
        h("span", { class: "section-label", style: { flex: "1", margin: 0 }, text: "与当前的差异" }),
      ),
      entries.length
        ? h(
            "div",
            { class: "diff" },
            ...entries.slice(0, 12).map((e) =>
              h(
                "div",
                { class: "diff__row" },
                h("span", { class: "diff__k", text: e.kind === "added" ? "新增" : e.kind === "removed" ? "删除" : "改动" }),
                h(
                  "span",
                  { class: "diff__v" },
                  h("span", { style: { fontSize: "11.5px" }, text: e.path }),
                  h("div", { class: "muted", style: { fontSize: "11px" }, text: e.detail }),
                ),
              ),
            ),
            entries.length > 12 ? h("div", { class: "muted", style: { fontSize: "11px" }, text: `还有 ${entries.length - 12} 处…` }) : null,
          )
        : h("div", { class: "diff" }, h("span", { class: "muted", text: "与当前完全一致" })),
      h(
        "div",
        { style: { padding: "10px 14px 16px" } },
        h("button", {
          class: "btn btn--sm",
          type: "button",
          style: { width: "100%" },
          onclick: () => confirmRollback(selectedVersion),
        }, icon("undo", 13), "回滚到这一版"),
      ),
    );
  }

  async function loadDiff(versionId) {
    try {
      diff = await api.diff(store.state.siteId, versionId);
    } catch (e) {
      diff = { diff: { entries: [] } };
      toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
    }
    paintSide();
  }

  function confirmRollback(v) {
    dialog({
      title: `回到 ${fullTime(v.createdAt)} 那一版？`,
      body: h(
        "div",
        { class: "stack gap8" },
        h("p", { text: "当前编排会被这一版覆盖。回滚前系统会先给现在存一份快照，所以回滚本身也能再回滚。" }),
        h("p", { class: "muted", style: { fontSize: "12px" }, text: `原因：${v.reason || "发布"} · 操作者：${v.author ?? "—"}` }),
        h("p", { class: "muted", style: { fontSize: "12px" }, text: "注意：回滚只改编排，站点不会自动更新 —— 退完还要再发布一次。" }),
      ),
      confirmLabel: "回滚",
      danger: true,
      onConfirm: async () => {
        try {
          await api.rollback(store.state.siteId, v.id);
          await store.loadPlan();
          await loadHistory();
          toast("已回滚 —— 检查后需要重新发布才会生效", { kind: "ok", timeout: 5000 });
        } catch (e) {
          toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
        }
      },
    });
  }

  async function loadHistory() {
    try {
      const d = await api.history(store.state.siteId);
      versions = d.versions ?? [];
      historyError = "";
    } catch (e) {
      historyError = e instanceof ApiError ? e.message : String(e);
    }
    paintSide();
    paintMain();
  }

  paintHead();
  paintMain();
  paintSide();
  loadHistory();

  return {
    el,
    update(reason) {
      if (reason === "published") {
        // 刚发过 —— 版本列表要跟上
        void loadHistory();
        return;
      }
      if (reason === "check" || reason === "dirty" || reason === "saved" || reason === "plan") {
        paintHead();
        paintMain();
      }
    },
  };
}

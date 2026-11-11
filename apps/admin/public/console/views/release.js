/**
 * 发布台 —— 校验、上线、回滚，三件事放一屏。
 *
 * 旧界面把「发布」和「版本」放在两个标签页：发布时看不到历史，回滚时要切页。
 * 这里合成一件事：左边是「能不能发」，右边是「发过什么、怎么退回去」。
 */

import { h, icon, mount, toast, dialog, empty, fullTime } from "../lib/dom.js";
import * as store from "../lib/store.js";
import { api, ApiError } from "../lib/api.js";
import { classify, where, howTo, issueAction, gotoIssue, canReview } from "../lib/fixes.js";

export function create() {
  const el = h("div", { class: "work" });
  const head = h("div", { class: "work__head" });
  const main = h("div", { class: "release__main" });
  const side = h("div", { class: "release__side" });

  let versions = [];
  let selectedVersion = null;
  let diff = null;
  let publishing = false;
  let lastResult = null;
  let historyError = "";
  let warningsOpen = false;

  el.append(head, h("div", { class: "release" }, main, side));

  function paintHead() {
    const check = store.state.check;
    const blockers = check.problems.length;
    // 校样没跑完 / 知识库断了：不能亮发布按钮，也不能说「可以发布」
    const hold = check.checking || !check.ready || check.kbDown;
    mount(
      head,
      h(
        "div",
        { class: "work__title" },
        h("h1", { text: "发布台" }),
        h("p", { text: hold ? "校样还没就绪，先别发。" : blockers ? "下面逐条处理，处理完就能发。" : "发布 = 校验 → 物化 → 重建静态站。" }),
      ),
      h(
        "div",
        { class: "work__actions" },
        h("button", {
          class: "btn btn--sm",
          type: "button",
          onclick: () => void store.runCheck().then(() => toast("已重新校验")),
        }, icon("refresh", 14), "重新校验"),
        h("button", {
          class: `btn ${blockers || hold ? "" : "btn--stamp"} btn--sm`,
          type: "button",
          disabled: publishing || hold,
          title: hold ? "校样还没就绪" : blockers ? "去处理第一条阻断" : "保存 → 物化 → 重建",
          onclick: () => (blockers ? gotoIssue(check.problems[0]) : void publish()),
        }, icon(blockers ? "alert" : "upload", 14), publishing ? "发布中…" : hold ? "校样未就绪" : blockers ? `处理 ${blockers} 处阻断` : "发布并重建"),
      ),
    );
  }

  function paintMain() {
    const { problems, warnings, error, checking, ready, kbDown } = store.state.check;
    const hold = checking || !ready || kbDown;
    const holdTitle = checking || !ready ? "正在校样…" : "知识库没连上，发布先按住";
    const holdText = checking || !ready
      ? "结果还没回来，先别发 —— 等一下就好。"
      : "知识库断了，正文没法核对。恢复后点右上角「重新校验」。";

    const verdict = h(
      "div",
      { class: `verdict ${hold || problems.length ? "verdict--blocked" : ""}` },
      h("div", { class: "verdict__mark" }, icon(hold ? "clock" : problems.length ? "alert" : "check", 22)),
      h(
        "div",
        { class: "verdict__t" },
        h("h2", {
          text: hold ? holdTitle : problems.length ? `还差 ${problems.length} 处就能发` : "可以发布了",
        }),
        h("p", {
          text: hold
            ? holdText
            : problems.length
              ? "每条都写了要改什么，点右边按钮就能做完。审核通过后，会接着检查这条的字段。"
              : warnings.length
                ? `${warnings.length} 处提醒不挡发布。发布后会重建静态站。`
                : "校样通过。发布后会重建静态站。",
        }),
      ),
      h("span", { class: "verdict__sp" }),
      !hold && problems.length
        ? h("div", { class: "verdict__count" }, h("b", { text: String(problems.length) }), h("span", { text: "处待处理" }))
        : null,
    );

    const list = h("div", { class: "todos" }, ...problems.map((p) => todoRow(p)));

    const more = warnings.length
      ? h(
          "div",
          { class: "task__warns" },
          h(
            "button",
            {
              class: "btn btn--ghost btn--sm",
              type: "button",
              onclick: () => {
                warningsOpen = !warningsOpen;
                paintMain();
              },
            },
            icon(warningsOpen ? "chevronDown" : "chevronRight", 12),
            `${warnings.length} 条提醒 · 不挡发布`,
          ),
          warningsOpen
            ? h(
                "div",
                { class: "task__warnlist" },
                ...warnings.map((p) =>
                  h(
                    "button",
                    { class: "issue issue--warn", type: "button", onclick: () => gotoIssue(p) },
                    h("span", { class: "issue__icon" }, icon("info", 14)),
                    h(
                      "span",
                      { class: "issue__body" },
                      h("span", { class: "issue__msg", text: p.message }),
                      h("span", { class: "issue__where", text: where(p) }),
                    ),
                  ),
                ),
              )
            : null,
        )
      : null;

    const body = h(
      "div",
      { class: "work__body", style: { overflowY: "auto" } },
      h(
        "div",
        { style: { padding: "16px 22px 40px" } },
        hold
          ? h(
              "div",
              { class: "empty", style: { padding: "34px" } },
              h("div", { class: "empty__mark" }, icon("clock", 18)),
              h("h3", { text: holdTitle }),
              h("p", { text: error || holdText }),
            )
          : [
              problems.length
                ? h(
                    "div",
                    { class: "hstack gap8", style: { marginBottom: "10px" } },
                    h("span", { class: "section-label", style: { flex: "1", margin: 0 }, text: "待处理" }),
                    h("span", { class: "muted", style: { fontSize: "11px" }, text: "每处理一条就重新校验一次" }),
                  )
                : null,
              list,
              !problems.length
                ? h(
                    "div",
                    { class: "empty", style: { padding: "28px" } },
                    h("div", { class: "empty__mark" }, icon("check", 18)),
                    h("h3", { text: "都处理完了" }),
                    h("p", { text: "没有阻断问题。点右上角「发布并重建」。" }),
                  )
                : null,
              more,
            ],
        lastResult ? resultPanel(lastResult) : null,
      ),
    );

    mount(main, verdict, body);
  }

  function todoRow(p) {
    const s = classify(p);
    const reviewLocked = s.kind === "review" && !canReview();
    return h(
      "div",
      { class: "task" },
      h("span", { class: "task__mark" }, icon("alert", 14)),
      h(
        "div",
        { class: "task__body" },
        h("div", { class: "task__top" }, h("b", { text: s.short }), h("span", { class: "task__where", text: where(p) })),
        h("p", { class: "task__how", text: (reviewLocked ? `${howTo(p)} 你没有审核权限，点右边看内容。` : howTo(p)) }),
        p.itemTitle ? h("span", { class: "task__item mono", text: p.itemTitle }) : null,
      ),
      h("div", { class: "task__act" }, issueAction(p, { onDone: () => paintMain() })),
    );
  }

  function resultPanel(r) {
    const rb = r.rebuild;
    const ok = r.ok !== false;
    const rebuilt = !!rb?.ok;
    // 物化成功但没重建 —— 点开看到的还是旧页面，不能当成「已上线」
    const stale = ok && !rebuilt;
    const site = store.state.sites.find((s) => s.id === store.state.siteId);
    // 站点域名由运行环境决定：开发机跟随后台当前地址，生产机由 SITE_BASE_URL 配置。
    // 内容包 site.ts 里的 url 是 SEO canonical，不是后台访问地址，绝不拿来展示。
    const base = store.state.siteBaseUrl || `${location.origin}/`;
    const fromEnv = store.state.siteBaseFrom === "env";
    const previewUrl = fromEnv
      ? base
      : site?.previewUrl
        ? new URL(site.previewUrl, base).href
        : base;
    const publicUrl = base;
    // 「打开站点」给的是首页（固定首屏），内容区编辑的那一页在它自己的路径下。
    // 两个都给，免得用户以为改了英雄区却「没生效」。
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

    const openSite = ok
      ? h(
          "div",
          { class: `publish-open${stale ? " publish-open--stale" : ""}` },
          h(
            "div",
            { class: "publish-open__t" },
            h("b", { text: stale ? "内容已发布，本地预览还是上一版" : "站点已经更新" }),
            h("p", {
              text: stale
                ? "站点域名由部署流水线更新；本地重建没成功，看下面的构建输出排查。"
                : fromEnv
                  ? "点开是站点首页；内容区编辑的页面在对应路径下，用旁边按钮直达。正式站点由部署流水线更新。"
                  : "点开是站点首页（固定首屏，不含内容区模块）；内容区编排的页面在各自路径下，用旁边按钮直达。预览为静态版式，交互以正式站点为准。",
            }),
          ),
          previewUrl
            ? h(
                "div",
                { class: "hstack gap8" },
                h(
                  "a",
                  {
                    class: `btn ${stale ? "" : "btn--stamp"} btn--sm`,
                    href: previewUrl,
                    target: "_blank",
                    rel: "noopener",
                  },
                  icon("external", 14),
                  stale ? "打开本地预览" : "打开站点",
                ),
                h(
                  "a",
                  {
                    class: "btn btn--ghost btn--sm",
                    href: pageUrl,
                    target: "_blank",
                    rel: "noopener",
                    title: `打开内容区当前编辑的页面（${pagePath}）`,
                  },
                  icon("external", 14),
                  `打开 ${pagePath}`,
                ),
                copyBtn(previewUrl, "复制链接"),
              )
            : null,
        )
      : null;

    const domain = publicUrl
      ? h(
          "div",
          { class: "publish-url" },
          h("span", { class: "publish-url__label", text: "站点域名" }),
          h("a", {
            class: "publish-url__link mono",
            href: publicUrl,
            target: "_blank",
            rel: "noopener",
            text: publicUrl,
          }),
          copyBtn(publicUrl, "复制"),
          h("span", {
            class: "publish-url__from",
            text: fromEnv ? "生产配置 · SITE_BASE_URL" : "开发机 · 跟随后台地址",
          }),
        )
      : null;

    return h(
      "div",
      {
        class: "publish-box",
        style: {
          marginTop: "16px",
          borderColor: !ok || stale ? "var(--stamp)" : "var(--rule)",
        },
      },
      h("h3", { text: ok ? "发布完成" : "发布被拦下" }),
      openSite,
      domain,
      h(
        "div",
        { class: "publish-box__list" },
        h("div", {}, "页面：", h("b", { text: String(r.pages ?? 0) })),
        h("div", {}, "版本：", h("b", { text: r.version?.id ?? "未留档" })),
        h("div", {}, "重建：", h("b", { text: rebuildText })),
      ),
      h(
        "details",
        {},
        h("summary", {
          style: { cursor: "pointer", fontSize: "11px", color: "var(--ink-3)" },
          text: "技术细节 · 产物路径与构建输出（排错时才看）",
        }),
        h(
          "div",
          { class: "publish-box__list", style: { marginTop: "8px" } },
          h("div", {}, "物化产物：", h("b", { text: shortPath(r.written ?? "") })),
        ),
        rb?.output
          ? h("pre", {
              class: "mono",
              style: {
                fontSize: "10.5px",
                whiteSpace: "pre-wrap",
                maxHeight: "160px",
                overflow: "auto",
                background: "var(--sheet)",
                border: "1px solid var(--rule)",
                padding: "8px",
                margin: "6px 0 0",
              },
              text: rb.output,
            })
          : null,
      ),
    );
  }

  function copyBtn(value, label) {
    return h(
      "button",
      {
        class: "btn btn--ghost btn--sm",
        type: "button",
        title: value,
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast("链接已复制", { kind: "ok" });
          } catch {
            toast(value, { timeout: 5000 });
          }
        },
      },
      icon("copy", 13),
      label,
    );
  }

  function shortPath(p) {
    return p.replace(/^.*?(sites\/)/, "$1");
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

  async function publish() {
    publishing = true;
    lastResult = null;
    paintHead();
    try {
      if (store.state.dirty) {
        await store.savePlan();
        toast("已保存改动", { timeout: 1400 });
      }
      const plan = await store.runCheck({ silent: true });
      if (plan?.kbDown) {
        publishing = false;
        paintHead();
        toast("知识库没连上，正文没法核对 —— 恢复后再发布", { kind: "err", timeout: 6000 });
        return;
      }
      if (plan?.problems?.length) {
        publishing = false;
        paintHead();
        toast("校验没通过 —— 见下面清单", { kind: "err" });
        return;
      }
      const d = await api.publishModules(store.state.siteId, { rebuild: true });
      lastResult = d;
      publishing = false;
      paintHead();
      paintMain();
      if (d.rebuild && d.rebuild.ok === false) {
        toast("已物化，但站点还没更新 —— 看构建输出", { kind: "err", timeout: 6000 });
      } else {
        toast("发布完成，站点已重建", { kind: "ok" });
      }
      await loadHistory();
      void store.runCheck();
    } catch (e) {
      publishing = false;
      paintHead();
      const err = e instanceof ApiError ? e : null;
      if (err?.body?.problems) {
        lastResult = { ok: false, problems: err.body.problems, pages: 0 };
        paintMain();
      }
      toast(err ? err.message : String(e), { kind: "err", timeout: 6000 });
    }
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
  }

  paintHead();
  paintMain();
  paintSide();
  loadHistory();

  return {
    el,
    update(reason) {
      // 审核通过 / 一键修复会 emit("plan")，清单要跟着少一条
      if (reason === "check" || reason === "dirty" || reason === "saved" || reason === "plan") {
        paintHead();
        paintMain();
      }
    },
  };
}

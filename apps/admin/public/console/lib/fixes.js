/**
 * 阻断问题 → 一个能做完的动作。
 *
 * 旧界面里，校验结果只是一句报错 + 一个「跳到内容区」的箭头：
 *   人到了内容区，不知道该改哪个字段、也不知道「待审核」去哪审。
 * 这里把校验文案翻译成待办：说清改什么、给一个按钮、做完自动重校验。
 *
 * classify() 是纯函数（只认文案）；动作落在 store / router 上，
 * 发布面板、内容区、概览共用同一套，不会三处各写一遍、各断一处。
 */

import { h, icon, toast } from "./dom.js";
import * as store from "./store.js";
import { go } from "./router.js";
import { ApiError } from "./api.js";

/** 校验文案 → 待办规格 */
export function classify(p) {
  const m = p?.message ?? "";
  const spec = {
    kind: "field",
    short: m.replace(/ —— .*$/, "").replace(/（.*$/, "") || "这条内容要补一下",
    how: "打开对应字段把缺的内容补上，这条阻断会自动消失。",
    fieldLabel: "",
    autoLabel: "",
    autoPatch: null,
    cta: "去改",
    decision: "",
    done: "",
  };

  const F = (short, how, fieldLabel, cta) =>
    Object.assign(spec, { kind: "field", short, how, fieldLabel, cta: cta ?? `去改${fieldLabel}` });

  // 审核：以前只报错，没有按钮，链路在这里断开
  if (m.startsWith("内容待审核")) {
    return Object.assign(spec, {
      kind: "review",
      short: "这条内容还没审",
      how: "核对内容后点「通过审核」。通过后阻断自动消失，不用再跑一遍。",
      cta: "通过审核",
      decision: "approved",
      done: "已通过审核",
    });
  }
  if (m.startsWith("内容被驳回")) {
    return Object.assign(spec, {
      kind: "resubmit",
      short: "这条内容被驳回",
      how: "先按驳回意见改内容，再重新提交审核，等审核员通过。",
      cta: "重新提交审核",
      decision: "pending",
      done: "已重新提交审核",
    });
  }

  // 唯一能安全自动修的一条：补问号不动内容含义
  if (m.includes("FAQ 问题应是问句")) {
    return Object.assign(spec, {
      kind: "auto",
      short: "问题少了问号",
      how: "在「问题」末尾补个问号。也可以一键补，改完能撤销。",
      fieldLabel: "问题",
      autoLabel: "补个问号",
      autoPatch: (item) => {
        const q = (item.question ?? "").trim();
        return q ? { question: q.replace(/[?？]+$/, "") + "？" } : null;
      },
      cta: "去改问题",
      done: "问号补好了",
    });
  }

  if (m.includes("FAQ 缺问题")) return F("FAQ 缺问题", "在「问题」里写客户会怎么问，用他们的原话。", "问题");
  if (m.includes("FAQ 缺答案")) return F("FAQ 缺答案", "在「答案」里先给结论，再补一句依据。", "答案");
  if (m.includes("数据条缺数值")) return F("数据条缺数值", "在「数值」里填上数字，例如 99.95。", "数值");
  if (m.includes("数据条缺标签")) return F("数据条缺标签", "在「标签」里写清这个数字说的是什么。", "标签");
  if (m.includes("案例缺客户名")) return F("案例缺客户名", "填上客户名，AI 才知道这个案例说的是谁。", "客户名");
  if (m.includes("案例缺量化结果")) return F("案例缺量化结果", "补一条可核对的结果数字。", "结果");
  if (m.includes("产品缺规格表")) return F("产品缺规格表", "补上规格参数，别让产品页只剩一句形容。", "规格");
  if (m.includes("正文为空")) return F("正文是空的", "写点正文，或把这条换成引用知识库条目。", "正文");
  if (m.includes("知识库中找不到") || m.includes("没有指定知识条目")) {
    return Object.assign(spec, {
      kind: "kb",
      short: "知识库引用失效",
      how: "重新选一条知识库条目，或者把这条改成手写内容。",
      cta: "去处理引用",
    });
  }
  if (m.includes("缺 H1")) return F("英雄区缺主标题", "在「标题」里用一句话说清你是谁。", "标题");
  if (m.includes("行动号召缺标题")) return F("行动号召缺标题", "在「标题」里写清下一步做什么。", "标题");
  if (m.includes("行动号召缺跳转链接")) return F("行动号召缺链接", "在「链接」里填上点击后去哪。", "链接");
  if (m.includes("信任背书缺标题")) return F("背书缺标题", "在「标题」里写明是哪项资质或哪份数据。", "标题");
  if (m.includes("信任背书缺图片")) return F("背书缺图片", "上传资质证书或数据来源截图。", "图片");
  if (m.includes("客户 logo 缺客户名")) return F("Logo 缺客户名", "在「标题」里写清客户是谁。", "标题");
  if (m.includes("客户 logo 缺图片")) return F("Logo 缺图片", "上传客户 logo。", "图片");
  if (m.includes("缺 alt")) return F("图片缺说明", "在「替代文字」里写清图里是什么。", "替代文字");
  if (m.includes("流程步骤缺标题")) return F("步骤缺标题", "在「标题」里写清这一步做什么。", "步骤标题");
  if (m.includes("流程步骤缺序号")) return F("步骤缺序号", "在「第几步」里填序号，顺序不能丢。", "第几步");
  if (m.includes("流程步骤缺说明")) return F("步骤缺说明", "在「说明」里补一句这一步客户要做什么。", "说明");
  if (m.includes("表单模块缺提交结果说明")) return F("表单缺结果说明", "在「标题」里写清提交后会发生什么。", "标题");
  if (m.includes("表单没有定义字段")) return F("表单没有字段", "给这个模块补上至少一个字段。", "", "去改模块");
  if (m.includes("表单字段缺")) return F("表单字段没填全", "打开表单字段，把缺的项补上。", "", "去改模块");

  if (!p?.itemId) {
    return Object.assign(spec, {
      kind: "page",
      short: spec.short,
      how: "这是页面级问题，打开页面设置把缺的内容补上。",
      cta: "去改页面",
    });
  }
  return spec;
}

/** 位置：只留两层，条目名已经在待办标题里说明过 */
export function where(p) {
  return [p?.pageTitle, p?.moduleTitle].filter(Boolean).join(" · ") || "站点级";
}

/**
 * 「怎么做」—— 知识库导入的条目特别说明一句：
 * 后台改的是展示字段，不会动知识库原文，免得人不敢下手。
 */
export function howTo(p) {
  const base = classify(p).how;
  const item = store.findItem(p);
  return item?.source === "kb"
    ? `${base}这条引用自知识库，改这里不会动原文。`
    : base;
}

/** 有没有权限点「通过」 */
export function canReview() {
  return store.can("content.review");
}

/**
 * 发布状态 —— **一处算，处处用**。
 *
 * 为什么要有这个函数：
 *   「待处理 N 处」「M 条待审」「K 条草稿」这三个数字原来分散在
 *   顶栏、导轨、发布面板、概览四处各算各的 —— 同一个事情四个口径。
 *   点开发现对不上，整套界面就不可信了。
 *
 * 现在口径只有一份：**阻断清单 `check.problems` 是唯一事实源**，
 * 「待审核」是它的子集（待审内容本身就不许发布）。
 *
 * 分组依据 `classify()` 的 kind，不靠文案匹配 —— 文案一改就断。
 */
export function publishState() {
  const check = store.state.check;
  const problems = check.problems ?? [];
  const hold = check.checking || !check.ready || check.kbDown;

  let review = 0;
  for (const p of problems) {
    const k = classify(p).kind;
    if (k === "review" || k === "resubmit") review++;
  }
  const toFix = problems.length - review;
  const c = store.counts();

  return {
    /** 校样没就绪 / 知识库断了 —— 现在还不能判断能不能发 */
    hold,
    kbDown: !!check.kbDown,
    /** 挡住发布的总数（含待审） */
    blockers: problems.length,
    /** 其中等着审核的 */
    review,
    /** 其中要改字段的 */
    toFix,
    /** 没发布的条目 —— 不挡发布，只是不会上线 */
    drafts: c.drafts,
    /** 不挡发布的提醒 */
    warnings: (check.warnings ?? []).length,
    /** 校样通过、没阻断 */
    ready: !hold && problems.length === 0,
  };
}

/** 发布状态的一句话 —— 顶栏、发布面板、上线记录共用同一句 */
export function publishStateLabel(st) {
  if (st.hold) return st.kbDown ? "知识库未连" : "校样中…";
  if (!st.blockers) return "可发布";
  if (st.review === st.blockers) return `${st.review} 条待审`;
  return `${st.blockers} 处待处理`;
}

/** 跳到出问题的地方，并带上一条「改什么」的提示 */
export function gotoIssue(p) {
  if (!p) return;
  store.locate(p);
  go("content");
}

/** 执行能在原地做完的动作；需要人填内容的返回 count 0，由按钮跳转 */
export async function performFix(p) {
  const s = classify(p);
  if (s.kind === "review" && !canReview()) {
    throw new Error("通过审核需要审核员权限 —— 先看内容，或让审核员来点");
  }
  if (s.kind === "review" || s.kind === "resubmit") {
    const n = await store.reviewItem(p, s.decision);
    return { message: s.done, count: n };
  }
  if (s.kind === "auto") {
    const n = await store.applyAutoFix(p, s);
    return { message: s.done, count: n };
  }
  return { message: "", count: 0 };
}

/**
 * 待办右侧那颗按钮。发布面板 / 内容区提示条共用。
 * onDone 只用来关掉局部 UI，清单刷新由 store 的 check / plan 事件负责。
 */
export function issueAction(p, { onDone } = {}) {
  const s = classify(p);
  const isFix = s.kind === "review" || s.kind === "resubmit" || s.kind === "auto";
  const reviewAllowed = s.kind !== "review" || canReview();
  // 一键修的按钮必须说清它会自动做什么，别写「去改」却替人改了
  const label = !reviewAllowed ? "看内容" : s.kind === "auto" && s.autoLabel ? s.autoLabel : s.cta;

  return h(
    "button",
    {
      class: `btn ${isFix && reviewAllowed ? "btn--stamp" : ""} btn--sm`,
      type: "button",
      title: isFix && reviewAllowed ? s.how : "跳到内容区，改完自动重校验",
      onclick: async (e) => {
        const btn = e.currentTarget;
        if (!isFix || !reviewAllowed) {
          gotoIssue(p);
          onDone?.();
          return;
        }
        btn.disabled = true;
        const labelNode = btn.lastChild;
        const old = labelNode.nodeValue;
        labelNode.nodeValue = "处理中…";
        const before = store.state.check.problems.length;
        try {
          const r = await performFix(p);
          if (r.count) {
            const after = store.state.check.problems.length;
            // 审核通过后，这条才第一次做字段检查 —— 清单可能不减反增，得说清
            const msg = s.kind === "review" && after >= before
              ? "已通过审核 · 这条现在开始检查字段了"
              : `${r.message} · 已重新校验`;
            toast(msg, { kind: "ok", timeout: 4000 });
            store.clearFocus({ silent: true });
          } else {
            toast("这条要手动改，已带你过去", { kind: "ok" });
            gotoIssue(p);
          }
          onDone?.();
        } catch (err) {
          toast(err instanceof ApiError ? err.message : String(err?.message ?? err), { kind: "err", timeout: 6000 });
          btn.disabled = false;
          labelNode.nodeValue = old;
        }
      },
    },
    icon(s.kind === "review" ? "check" : isFix ? "refresh" : "chevronRight", 13),
    label,
  );
}

/** 内容区顶部那条「为什么带我到这里」的提示 */
export function fixBanner(p, { onDismiss } = {}) {
  const s = classify(p);
  // 要手动填字段的，字段已经高亮了 —— 再给一颗「去改」只会原地空转
  const inPlace = s.kind === "review" || s.kind === "resubmit" || s.kind === "auto";
  const how = inPlace ? howTo(p) : howTo(p).replace(/。$/, "，");
  return h(
    "div",
    { class: "fixbar" },
    h("span", { class: "fixbar__mark" }, icon("alert", 14)),
    h(
      "div",
      { class: "fixbar__t" },
      h("b", { text: `这条挡着发布 · ${s.short}` }),
      h("p", { text: inPlace ? how : `${how}字段已经标出来了。` }),
    ),
    inPlace ? issueAction(p, { onDone: onDismiss }) : null,
    h("button", {
      class: "btn btn--ghost btn--icon btn--sm",
      type: "button",
      title: "收起提示",
      "aria-label": "收起提示",
      onclick: () => {
        store.clearFocus({ silent: true });
        onDismiss?.();
      },
    }, icon("x", 13)),
  );
}

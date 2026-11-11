/**
 * 外观 —— 站点级版式与色板。
 *
 * 为什么从「编辑栏里的一列」搬出来单独一屏：
 *   外观是「客户想要什么样子」的决策，一次定一部分站，不是某一条内容的事。
 *   放在工位边上，空间只够四个小按钮，看不见效果。
 */

import { h, icon, mount, toast } from "../lib/dom.js";
import * as store from "../lib/store.js";
import { previewFrame, appearanceTokens } from "../lib/preview.js";

const LAYOUTS = [
  ["centered", "居中陈述", "首屏居中，一屏一句话。适合服务型公司。"],
  ["split", "左文右图", "文案与图并排，信息密度高。适合有产品实拍的企业。"],
  ["editorial", "编辑部", "大字标题、衬线、单栏长文。适合内容驱动。"],
  ["bold", "整版色块", "首屏整块主色，视觉冲击强。适合品牌发布。"],
];

const DENSITIES = [
  ["comfortable", "舒展", "段落之间留白多，读起来慢但舒服。"],
  ["compact", "紧凑", "信息密度高，一屏能说更多。"],
];

const STYLES = [
  ["modern", "现代", "圆角、轻阴影，边界柔和。"],
  ["classic", "经典", "近乎直角，衬线标题，稳重。"],
  ["minimal", "极简", "无圆角无阴影，只靠线与留白。"],
];

const VARIANTS = [
  ["default", "石墨", "默认墨色，朱砂作强调", "#1D2430", "#B4552F"],
  ["forest", "松林", "深松绿配暖木色", "#1E3A2C", "#A9763F"],
  ["slate", "岩蓝", "冷灰蓝，理性", "#243444", "#5C86A6"],
  ["amber", "琥珀", "深褐配金，沉稳贵气", "#3A2C1C", "#B5801F"],
];

export function create() {
  const el = h("div", { class: "work" });
  const head = h("div", { class: "work__head" });
  const form = h("div", { class: "look__form" });
  const stage = h("div", { class: "look__stage" });
  let preview = null;

  el.append(head, h("div", { class: "look" }, form, stage));

  function current() {
    return store.state.plan?.appearance ?? {};
  }

  function set(patch) {
    store.state.plan.appearance = { ...current(), ...patch };
    store.touch();
    paintForm();
    paintStage();
  }

  function paintHead() {
    mount(
      head,
      h(
        "div",
        { class: "work__title" },
        h("h1", { text: "外观" }),
        h("p", {
          text: store.state.dirty
            ? "改动已记下 —— 保存后写进编排，发布才会上线。"
            : "外观存在编排里，不碰手写内容包。换皮肤不用改代码。",
        }),
      ),
      h(
        "div",
        { class: "work__actions" },
        h("button", {
          class: "btn btn--sm",
          type: "button",
          text: "恢复默认",
          onclick: () => {
            store.state.plan.appearance = {};
            store.touch();
            paintForm();
            paintStage();
            toast("已恢复默认外观");
          },
        }),
        h("button", {
          class: "btn btn--ink btn--sm",
          type: "button",
          onclick: async () => {
            try {
              await store.savePlan();
              toast("外观已保存", { kind: "ok" });
            } catch (e) {
              toast(String(e.message ?? e), { kind: "err" });
            }
          },
        }, icon("save", 14), "保存外观"),
      ),
    );
  }

  function group(title, hint, options, key, cols = 2) {
    return h(
      "div",
      {},
      h("div", { class: "section-label", text: title }),
      h(
        "div",
        { class: "opt-grid", style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } },
        ...options.map(([value, label, desc, swatch, swatch2]) => {
          const on = (current()[key] ?? defaultOf(key)) === value;
          return h(
            "button",
            {
              class: "opt",
              type: "button",
              "aria-pressed": on ? "true" : "false",
              onclick: () => set({ [key]: value }),
            },
            h(
              "b",
              {},
              swatch
                ? h("i", { class: "swatch", style: { background: swatch, boxShadow: swatch2 ? `inset 8px 0 0 ${swatch2}` : "" } })
                : null,
              h("span", { text: label }),
            ),
            h("span", { text: desc }),
          );
        }),
      ),
      hint ? h("p", { class: "form-note", style: { marginTop: "6px" }, text: hint }) : null,
    );
  }

  function defaultOf(key) {
    return { layout: "centered", density: "comfortable", style: "modern", variant: "default" }[key];
  }

  function paintForm() {
    const ap = current();
    const t = appearanceTokens(ap);

    mount(
      form,
      group("版式", "版式是客户一眼能看出不同的那一层。", LAYOUTS, "layout"),
      group("密度", null, DENSITIES, "density"),
      group("质感", null, STYLES, "style"),
      group("色板", "四个预设够用；要贴客户 VI 就用下面的取色器。", VARIANTS, "variant"),

      h(
        "div",
        {},
        h("div", { class: "section-label", text: "自定义颜色" }),
        h(
          "div",
          { class: "colors" },
          h(
            "div",
            { class: "color-field" },
            h("span", { class: "field__label", text: "主色" }),
            h("input", {
              type: "color",
              value: ap.primaryColor || t.primary,
              onchange: (e) => set({ primaryColor: e.target.value }),
            }),
          ),
          h(
            "div",
            { class: "color-field" },
            h("span", { class: "field__label", text: "强调色" }),
            h("input", {
              type: "color",
              value: ap.accentColor || t.accent,
              onchange: (e) => set({ accentColor: e.target.value }),
            }),
          ),
          h("span", { class: "sp" }),
          h("button", {
            class: "btn btn--ghost btn--sm",
            type: "button",
            text: "清除自定义",
            onclick: () => {
              const { primaryColor, accentColor, ...rest } = current();
              store.state.plan.appearance = rest;
              store.touch();
              paintForm();
              paintStage();
            },
          }),
        ),
        h(
          "p",
          { class: "form-note", style: { marginTop: "8px" } },
          "主色定标题与深色块，强调色只给按钮和一条竖线 —— 一处用力，其余安静。",
        ),
      ),
    );
  }

  function paintStage() {
    const page = store.pages().find((p) => p.published) ?? store.pages()[0];
    if (!page) {
      mount(stage, h("p", { class: "muted", text: "还没有页面可预览" }));
      return;
    }
    const materialized =
      store.state.check.pages.find((p) => p.id === page.id || p.path === page.path) ??
      {
        ...page,
        modules: store.modulesOf(page).map((m) => ({
          ...m,
          items: store.itemsOf(m).map((it) => ({ ...it, paragraphs: it.body ? store.bodyToParagraphs(it.body) : [] })),
        })),
      };

    if (!preview) {
      preview = previewFrame({
        getPage: () => materialized,
        getAppearance: () => current(),
        getNav: () => store.pages(),
        siteId: store.state.siteId,
        siteName: store.state.sites.find((s) => s.id === store.state.siteId)?.name ?? "",
        device: "tablet",
      });
      mount(
        stage,
        h(
          "div",
          { class: "hstack gap6", style: { width: "100%", maxWidth: "820px" } },
          icon("eye", 13),
          h("span", { class: "muted", style: { fontSize: "11.5px" }, text: `实时预览 · ${page.title}` }),
          h("span", { class: "sp" }),
          h("span", { class: "mono muted", style: { fontSize: "10.5px" }, text: appearanceTokens(current()).layout }),
        ),
        preview.el,
      );
    } else {
      preview.paint();
    }
  }

  paintHead();
  paintForm();
  paintStage();

  return {
    el,
    update(reason) {
      if (reason === "check" || reason === "saved") {
        paintHead();
        paintStage();
      }
    },
  };
}

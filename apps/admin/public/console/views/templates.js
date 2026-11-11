/**
 * 内容模版 —— 模版定结构，实例填内容，生成前台页面。
 *
 * 与组件页的分工：
 *   组件（片段）是「一段可复用的内容」—— 同一内容多处引用；
 *   模版是「一类内容的结构」—— 每个实例是独立的一份内容，
 *   按模版定义的字段填写，生成自己的前台页面。
 *
 * 实例是唯一事实源：生成的页面带 generatedFrom 标记，
 * 重新生成是更新，不是新建。生成后走「发布」上线。
 */

import { h, icon, mount, toast, dialog, drawer, empty, relTime } from "../lib/dom.js";
import * as store from "../lib/store.js";
import { api, ApiError } from "../lib/api.js";
import { previewFrame } from "../lib/preview.js";

export function create() {
  const el = h("div", { class: "work" });
  const head = h("div", { class: "work__head" });
  const listCol = h("div", { class: "col__body" });
  const detail = h("div", { class: "col__body", style: { padding: "18px 22px 60px" } });
  const structMeta = h("span", { class: "muted", style: { fontSize: "11px" } });

  let templates = [];
  let instances = [];
  let selectedTpl = null; // 当前查看的模版
  let selectedIns = null; // 当前编辑的实例
  let loading = true;
  let error = "";

  /**
   * 编辑草稿 —— **视图级**，不是编辑器局部变量。
   *
   * 为什么：编辑器每次重绘（保存后、切页后、任何 emit 之后）都会重建，
   * 局部变量会被重新初始化成服务端旧值 —— 用户正打字的内容就没了。
   * 「单价填不进去」这类症状就是这么来的：不是输入框坏了，
   * 是**输入的值在一次重绘里被冲掉**。
   */
  const drafts = new Map(); // instanceId -> {name, slug, published, values}

  /** 取某实例的草稿（没有就用服务端值起一份） */
  function draftOf(ins) {
    let d = drafts.get(ins.id);
    if (!d) {
      d = {
        name: ins.name,
        slug: ins.slug,
        published: !!ins.published,
        values: JSON.parse(JSON.stringify(ins.values ?? {})),
      };
      drafts.set(ins.id, d);
    }
    return d;
  }

  el.append(
    head,
    h(
      "div",
      { class: "split", style: { gridTemplateColumns: "320px minmax(0,1fr)" } },
      h(
        "section",
        { class: "split__col" },
        h(
          "div",
          { class: "col__head" },
          h("h2", { text: "模版" }),
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
          h("button", {
            class: "btn btn--ghost btn--sm",
            type: "button",
            onclick: () => void newTemplate(),
          }, icon("plus", 14), "新建模版"),
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
      h("h1", { text: "内容模版" }),
      h("p", { text: "模版定结构，实例填内容。实例可以直接生成前台页面。" }),
    ),
  );

  /* ── 数据 ─────────────────────────────────────────────── */

  async function load() {
    loading = true;
    paintList();
    try {
      const d = await api.templates(siteId);
      templates = d.templates ?? [];
      instances = d.instances ?? [];
      error = "";
    } catch (e) {
      error = e instanceof ApiError ? e.message : String(e);
    }
    loading = false;
    // 选中的可能已被删 —— 兜底
    if (selectedIns && !instances.some((i) => i.id === selectedIns.id)) selectedIns = null;
    if (selectedTpl && !templates.some((t) => t.id === selectedTpl.id)) selectedTpl = null;
    paintList();
    paintDetail();
  }

  async function saveInstance(ins, patch) {
    try {
      const d = await api.updateInstance(siteId, ins.id, patch);
      Object.assign(ins, d.instance ?? patch);
      // 草稿与服务端对齐 —— 保存后继续编辑不会看到旧值
      drafts.delete(ins.id);
      await load();
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
      return false;
    }
  }

  /* ── 左栏：模版与实例树 ───────────────────────────────── */

  function paintList() {
    if (loading) {
      mount(listCol, h("div", { style: { padding: "10px" } }, h("div", { class: "skel skel--row" })));
      return;
    }
    if (error) {
      mount(listCol, empty({ title: "读不到模版库", text: error, mark: "alert" }));
      return;
    }
    structMeta.textContent = `${templates.length} 套 / ${instances.length} 个实例`;

    const rows = [];
    for (const tpl of templates) {
      const ins = instances.filter((i) => i.templateId === tpl.id);
      // 模版行
      rows.push(
        h(
          "div",
          {
            class: "tree__node",
            role: "treeitem",
            "aria-selected": selectedTpl?.id === tpl.id && !selectedIns ? "true" : "false",
            onclick: () => {
              selectedTpl = tpl;
              selectedIns = null;
              paintList();
              paintDetail();
            },
          },
          h("span", { class: "stack", style: { gap: "2px", minWidth: "0", flex: "1" } },
            h("span", { class: "tree__title", text: tpl.name }),
            h("span", { class: "tree__path", text: `${ins.length} 个实例 · 生成到 ${tpl.page.pathPrefix}/` }),
          ),
          h("button", {
            class: "btn btn--ghost btn--icon btn--sm",
            type: "button",
            title: "新建实例",
            "aria-label": `在${tpl.name}下新建实例`,
            onclick: (e) => {
              e.stopPropagation();
              void newInstance(tpl);
            },
          }, icon("plus", 13)),
        ),
      );
      // 实例行（缩进）
      for (const i of ins) {
        rows.push(
          h(
            "div",
            {
              class: "tree__node",
              role: "treeitem",
              "aria-selected": selectedIns?.id === i.id ? "true" : "false",
              style: { paddingLeft: "22px" },
              onclick: () => {
                selectedTpl = templates.find((t) => t.id === i.templateId) ?? null;
                selectedIns = i;
                paintList();
                paintDetail();
              },
            },
            h("span", { class: "stack", style: { gap: "2px", minWidth: "0", flex: "1" } },
              h("span", { class: "tree__title", text: i.name }),
              h("span", { class: "hstack gap6" },
                i.published
                  ? h("span", { class: "tag", style: { height: "15px" }, text: "已发布" })
                  : h("span", { class: "tag", style: { height: "15px" }, text: "草稿" }),
                i.generatedPageId
                  ? h("span", { class: "tree__path", text: `/${tplPagePrefix(i)}···` })
                  : h("span", { class: "tree__path", text: "未生成页面" }),
              ),
            ),
          ),
        );
      }
    }

    if (!templates.length) {
      mount(listCol, empty({
        title: "还没有模版",
        text: "点左下「新建模版」定义一类内容的结构与页面布局。",
        mark: "block",
      }));
      return;
    }
    mount(listCol, h("div", { class: "tree" }, ...rows));
  }

  /** 实例所属模版的 pathPrefix（列表里显示用） */
  function tplPagePrefix(ins) {
    const tpl = templates.find((t) => t.id === ins.templateId);
    return (tpl?.page.pathPrefix ?? "").replace(/^\/+/, "");
  }

  /** 实例生成的页面路径（站内路径） */
  function insPath(ins) {
    const tpl = templates.find((t) => t.id === ins.templateId);
    if (!tpl) return "";
    const prefix = tpl.page.pathPrefix.replace(/\/+$/, "");
    return `${prefix}/${(ins.slug ?? "").replace(/^\/+/, "")}`;
  }

  /** 实例页面的公开网址（开发机走 /preview/<siteId>/…，生产机走站点域名） */
  function insUrl(ins) {
    const p = insPath(ins);
    return p ? store.pageUrl(p) : "";
  }

  /** 模版的「样例路径」—— 结构决定了实例会生成到哪里 */
  function tplSampleUrl(tpl) {
    return `${tpl.page.pathPrefix.replace(/\/+$/, "")}/<slug>`;
  }

  /* ── 右栏：详情（模版说明 或 实例编辑器）──────────────── */

  function paintDetail() {
    if (selectedIns) return paintInstanceEditor(selectedIns);
    if (selectedTpl) return paintTemplateInfo(selectedTpl);
    mount(detail, empty({
      title: "选一个模版或实例",
      text: "模版定义一类内容的结构；实例按模版填内容，可以生成前台页面。",
      mark: "copy",
    }));
  }

  function paintTemplateInfo(tpl) {
    const ins = instances.filter((i) => i.templateId === tpl.id);
    mount(
      detail,
      h(
        "div",
        null,
        h(
          "div",
          { class: "hstack gap8", style: { flexWrap: "wrap", marginBottom: "6px" } },
          h("span", { class: "tag", text: `${tpl.fields.length} 个字段` }),
          h("span", { class: "tag", text: `页面生成到 ${tpl.page.pathPrefix}/` }),
          h("span", { class: "muted", style: { fontSize: "11.5px" }, text: `更新于 ${relTime(tpl.updatedAt)}` }),
          h("span", { class: "sp" }),
          h("button", {
            id: "btn-tpl-new-instance",
            class: "btn btn--sm",
            type: "button",
            text: "新建实例",
            onclick: () => void newInstance(tpl),
          }),
          h("button", {
            id: "btn-tpl-delete",
            class: "btn btn--stamp btn--sm",
            type: "button",
            text: "删除模版",
            onclick: () => void removeTemplate(tpl),
          }),
        ),
        h("h2", { style: { font: "600 22px/1.3 var(--font-display)", margin: "4px 0 4px" }, text: tpl.name }),
        h("p", { class: "muted", style: { fontSize: "12.5px", marginBottom: "14px" }, text: tpl.description || "没有说明" }),
        h("div", { class: "section-label", text: "结构（字段）" }),
        h(
          "div",
          { class: "frag-usage", style: { marginBottom: "14px" } },
          ...tpl.fields.map((f) =>
            h(
              "div",
              { class: "todo__row", style: { border: "1px solid var(--rule)", borderRadius: "4px", background: "var(--sheet)" } },
              h("span", { class: "todo__t" },
                h("span", { text: f.label }),
                h("small", { text: `${f.key} · ${typeName(f.type)}${f.required ? " · 必填" : ""}` }),
              ),
            ),
          ),
        ),
        h("div", { class: "section-label", text: "生成网址" }),
        h(
          "div",
          { class: "hstack gap6", style: { marginBottom: "14px" } },
          h("code", {
            class: "url-chip",
            text: `${tplSampleUrl(tpl)}`,
            title: "实例按这个前缀生成页面 —— slug 是实例自己的",
          }),
          h("button", {
            id: "btn-tpl-preview",
            class: "btn btn--ghost btn--sm",
            type: "button",
            text: "看结构预览",
            title: "按模版布局画一遍骨架 —— 不依赖实例内容",
            onclick: () => showStructurePreview(tpl),
          }),
        ),
        h("div", { class: "section-label", text: `实例 · ${ins.length}` }),
        ins.length
          ? h("div", { class: "frag-usage" },
              ...ins.map((i) =>
                h("button", {
                  class: "todo__row",
                  type: "button",
                  style: { border: "1px solid var(--rule)", borderRadius: "4px", background: "var(--sheet)" },
                  onclick: () => {
                    selectedIns = i;
                    paintList();
                    paintDetail();
                  },
                },
                icon("layers", 14),
                h("span", { class: "todo__t" },
                  h("span", { text: i.name }),
                  h("small", { text: insPath(i) || "（未设 slug）" }),
                ),
                i.generatedPageId
                  ? h("code", {
                      class: "url-chip",
                      text: insUrl(i),
                      title: "点击复制这个网址",
                      onclick: (e) => {
                        e.stopPropagation();
                        void copyUrl(insUrl(i));
                      },
                    })
                  : null,
                icon("chevronRight", 13),
              ),
            ),
          )
          : h("p", { class: "muted", style: { fontSize: "12px" }, text: "还没有实例 —— 点「新建实例」按这个结构填一份内容。" }),
      ),
    );
  }

  function typeName(t) {
    return { text: "单行", longtext: "长文本", richtext: "富文本", image: "图片", metrics: "指标组", list: "要点列表" }[t] ?? t;
  }

  /* ── 实例编辑器 ───────────────────────────────────────── */

  function paintInstanceEditor(ins) {
    const tpl = templates.find((t) => t.id === ins.templateId);
    if (!tpl) {
      mount(detail, empty({ title: "它的模版不见了", text: "实例引用的模版已被删除。", mark: "alert" }));
      return;
    }

    const draft = draftOf(ins);
    const draftName = { value: draft.name };
    const draftSlug = { value: draft.slug };
    const draftValues = { value: draft.values };
    const draftPublished = { value: draft.published };

    const collect = () => ({
      name: draftName.value.trim(),
      slug: draftSlug.value.trim(),
      published: draftPublished.value,
      values: draftValues.value,
    });

    /** 单字段编辑器 */
    function fieldEditor(field) {
      const v = draftValues.value[field.key];
      if (field.type === "metrics") {
        // rows 必须**挂在草稿上** —— 不然改的是个临时数组，
        // 一次重绘就没了（这正是「指标填不进去」的根因）。
        const rows = Array.isArray(v) ? v : (draftValues.value[field.key] = []);
        const host = h("div", { class: "stack", style: { gap: "6px" } });
        const paint = () => {
          mount(host, ...rows.map((m, i) =>
            h(
              "div",
              { class: "hstack gap6", style: { display: "flex", gap: "6px" } },
              ...[
                ["数值", "value", "80", "70px"],
                ["单位", "unit", "ms", "70px"],
                ["指标名", "label", "采集延迟 P99", "flex:1"],
              ].map(([label, key, ph, w]) => {
                const inp = h("input", {
                  value: m[key] ?? "",
                  placeholder: ph,
                  "aria-label": `${field.label}第${i + 1}项${label}`,
                  style: { minWidth: "0", flex: key === "label" ? "1" : "0 0 " + w, width: key === "label" ? undefined : w },
                  oninput: (e) => {
                    m[key] = e.target.value;
                  },
                });
                return inp;
              }),
              h("button", {
                class: "btn btn--ghost btn--icon btn--sm",
                type: "button",
                title: "删除这条指标",
                "aria-label": `删除${field.label}第${i + 1}项`,
                onclick: () => {
                  rows.splice(i, 1);
                  paint();
                },
              }, icon("trash", 13)),
            ),
          ));
        };
        paint();
        return h(
          "div",
          null,
          host,
          h("button", {
            class: "btn btn--ghost btn--sm",
            type: "button",
            style: { marginTop: "4px" },
            onclick: () => {
              rows.push({ value: "", unit: "", label: "" });
              paint();
            },
          }, icon("plus", 12), "加一条指标"),
        );
      }
      if (field.type === "list") {
        return h("textarea", {
          rows: Math.max(3, (Array.isArray(v) ? v.length : 2) + 1),
          placeholder: field.placeholder ?? "一行一条",
          "aria-label": field.label,
          oninput: (e) => {
            draftValues.value[field.key] = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean);
          },
        }, Array.isArray(v) ? v.join("\n") : "");
      }
      if (field.type === "longtext") {
        return h("textarea", {
          rows: 5,
          placeholder: field.placeholder ?? "一段一个重点，空行分段",
          "aria-label": field.label,
          oninput: (e) => {
            draftValues.value[field.key] = e.target.value;
          },
        }, typeof v === "string" ? v : "");
      }
      // text / image / richtext —— 先都按单行处理（富文本编辑器后续接）
      return h("input", {
        value: typeof v === "string" ? v : "",
        placeholder: field.placeholder,
        "aria-label": field.label,
        oninput: (e) => {
          draftValues.value[field.key] = e.target.value;
        },
      });
    }

    const nameInput = h("input", {
      value: ins.name,
      "aria-label": "实例名",
      oninput: (e) => {
        draftName.value = e.target.value;
      },
    });
    const slugInput = h("input", {
      value: ins.slug,
      "aria-label": "页面 slug",
      style: { fontFamily: "var(--font-mono, monospace)", maxWidth: "220px" },
      oninput: (e) => {
        draftSlug.value = e.target.value;
      },
    });
    const pubCheck = h("input", {
      type: "checkbox",
      checked: ins.published ? "" : null,
      "aria-label": "是否发布",
      onchange: (e) => {
        draftPublished.value = e.target.checked;
      },
    });

    mount(
      detail,
      h(
        "div",
        null,
        // 顶部动作条
        h(
          "div",
          { class: "hstack gap8", style: { flexWrap: "wrap", marginBottom: "10px" } },
          h("span", { class: "tag", text: tpl.name }),
          h("span", { class: "muted", style: { fontSize: "11.5px" }, text: `更新于 ${relTime(ins.updatedAt)}` }),
          h("span", { class: "sp" }),
          h("code", {
            class: "url-chip",
            text: insUrl(ins),
            title: "点击复制网址",
            onclick: () => void copyUrl(insUrl(ins)),
          }),
          h("button", {
            id: "btn-instance-preview",
            class: "btn btn--ghost btn--sm",
            type: "button",
            text: "预览",
            title: "按当前内容渲染这个页面（草稿预览，未发布也看得到）",
            onclick: () => showInstancePreview(ins),
          }),
          ins.generatedPageId
            ? h("button", {
                id: "btn-instance-regenerate",
                class: "btn btn--sm",
                type: "button",
                text: "重新生成页面",
                title: "实例是唯一事实源 —— 重新生成会更新页面内容",
                onclick: () => void generate(ins, collect),
              })
            : h("button", {
                id: "btn-instance-generate",
                class: "btn btn--sm",
                type: "button",
                text: "生成前台页面",
                onclick: () => void generate(ins, collect),
              }),
          h("button", {
            id: "btn-instance-delete",
            class: "btn btn--stamp btn--sm",
            type: "button",
            text: "删除实例",
            onclick: () => void removeInstance(ins),
          }),
        ),
        // 基本信息行
        h(
          "div",
          { class: "form-grid", style: { gridTemplateColumns: "1fr auto auto", gap: "10px", alignItems: "end", marginBottom: "14px" } },
          h("label", { class: "stack", style: { gap: "3px", minWidth: "0" } },
            h("span", { class: "section-label", text: "实例名（页面标题）" }), nameInput),
          h("label", { class: "stack", style: { gap: "3px" } },
            h("span", { class: "section-label", text: "slug" }), slugInput),
          h("label", { class: "stack", style: { gap: "3px" } },
            h("span", { class: "section-label", text: "发布" }), pubCheck),
        ),
        // 按模版结构逐字段
        ...tpl.fields.map((f) =>
          h(
            "div",
            { style: { marginBottom: "14px" } },
            h("div", { class: "section-label", text: `${f.label}${f.required ? " *" : ""}` }),
            fieldEditor(f),
          ),
        ),
        // 保存
        h(
          "div",
          { class: "hstack gap8", style: { marginTop: "6px" } },
          h("button", {
            id: "btn-instance-save",
            class: "btn btn--stamp btn--sm",
            type: "button",
            text: "保存实例",
            onclick: async () => {
              const ok = await saveInstance(ins, collect());
              if (ok) toast("实例已保存", { kind: "ok" });
            },
          }),
          h("span", { class: "muted", style: { fontSize: "11.5px" }, text: "保存后点「生成前台页面」，再去发布台上线。" }),
        ),
      ),
    );
  }

  /* ── 动作 ─────────────────────────────────────────────── */

  async function newInstance(tpl) {
    // 两步输入用两个 dialog 串起来 —— 不用原生 prompt（自检会拦，且样式不统一）
    const name = await askText(`在「${tpl.name}」下新建实例`, "实例名（会变成页面标题）", "");
    if (name === null) return;
    const slug = await askText(
      "页面 slug",
      `生成路径 = ${tpl.page.pathPrefix}/slug`,
      slugify(name),
    );
    if (slug === null) return;
    try {
      const d = await api.createInstance(siteId, { templateId: tpl.id, name: name || "未命名实例", slug, values: {}, published: false });
      await load();
      selectedTpl = tpl;
      selectedIns = d.instance;
      paintList();
      paintDetail();
      toast("实例已创建 —— 填完内容后保存并生成页面", { kind: "ok" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
    }
  }

  async function removeInstance(ins) {
    const ok = await askConfirm("删除实例", `「${ins.name}」的页面也会一起摘掉。`, true);
    if (!ok) return;
    try {
      await api.delInstance(siteId, ins.id);
      selectedIns = null;
      await load();
      toast("已删除", { kind: "ok" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
    }
  }

  async function removeTemplate(tpl) {
    const ok = await askConfirm("删除模版", `「${tpl.name}」会被删除。`, true);
    if (!ok) return;
    try {
      await api.delTemplate(siteId, tpl.id);
      selectedTpl = null;
      await load();
      paintDetail();
      toast("已删除", { kind: "ok" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
    }
  }

  async function newTemplate() {
    const name = await askText("新建模版", "模版名（如：方案模版）", "");
    if (name === null || !name.trim()) return;
    const prefix = await askText("生成页面的路径前缀", "如 /solutions（生成到 <前缀>/<slug>）", "/topics");
    if (prefix === null || !prefix.trim()) return;
    try {
      const d = await api.createTemplate(siteId, {
        name: name.trim(),
        page: {
          pathPrefix: prefix.trim(),
          blocks: [
            { kind: "heading" },
            { kind: "text", field: "body" },
            { kind: "cta", title: "想聊聊？" },
          ],
        },
      });
      await load();
      selectedTpl = d.template;
      selectedIns = null;
      paintList();
      paintDetail();
      toast("模版已创建（默认结构：标题 + 正文 + CTA，可在实例里直接填）", { kind: "ok" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), { kind: "err" });
    }
  }

  async function generate(ins, collect) {
    // 先把编辑区里没保存的改动落掉 —— 生成的是已保存的内容
    const saved = await saveInstance(ins, collect());
    if (!saved) return;
    try {
      const d = await api.generateInstance(siteId, ins.id);
      await load();
      selectedIns = instances.find((i) => i.id === ins.id) ?? selectedIns;
      paintDetail();
      toast(`页面已生成：${d.path} —— 去「发布」上线`, { kind: "ok", timeout: 5000 });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), { kind: "err", timeout: 6000 });
    }
  }

  /**
   * 问一句话 —— 返回输入值，取消返回 null。
   * 用 dom.js 的 dialog（样式统一、Esc 可关），不用原生 prompt。
   */
  function askText(title, label, initial = "") {
    return new Promise((resolve) => {
      dialog({
        title,
        body: label,
        input: { label, value: initial },
        confirmLabel: "确定",
        onConfirm: (v) => resolve(v),
      });
      // 取消（Esc / 点遮罩 / 取消按钮）没有 onConfirm —— 用焦点轮询兜一下
      const timer = setInterval(() => {
        if (!document.querySelector(".scrim")) {
          clearInterval(timer);
          resolve(null);
        }
      }, 200);
    });
  }

  /** 问一句要不要 —— 确认 true，取消 false */
  function askConfirm(title, message, danger = false) {
    return new Promise((resolve) => {
      dialog({
        title,
        body: message,
        confirmLabel: danger ? "删除" : "确定",
        danger,
        onConfirm: () => resolve(true),
      });
      const timer = setInterval(() => {
        if (!document.querySelector(".scrim")) {
          clearInterval(timer);
          resolve(false);
        }
      }, 200);
    });
  }

  /** 复制网址到剪贴板 */
  async function copyUrl(url) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("已复制：" + url, { kind: "ok" });
    } catch {
      toast(url, { timeout: 6000 });
    }
  }

  /**
   * 模版的结构预览 —— 按布局块画一遍骨架。
   * 不依赖实例内容：看的是「这个模版会生成什么样的页面」。
   */
  function showStructurePreview(tpl) {
    const body = h("div", { class: "stack", style: { gap: "10px" } });
    const KIND = {
      heading: "英雄区（标题 + 引导语）",
      text: "富文本正文块",
      metrics: "量化指标条",
      bullets: "要点列表",
      cta: "行动号召条",
    };
    for (const b of tpl.page.blocks ?? []) {
      const fieldLabel = b.field
        ? tpl.fields.find((f) => f.key === b.field)?.label ?? b.field
        : null;
      body.appendChild(
        h(
          "div",
          { class: "hstack gap6", style: { alignItems: "center" } },
          h("span", { class: "tag", text: KIND[b.kind] ?? b.kind }),
          fieldLabel ? h("span", { class: "muted", style: { fontSize: "12px" }, text: `用字段「${fieldLabel}」` }) : null,
          b.title ? h("span", { class: "muted", style: { fontSize: "12px" }, text: `区块标题：${b.title}` }) : null,
        ),
      );
    }
    drawer({
      title: `结构预览 · ${tpl.name}`,
      subtitle: `实例会生成到 ${tplSampleUrl(tpl)}`,
      body,
      width: "520px",
    });
  }

  /**
   * 实例预览 —— 按当前填的内容渲染这个页面。
   *
   * 用的是**编排里的生成页**（草稿态），所以未发布也能看；
   * 已发布的话上面的「网址」才是访客看到的地址。
   */
  function showInstancePreview(ins) {
    const page = (store.state.plan?.pages ?? []).find((p) => p.generatedFrom === ins.id);
    const draft = draftOf(ins);
    // 草稿内容还没进编排时，用草稿临时拼一个页面出来
    const previewPage = page ?? buildDraftPage(ins, draft);
    const frame = previewFrame({
      getPage: () => previewPage,
      getAppearance: () => store.state.plan?.appearance ?? {},
      getNav: () => store.pages(),
      siteId: store.state.siteId,
      siteName: store.state.sites.find((s) => s.id === store.state.siteId)?.name ?? "",
    });
    drawer({
      title: `预览 · ${ins.name}`,
      subtitle: insUrl(ins),
      // frame 是 {el, iframe, paint} —— 塞进抽屉的是**元素**，不是那包东西
      body: h("div", { style: { padding: "0" } }, frame.el),
      width: "880px",
    });
    // 抽屉打开后刷新一次预览（iframe 需要在 DOM 里才有尺寸）
    setTimeout(() => frame.paint?.(), 60);
  }

  /** 用草稿拼一个页面（实例还没生成进编排时用） */
  function buildDraftPage(ins, draft) {
    const tpl = templates.find((t) => t.id === ins.templateId);
    if (!tpl) return null;
    const mods = [];
    for (const b of tpl.page.blocks ?? []) {
      const v = draft.values[b.field];
      if (b.kind === "heading") {
        mods.push({ id: "d_hero", type: "hero", title: "", items: [{ id: "d_i", source: "manual", title: draft.name, summary: String(v ?? "").split("\n")[0] ?? "", order: 0, published: true }] });
      } else if (b.kind === "text") {
        mods.push({ id: "d_text", type: "rich-text", title: b.title ?? "", items: [{ id: "d_i", source: "manual", title: "", body: { type: "doc", content: String(v ?? "").split("\n").filter(Boolean).map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })) }, order: 0, published: true }] });
      } else if (b.kind === "metrics") {
        const arr = Array.isArray(v) ? v : [];
        mods.push({ id: "d_stats", type: "stats", title: b.title ?? "", items: arr.map((m, i) => ({ id: "d_i" + i, source: "manual", value: m.value, unit: m.unit, label: m.label ?? "", order: i, published: true })) });
      } else if (b.kind === "bullets") {
        const arr = Array.isArray(v) ? v : [];
        mods.push({ id: "d_bul", type: "rich-text", title: b.title ?? "", items: [{ id: "d_i", source: "manual", title: "", body: { type: "doc", content: arr.map((line) => ({ type: "paragraph", content: [{ type: "text", text: "· " + line }] })) }, order: 0, published: true }] });
      } else if (b.kind === "cta") {
        mods.push({ id: "d_cta", type: "cta", title: b.title ?? "想聊聊？", items: [{ id: "d_i", source: "manual", title: b.title ?? "想聊聊？", href: "/contact", order: 0, published: true }] });
      }
    }
    return {
      id: "draft_page",
      path: insPath(ins),
      title: draft.name,
      description: "",
      modules: mods,
    };
  }

  function slugify(s) {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `ins-${Math.random().toString(36).slice(2, 8)}`;
  }

  /* ── 启动 ─────────────────────────────────────────────── */

  const siteId = store.state.siteId;
  if (!siteId) {
    mount(detail, empty({ title: "先选一个站点", mark: "alert" }));
    return { el };
  }
  void load();

  return {
    el,
    update() {
      // 站点切换后重载模版库
      if (store.state.siteId !== siteId) {
        selectedTpl = null;
        selectedIns = null;
        void load();
      }
    },
  };
}

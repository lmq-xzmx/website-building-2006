import { describe, expect, it } from "vitest";

import {
  validateInstance,
  instancePath,
  type ContentTemplate,
  type TemplateInstance,
  type TemplateLibrary,
} from "../templates/types.js";
import {
  materializeInstance,
  generateTemplatePages,
} from "../templates/materialize.js";
import type { PageDef } from "../modules/types.js";

/** 案例模版 —— 与种子的三套模版之一同构 */
function caseTemplate(): ContentTemplate {
  return {
    id: "tpl_case",
    name: "案例模版",
    description: "客户案例：背景 → 挑战 → 量化结果",
    fields: [
      { key: "client", label: "客户名", type: "text", required: true },
      { key: "challenge", label: "挑战", type: "longtext", required: true },
      { key: "solution", label: "方案", type: "longtext", required: true },
      {
        key: "results",
        label: "量化结果",
        type: "metrics",
        required: true,
      },
    ],
    page: {
      pathPrefix: "/stories",
      blocks: [
        { kind: "heading" },
        { kind: "text", field: "challenge", title: "挑战" },
        { kind: "text", field: "solution", title: "方案" },
        { kind: "metrics", field: "results", title: "量化结果" },
        { kind: "cta" },
      ],
    },
    createdAt: "2026-11-11T00:00:00.000Z",
    updatedAt: "2026-11-11T00:00:00.000Z",
  };
}

function instance(over: Partial<TemplateInstance> = {}): TemplateInstance {
  return {
    id: "ins_1",
    templateId: "tpl_case",
    name: "股份制银行核心系统数据中台",
    slug: "bank-core",
    values: {
      client: "某股份制银行",
      challenge: "17 个存量系统数据口径不一\n合规检查压力大",
      solution: "建设统一数据中台\n审计日志留存 3 年",
      results: [
        { value: "3", unit: "周", label: "交付周期从 6 周缩短" },
        { value: "2400", label: "日均处理万条" },
      ],
    },
    published: true,
    order: 1,
    createdAt: "2026-11-11T00:00:00.000Z",
    updatedAt: "2026-11-11T00:00:00.000Z",
    ...over,
  };
}

describe("模版：校验", () => {
  it("完整实例通过", () => {
    expect(validateInstance(caseTemplate(), instance())).toEqual([]);
  });

  it("必填字段缺失报错", () => {
    const ins = instance({ values: { client: "某银行" } });
    const problems = validateInstance(caseTemplate(), ins);
    expect(problems.some((p) => p.includes("挑战"))).toBe(true);
    expect(problems.some((p) => p.includes("量化结果"))).toBe(true);
  });

  it("slug 非法报错", () => {
    expect(validateInstance(caseTemplate(), instance({ slug: "有 中文" })).length).toBeGreaterThan(0);
    expect(validateInstance(caseTemplate(), instance({ slug: "-lead" })).length).toBeGreaterThan(0);
    expect(validateInstance(caseTemplate(), instance({ slug: "ok-1" })).length).toBe(0);
  });

  it("metrics 不是数组报错", () => {
    const ins = instance({ values: { client: "a", challenge: "b", solution: "c", results: "不是数组" } });
    expect(validateInstance(caseTemplate(), ins).some((p) => p.includes("数组"))).toBe(true);
  });
});

describe("模版：路径", () => {
  it("pathPrefix + slug", () => {
    expect(instancePath(caseTemplate(), instance())).toBe("/stories/bank-core");
  });

  it("前缀带尾斜杠也规范", () => {
    const tpl = caseTemplate();
    tpl.page.pathPrefix = "/stories/";
    expect(instancePath(tpl, instance())).toBe("/stories/bank-core");
  });
});

describe("模版：实例生成页面", () => {
  it("按布局块展开成模块序列", () => {
    const page = materializeInstance(caseTemplate(), instance())!;
    expect(page).toBeTruthy();
    expect(page.path).toBe("/stories/bank-core");
    expect(page.title).toBe("股份制银行核心系统数据中台");
    // heading → hero, text ×2 → rich-text, metrics → stats, cta → cta
    expect(page.modules.map((m) => m.type)).toEqual(["hero", "rich-text", "rich-text", "stats", "cta"]);
    // hero H1 = 实例名
    expect(page.modules[0].items[0].title).toBe("股份制银行核心系统数据中台");
    // stats 展开成指标
    expect(page.modules[3].items.map((i) => i.label)).toEqual(["交付周期从 6 周缩短", "日均处理万条"]);
  });

  it("缺关键字段 → 不生成空壳页", () => {
    const ins = instance({ values: {} });
    expect(materializeInstance(caseTemplate(), ins)).toBeNull();
  });

  it("长文本按行分段", () => {
    const page = materializeInstance(caseTemplate(), instance())!;
    const challenge = page.modules[1].items[0].body;
    const paras = challenge.content?.filter((n) => n.type === "paragraph") ?? [];
    expect(paras.length).toBe(2); // 两行 → 两个段落
  });
});

describe("模版：生成页更新进编排（幂等）", () => {
  const lib = (): TemplateLibrary => ({
    version: 1,
    siteId: "demo",
    updatedAt: "2026-11-11T00:00:00.000Z",
    templates: [caseTemplate()],
    instances: [instance()],
  });

  it("首次生成追加页面", () => {
    const plan = { pages: [{ id: "pg_home", path: "/", title: "首页", modules: [], order: 0, published: true } as PageDef] };
    const { pages, generated, removed } = generateTemplatePages(plan, lib());
    expect(generated).toBe(1);
    expect(removed).toBe(0);
    expect(pages.some((p) => p.path === "/stories/bank-core")).toBe(true);
    // 手写页保留
    expect(pages.some((p) => p.id === "pg_home")).toBe(true);
  });

  it("重复生成更新同一页（不重复建）", () => {
    const first = generateTemplatePages({ pages: [] }, lib());
    const second = generateTemplatePages({ pages: first.pages }, lib());
    expect(second.generated).toBe(1);
    expect(second.removed).toBe(1); // 旧的摘掉，新的换上
    const storyPages = second.pages.filter((p) => p.generatedFrom === "ins_1");
    expect(storyPages.length).toBe(1);
  });

  it("实例下线 → 页面摘除", () => {
    const first = generateTemplatePages({ pages: [] }, lib());
    const lib2 = lib();
    lib2.instances[0].published = false;
    const { pages, removed } = generateTemplatePages({ pages: first.pages }, lib2);
    expect(removed).toBe(1);
    expect(pages.every((p) => !p.generatedFrom)).toBe(true);
  });

  it("slug 变更 → 页面挪路径", () => {
    const first = generateTemplatePages({ pages: [] }, lib());
    const lib2 = lib();
    lib2.instances[0].slug = "bank-core-v2";
    const { pages } = generateTemplatePages({ pages: first.pages }, lib2);
    const gen = pages.find((p) => p.generatedFrom === "ins_1")!;
    expect(gen.path).toBe("/stories/bank-core-v2");
  });
});

describe("模版：多套模版多套实例", () => {
  it("三套模版各自生成互不干扰", () => {
    const caseTpl = caseTemplate();
    const productTpl: ContentTemplate = {
      ...caseTemplate(),
      id: "tpl_product",
      name: "产品模版",
      fields: [
        { key: "pitch", label: "产品定位", type: "text", required: true },
        { key: "spec", label: "规格说明", type: "longtext", required: true },
      ],
      page: {
        pathPrefix: "/products",
        blocks: [{ kind: "heading" }, { kind: "text", field: "spec" }, { kind: "cta" }],
      },
    };
    const lib: TemplateLibrary = {
      version: 1,
      siteId: "demo",
      updatedAt: "2026-11-11T00:00:00.000Z",
      templates: [caseTpl, productTpl],
      instances: [
        instance(),
        {
          ...instance(),
          id: "ins_p1",
          templateId: "tpl_product",
          name: "数据集成网关",
          slug: "gateway",
          values: { pitch: "把 17 种协议接进一个管道", spec: "支持 Modbus、OPC UA" },
        },
      ],
    };
    const { pages, generated } = generateTemplatePages({ pages: [] }, lib);
    expect(generated).toBe(2);
    expect(pages.find((p) => p.path === "/stories/bank-core")).toBeTruthy();
    expect(pages.find((p) => p.path === "/products/gateway")).toBeTruthy();
  });
});

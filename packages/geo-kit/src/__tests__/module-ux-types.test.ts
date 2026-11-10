/**
 * 新模块类型（trust / logo-wall / process / form）的校验与物化测试。
 *
 * 为什么要单独测：这几个模块的字段是「按模块类型解释」的，
 * 校验一旦漏了某项，发布出去的就是空壳区块 —— 而空壳比没有更糟。
 */

import { describe, expect, it } from "vitest";

import {
  emptyModulePlan,
  materializeModulePlan,
  validateModulePlan,
  type ModulePlan,
  type PageDef,
} from "../index.js";

const items = new Map();

function plan(pages: ModulePlan["pages"]): ModulePlan {
  return { ...emptyModulePlan("demo"), pages };
}

const basePage: PageDef = {
  id: "pg1",
  path: "/",
  title: "首页",
  description: "首页的独立描述",
  order: 0,
  published: true,
  modules: [],
};

describe("信任背书（trust）", () => {
  it("缺标题、缺图片被拦住，缺 alt 只提醒", () => {
    const p = plan([
      {
        ...basePage,
        modules: [
          {
            id: "m1",
            type: "trust",
            order: 0,
            enabled: true,
            items: [{ id: "i1", source: "manual", order: 0, published: true }],
          },
        ],
      },
    ]);
    const msgs = validateModulePlan(p, items).map((x) => `${x.level}:${x.message}`).join(" ");
    expect(msgs).toContain("error:信任背书缺标题");
    expect(msgs).toContain("error:信任背书缺图片");
    expect(msgs).toContain("warn:信任背书图片缺 alt");
  });

  it("字段齐全时不报问题", () => {
    const p = plan([
      {
        ...basePage,
        modules: [
          {
            id: "m1",
            type: "trust",
            order: 0,
            enabled: true,
            items: [
              {
                id: "i1",
                source: "manual",
                order: 0,
                published: true,
                title: "CE 认证",
                image: "/assets/ce.png",
                alt: "CE 认证证书",
                caption: "2024 年通过",
              },
            ],
          },
        ],
      },
    ]);
    expect(validateModulePlan(p, items)).toHaveLength(0);
  });
});

describe("客户 logo 墙（logo-wall）", () => {
  it("缺图片与客户名被拦住", () => {
    const p = plan([
      {
        ...basePage,
        modules: [
          {
            id: "m1",
            type: "logo-wall",
            order: 0,
            enabled: true,
            items: [{ id: "i1", source: "manual", order: 0, published: true }],
          },
        ],
      },
    ]);
    const msgs = validateModulePlan(p, items).map((x) => x.message).join(" ");
    expect(msgs).toContain("客户 logo 缺图片");
    expect(msgs).toContain("客户 logo 缺客户名");
  });
});

describe("流程步骤（process）", () => {
  it("缺序号被拦住", () => {
    const p = plan([
      {
        ...basePage,
        modules: [
          {
            id: "m1",
            type: "process",
            order: 0,
            enabled: true,
            items: [
              {
                id: "i1",
                source: "manual",
                order: 0,
                published: true,
                title: "需求沟通",
                summary: "确认设备型号与点位",
              },
            ],
          },
        ],
      },
    ]);
    const msgs = validateModulePlan(p, items).map((x) => x.message).join(" ");
    expect(msgs).toContain("流程步骤缺序号");
  });

  it("序号与说明齐全时通过", () => {
    const p = plan([
      {
        ...basePage,
        modules: [
          {
            id: "m1",
            type: "process",
            order: 0,
            enabled: true,
            items: [
              {
                id: "i1",
                source: "manual",
                order: 0,
                published: true,
                title: "需求沟通",
                summary: "确认设备型号与点位",
                step: 1,
              },
            ],
          },
        ],
      },
    ]);
    expect(validateModulePlan(p, items)).toHaveLength(0);
  });
});

describe("零摩擦表单（form）", () => {
  const formModule = (fields: unknown) => ({
    id: "m1",
    type: "form" as const,
    props: { fields },
    order: 0,
    enabled: true,
    items: [
      { id: "i1", source: "manual" as const, order: 0, published: true, title: "我们会在 1 个工作日内联系您" },
    ],
  });

  it("没有字段定义被拦住", () => {
    const p = plan([{ ...basePage, modules: [formModule([])] }]);
    const msgs = validateModulePlan(p, items).map((x) => x.message).join(" ");
    expect(msgs).toContain("表单没有定义字段");
  });

  it("必填字段超过 5 个被拦住，3 个通过", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `f${i}`, label: `字段${i}`, required: true }));
    const few = Array.from({ length: 3 }, (_, i) => ({ name: `f${i}`, label: `字段${i}`, required: true }));

    const pMany = plan([{ ...basePage, modules: [formModule(many)] }]);
    expect(validateModulePlan(pMany, items).map((x) => x.message).join(" ")).toContain("必填字段 6 个");

    const pFew = plan([{ ...basePage, modules: [formModule(few)] }]);
    expect(validateModulePlan(pFew, items)).toHaveLength(0);
  });

  it("条目缺提交结果说明被拦住", () => {
    const fields = [{ name: "name", label: "姓名", required: true }];
    const p = plan([
      {
        ...basePage,
        modules: [
          {
            id: "m1",
            type: "form",
            props: { fields },
            order: 0,
            enabled: true,
            items: [{ id: "i1", source: "manual", order: 0, published: true }],
          },
        ],
      },
    ]);
    expect(validateModulePlan(p, items).map((x) => x.message).join(" ")).toContain("提交结果说明");
  });
});

describe("物化：附加字段要带到渲染层", () => {
  it("alt / caption / step 都被复制过去", () => {
    const p = plan([
      {
        ...basePage,
        modules: [
          {
            id: "m1",
            type: "trust",
            order: 0,
            enabled: true,
            items: [
              {
                id: "i1",
                source: "manual",
                order: 0,
                published: true,
                title: "CE 认证",
                image: "/assets/ce.png",
                alt: "CE 认证证书",
                caption: "2024 年通过",
                step: 2,
              },
            ],
          },
        ],
      },
    ]);
    const { pages } = materializeModulePlan(p, items);
    const item = pages[0].modules[0].items[0];
    expect(item.alt).toBe("CE 认证证书");
    expect(item.caption).toBe("2024 年通过");
    expect(item.step).toBe(2);
  });
});

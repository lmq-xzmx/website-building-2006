import { describe, expect, it } from "vitest";

import { validateModulePlan } from "../modules/validate.js";
import { materializeModulePlan } from "../modules/materialize.js";
import type { ModuleItem, ModulePlan, PageDef } from "../modules/types.js";

/** 造一条最小条目 */
function item(over: Partial<ModuleItem> = {}): ModuleItem {
  return {
    id: "it_1",
    source: "manual",
    title: "一条内容",
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "正文" }] }] },
    order: 0,
    published: true,
    ...over,
  };
}

/** 造一份只有一个页面一个模块的编排 */
function planWith(items: ModuleItem[]): ModulePlan {
  const page: PageDef = {
    id: "pg_1",
    path: "/about",
    title: "关于我们",
    description: "公司简介",
    order: 0,
    published: true,
    modules: [
      {
        id: "mod_1",
        type: "card-grid",
        title: "模块",
        items,
        order: 0,
        enabled: true,
      },
    ],
  };
  return {
    version: 1,
    siteId: "demo",
    kbId: "default",
    updatedAt: new Date().toISOString(),
    pages: [page],
  };
}

const noKb = new Map();

describe("审核状态：发布校验", () => {
  it("待审的内容拦住发布", () => {
    const problems = validateModulePlan(planWith([item({ review: "pending" })]), noKb);
    const hit = problems.find((p) => p.message.includes("待审核"));
    expect(hit).toBeTruthy();
    expect(hit?.level).toBe("error");
  });

  it("被驳回的内容拦住发布", () => {
    const problems = validateModulePlan(planWith([item({ review: "rejected" })]), noKb);
    const hit = problems.find((p) => p.message.includes("驳回"));
    expect(hit?.level).toBe("error");
  });

  it("已通过的内容不拦", () => {
    const problems = validateModulePlan(planWith([item({ review: "approved" })]), noKb);
    expect(problems.filter((p) => p.message.includes("审核"))).toHaveLength(0);
  });

  it("历史内容（没有 review 字段）照常发布", () => {
    const problems = validateModulePlan(planWith([item()]), noKb);
    expect(problems.filter((p) => p.message.includes("审核"))).toHaveLength(0);
  });

  it("草稿（published=false）不参与审核拦截", () => {
    const problems = validateModulePlan(
      planWith([item({ published: false, review: "pending" })]),
      noKb,
    );
    expect(problems.filter((p) => p.message.includes("审核"))).toHaveLength(0);
  });
});

describe("审核状态：物化", () => {
  it("待审与被驳回的条目不进站", () => {
    const plan = planWith([
      item({ id: "ok", review: "approved", title: "已通过" }),
      item({ id: "wait", review: "pending", title: "待审" }),
      item({ id: "no", review: "rejected", title: "驳回" }),
    ]);
    const { pages } = materializeModulePlan(plan, noKb);
    const titles = pages[0].modules[0].items.map((i) => i.title);
    expect(titles).toEqual(["已通过"]);
  });

  it("历史内容照常进站", () => {
    const plan = planWith([item({ id: "old", title: "老内容" })]);
    const { pages } = materializeModulePlan(plan, noKb);
    expect(pages[0].modules[0].items.map((i) => i.title)).toEqual(["老内容"]);
  });
});

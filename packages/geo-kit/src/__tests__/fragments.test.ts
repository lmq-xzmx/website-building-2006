import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detachFragmentModule,
  emptyFragmentLibrary,
  expandFragmentPlan,
  fragmentToModule,
  fragmentUsage,
  materializeModulePlan,
  modulePlanStats,
  moduleToFragment,
  readFragmentLibrary,
  resolveFragmentModule,
  validateFragment,
  validateModulePlan,
  writeFragmentLibrary,
  FRAGMENTS_FILENAME,
  type Fragment,
  type ModulePlan,
  type PageModule,
} from "../index.js";
import type { KnowledgeItem } from "../sync/knowledge-sync.js";

/** 造一个临时站点目录 */
async function tmpSite(): Promise<string> {
  return mkdtemp(join(tmpdir(), "geo-frag-"));
}

/** 一条手工条目 */
function item(id: string, title: string, order = 0) {
  return {
    id,
    source: "manual" as const,
    title,
    summary: "",
    order,
    published: true,
    body: { type: "doc" as const, content: [{ type: "paragraph" as const }] },
  };
}

/** 一份带一个模块的编排 */
function planWith(modules: PageModule[]): ModulePlan {
  return {
    version: 1,
    siteId: "demo",
    kbId: "default",
    updatedAt: "2026-11-01T00:00:00Z",
    pages: [
      {
        id: "pg1",
        path: "/",
        title: "首页",
        description: "首页",
        modules,
        order: 0,
        published: true,
      },
    ],
  };
}

/** 一份片段 */
function frag(id = "fg1"): Fragment {
  return {
    id,
    name: "公司简介",
    description: "放在首页与关于我们",
    type: "rich-text",
    title: "关于我们",
    items: [item("it1", "我们是谁"), item("it2", "我们做什么", 1)],
    props: { kind: "generic" },
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };
}

const noItems = new Map<string, KnowledgeItem>();

describe("片段：存读", () => {
  it("写入后能原样读回", async () => {
    const dir = await tmpSite();
    try {
      const lib = emptyFragmentLibrary("demo");
      lib.fragments.push(frag());
      await writeFragmentLibrary(dir, lib);

      const back = await readFragmentLibrary(dir, "demo");
      expect(back.fragments).toHaveLength(1);
      expect(back.fragments[0].name).toBe("公司简介");
      expect(back.fragments[0].items).toHaveLength(2);
      expect(back.fragments[0].items[1].id).toBe("it2");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("没有片段文件时返回空库", async () => {
    const dir = await tmpSite();
    try {
      const lib = await readFragmentLibrary(dir, "demo");
      expect(lib.fragments).toEqual([]);
      expect(lib.version).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("文件坏了也当空库 —— 素材坏了不该挡住整个后台", async () => {
    const dir = await tmpSite();
    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(join(dir, FRAGMENTS_FILENAME), "{ 这不是 JSON", "utf8");
      const lib = await readFragmentLibrary(dir, "demo");
      expect(lib.fragments).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("模块存为片段 —— 条目 id 原样保留（覆盖要靠它定位）", () => {
    const m: PageModule = {
      id: "mod1",
      type: "faq",
      title: "常见问题",
      items: [item("qa1", "多久上线？")],
      props: { kind: "generic" },
      order: 0,
      enabled: true,
    };
    const f = moduleToFragment(m, "常见问题", "放在首页与支持页");
    expect(f.type).toBe("faq");
    expect(f.items[0].id).toBe("qa1");
    expect(f.name).toBe("常见问题");
    expect(f.description).toBe("放在首页与支持页");
  });
});

describe("片段：引用展开", () => {
  it("引用型模块在物化时展开成普通模块", () => {
    const m: PageModule = {
      id: "mod1",
      type: "rich-text",
      items: [],
      order: 0,
      enabled: true,
      fragmentId: "fg1",
    };
    const plan = planWith([m]);
    const map = new Map([["fg1", frag()]]);

    const { pages } = materializeModulePlan(plan, noItems, map);
    const mod = pages[0].modules[0];
    expect(mod.type).toBe("rich-text");
    expect(mod.title).toBe("关于我们");
    expect(mod.items).toHaveLength(2);
    expect(mod.items[0].title).toBe("我们是谁");
    // 展开后与普通模块在渲染层无差别 —— 条目形状一致
    expect(mod.items[0].paragraphs).toEqual([]);
  });

  it("局部覆盖：标题与条目文案都能覆盖", () => {
    const m: PageModule = {
      id: "mod1",
      type: "rich-text",
      items: [],
      order: 0,
      enabled: true,
      fragmentId: "fg1",
      overrides: {
        title: "公司简介（短版）",
        items: [{ itemId: "it1", title: "我们是做什么的" }],
      },
    };
    const map = new Map([["fg1", frag()]]);
    const resolved = resolveFragmentModule(m, map.get("fg1"));
    expect(resolved.title).toBe("公司简介（短版）");
    expect(resolved.items[0].title).toBe("我们是做什么的");
    // 没被覆盖的条目保持片段原样
    expect(resolved.items[1].title).toBe("我们做什么");
  });

  it("局部覆盖：可以只在这一处隐藏某条", () => {
    const m: PageModule = {
      id: "mod1",
      type: "rich-text",
      items: [],
      order: 0,
      enabled: true,
      fragmentId: "fg1",
      overrides: { items: [{ itemId: "it2", hidden: true }] },
    };
    const map = new Map([["fg1", frag()]]);
    const resolved = resolveFragmentModule(m, map.get("fg1"));
    expect(resolved.items).toHaveLength(1);
    expect(resolved.items[0].id).toBe("it1");
  });

  it("片段不存在时展开不炸 —— 真正的拦截在校验", () => {
    const m: PageModule = {
      id: "mod1",
      type: "rich-text",
      items: [],
      order: 0,
      enabled: true,
      fragmentId: "missing",
    };
    const resolved = resolveFragmentModule(m, undefined);
    expect(resolved.items).toEqual([]);
    expect(resolved.fragmentId).toBe("missing");
  });

  it("展开整份编排 —— 原编排不动（后台要看得见「这是引用」）", () => {
    const m: PageModule = {
      id: "mod1",
      type: "rich-text",
      items: [],
      order: 0,
      enabled: true,
      fragmentId: "fg1",
    };
    const plan = planWith([m]);
    const map = new Map([["fg1", frag()]]);
    const expanded = expandFragmentPlan(plan, map);
    expect(expanded.pages[0].modules[0].items).toHaveLength(2);
    expect(plan.pages[0].modules[0].items).toHaveLength(0);
  });

  it("片段可以展开成一个独立模块（拷贝一份内容）", () => {
    const m = fragmentToModule(frag(), { id: "mod9", order: 3 });
    expect(m.items).toHaveLength(2);
    expect(m.order).toBe(3);
    expect(m.enabled).toBe(true);
  });
});

describe("片段：脱离引用", () => {
  it("脱离后内容变成这一处自己的，引用标记消失", () => {
    const m: PageModule = {
      id: "mod1",
      type: "rich-text",
      items: [],
      order: 0,
      enabled: true,
      fragmentId: "fg1",
    };
    const map = new Map([["fg1", frag()]]);
    const detached = detachFragmentModule(m, map.get("fg1"));
    expect(detached.fragmentId).toBeUndefined();
    expect(detached.overrides).toBeUndefined();
    expect(detached.items).toHaveLength(2);
    expect(detached.title).toBe("关于我们");
  });

  it("脱离后与片段再无关系 —— 改片段不影响这里", () => {
    const f = frag();
    const m: PageModule = {
      id: "mod1",
      type: "rich-text",
      items: [],
      order: 0,
      enabled: true,
      fragmentId: "fg1",
    };
    const detached = detachFragmentModule(m, f);
    f.items[0].title = "改了片段";
    expect(detached.items[0].title).toBe("我们是谁");
  });
});

describe("片段：校验", () => {
  it("引用了不存在的片段 —— error", () => {
    const m: PageModule = {
      id: "mod1",
      type: "rich-text",
      items: [],
      order: 0,
      enabled: true,
      fragmentId: "nope",
    };
    const problems = validateModulePlan(planWith([m]), noItems, new Map());
    const errors = problems.filter((p) => p.level === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("片段不存在");
  });

  it("片段条目为空 —— error", () => {
    const f = frag();
    f.items = [];
    const problems = validateFragment(f, noItems);
    expect(problems.some((p) => p.level === "error" && p.message.includes("没有条目"))).toBe(true);
  });

  it("片段里的条目按现有模块类型的规则校验", () => {
    const f = frag();
    f.type = "faq";
    f.items = [{ ...item("qa1", ""), question: "多久上线", answer: "" }];
    const problems = validateFragment(f, noItems);
    const msgs = problems.map((p) => p.message).join("；");
    expect(msgs).toContain("问句");
    expect(msgs).toContain("缺答案");
  });

  it("引用片段的模块 —— 按展开后的内容校验", () => {
    const f = frag();
    f.type = "faq";
    f.items = [{ ...item("qa1", ""), question: "多久上线？", answer: "" }];
    const m: PageModule = {
      id: "mod1",
      type: "faq",
      items: [],
      order: 0,
      enabled: true,
      fragmentId: "fg1",
    };
    const problems = validateModulePlan(planWith([m]), noItems, new Map([["fg1", f]]));
    expect(problems.some((p) => p.message.includes("缺答案"))).toBe(true);
  });

  it("统计按展开后的条目算 —— 引用模块不能显示成 0 条", () => {
    const m: PageModule = {
      id: "mod1",
      type: "rich-text",
      items: [],
      order: 0,
      enabled: true,
      fragmentId: "fg1",
    };
    const plan = planWith([m]);
    const map = new Map([["fg1", frag()]]);
    const stats = modulePlanStats(plan, map);
    expect(stats.modules).toBe(1);
    expect(stats.items).toBe(2);
  });

  it("谁在用这个片段 —— 删片段前要能说清楚", () => {
    const m: PageModule = {
      id: "mod1",
      type: "rich-text",
      items: [],
      order: 0,
      enabled: true,
      fragmentId: "fg1",
    };
    const usage = fragmentUsage(planWith([m]));
    expect(usage.get("fg1")).toHaveLength(1);
    expect(usage.get("fg1")?.[0].pageTitle).toBe("首页");
  });
});

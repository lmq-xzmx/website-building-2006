import { describe, expect, it } from "vitest";

import {
  applyPlan,
  emptyPlan,
  planStats,
  validatePlan,
  type ContentPlan,
} from "../plan/plan.js";
import { materializePlan, mergePlanContent, renderPlanModule } from "../plan/generate.js";
import type { KnowledgeItem } from "../sync/knowledge-sync.js";
import type { SiteContent } from "../types.js";

function item(over: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id: "i1",
    kb_id: "kb",
    title: "私有化部署检查清单",
    content: "部署后不需要联网。\n- 离线许可证\n- 审计日志保留 3 年",
    summary: "合规团队必问的问题",
    tags: ["合规"],
    sync_status: "pulled",
    updated_at: "2026-11-09T10:00:00.000Z",
    ...over,
  };
}

const base: SiteContent = {
  siteId: "s",
  name: "站",
  description: "d",
  url: "https://x.com",
  locale: "zh-CN",
  organization: { name: "站" },
  sections: [{ id: "ins", type: "insights", title: "洞察" }],
  insights: [{ id: "manual", title: "手写文章" }],
  faq: [{ question: "手写问题？", answer: "手写答案" }],
};

function items(...list: KnowledgeItem[]): Map<string, KnowledgeItem> {
  return new Map(list.map((i) => [i.id, i]));
}

function plan(entries: ContentPlan["entries"]): ContentPlan {
  return { ...emptyPlan("s"), entries };
}

describe("计划合并", () => {
  it("计划条目排在手写条目前面", () => {
    const p = plan([{ itemId: "i1", slot: "insights", order: 1, published: true }]);
    const { content } = applyPlan(base, p, items(item()));
    expect(content.insights?.[0].title).toBe("私有化部署检查清单");
    expect(content.insights?.some((i) => i.id === "manual")).toBe(true);
  });

  it("草稿不进站点", () => {
    const p = plan([{ itemId: "i1", slot: "insights", order: 1, published: false }]);
    const { content } = applyPlan(base, p, items(item()));
    expect(content.insights).toHaveLength(1);
    expect(content.insights?.[0].id).toBe("manual");
  });

  it("手写内容不被改动（原对象）", () => {
    const before = JSON.stringify(base);
    const p = plan([{ itemId: "i1", slot: "insights", order: 1, published: true }]);
    applyPlan(base, p, items(item()));
    expect(JSON.stringify(base)).toBe(before);
  });

  it("知识库已删的条目被跳过", () => {
    const p = plan([{ itemId: "gone", slot: "insights", order: 1, published: true }]);
    const { content, skipped } = applyPlan(base, p, items(item()));
    expect(skipped).toHaveLength(1);
    expect(content.insights).toHaveLength(1);
  });

  it("order 小的在前", () => {
    const p = plan([
      { itemId: "i2", slot: "insights", order: 2, published: true },
      { itemId: "i1", slot: "insights", order: 1, published: true },
    ]);
    const { content } = applyPlan(base, p, items(item(), item({ id: "i2", title: "第二篇" })));
    expect(content.insights?.[0].title).toBe("私有化部署检查清单");
    expect(content.insights?.[1].title).toBe("第二篇");
  });

  it("FAQ 槽位产出问答对", () => {
    const p = plan([
      { itemId: "i1", slot: "faq", order: 1, published: true, title: "部署后需要联网吗？" },
    ]);
    const { content } = applyPlan(base, p, items(item()));
    expect(content.faq?.[0].question).toBe("部署后需要联网吗？");
    expect(content.faq?.[1].question).toBe("手写问题？");
  });

  it("案例槽位产出案例卡片", () => {
    const p = plan([
      {
        itemId: "i1",
        slot: "cases",
        order: 1,
        published: true,
        client: "某某银行",
        results: ["部署周期从 30 天降到 7 天"],
      },
    ]);
    const { content } = applyPlan(base, p, items(item()));
    expect(content.cases?.[0].client).toBe("某某银行");
    expect(content.cases?.[0].results).toHaveLength(1);
  });

  it("产品槽位产出产品卡片", () => {
    const p = plan([
      {
        itemId: "i1",
        slot: "products",
        order: 1,
        published: true,
        specs: [{ name: "并发", value: "5000" }],
      },
    ]);
    const { content } = applyPlan(base, p, items(item()));
    expect(content.products?.[0].specs?.[0].value).toBe("5000");
  });

  it("人工补充的正文追加在结构化正文之后", () => {
    const p = plan([
      {
        itemId: "i1",
        slot: "insights",
        order: 1,
        published: true,
        extraBody: ["人工补充的一段"],
      },
    ]);
    const { content } = applyPlan(base, p, items(item()));
    const body = content.insights?.[0].body ?? [];
    expect(body[body.length - 1]).toBe("人工补充的一段");
  });

  it("标题覆盖生效", () => {
    const p = plan([
      { itemId: "i1", slot: "insights", order: 1, published: true, title: "改过的标题" },
    ]);
    const { content } = applyPlan(base, p, items(item()));
    expect(content.insights?.[0].title).toBe("改过的标题");
  });
});

describe("计划校验", () => {
  it("通过的场景", () => {
    const p = plan([{ itemId: "i1", slot: "insights", order: 1, published: true }]);
    expect(validatePlan(p, items(item()))).toHaveLength(0);
  });

  it("案例缺客户名被拦", () => {
    const p = plan([{ itemId: "i1", slot: "cases", order: 1, published: true }]);
    const problems = validatePlan(p, items(item()));
    expect(problems.some((x) => x.includes("缺客户名"))).toBe(true);
  });

  it("案例缺量化结果被拦", () => {
    const p = plan([
      { itemId: "i1", slot: "cases", order: 1, published: true, client: "某某" },
    ]);
    expect(validatePlan(p, items(item())).some((x) => x.includes("缺量化结果"))).toBe(true);
  });

  it("FAQ 标题不是问句被拦", () => {
    const p = plan([
      { itemId: "i1", slot: "faq", order: 1, published: true, title: "陈述句" },
    ]);
    expect(validatePlan(p, items(item())).some((x) => x.includes("问句"))).toBe(true);
  });

  it("知识库里没有的条目被拦", () => {
    const p = plan([{ itemId: "nope", slot: "insights", order: 1, published: true }]);
    expect(validatePlan(p, items(item())).some((x) => x.includes("找不到"))).toBe(true);
  });

  it("重复编排被拦", () => {
    const p = plan([
      { itemId: "i1", slot: "insights", order: 1, published: true },
      { itemId: "i1", slot: "insights", order: 2, published: true },
    ]);
    expect(validatePlan(p, items(item())).some((x) => x.includes("重复"))).toBe(true);
  });

  it("空正文被拦", () => {
    const p = plan([{ itemId: "i1", slot: "insights", order: 1, published: true }]);
    const problems = validatePlan(p, items(item({ content: "  " })));
    expect(problems.some((x) => x.includes("正文为空"))).toBe(true);
  });
});

describe("计划统计", () => {
  it("按槽位统计", () => {
    const p = plan([
      { itemId: "i1", slot: "insights", order: 1, published: true },
      { itemId: "i2", slot: "insights", order: 2, published: false },
      { itemId: "i3", slot: "faq", order: 3, published: true },
    ]);
    const s = planStats(p);
    expect(s.total).toBe(3);
    expect(s.published).toBe(2);
    expect(s.drafts).toBe(1);
    expect(s.bySlot.insights).toEqual({ total: 2, published: 1 });
    expect(s.bySlot.faq).toEqual({ total: 1, published: 1 });
  });

  it("统计可被 JSON 序列化（Map 会变空对象）", () => {
    const s = planStats(plan([]));
    expect(JSON.parse(JSON.stringify(s)).bySlot.insights.total).toBe(0);
  });
});

describe("物化与构建期合并", () => {
  it("物化只含计划内容，不含手写", () => {
    const p = plan([{ itemId: "i1", slot: "insights", order: 1, published: true }]);
    const { content } = materializePlan(base, p, items(item()));
    expect(content.insights).toHaveLength(1);
    expect(content.insights[0].id).toBe("i1");
  });

  it("模块源码包含数据且是纯 TS", () => {
    const p = plan([{ itemId: "i1", slot: "insights", order: 1, published: true }]);
    const { content } = materializePlan(base, p, items(item()));
    const src = renderPlanModule(p, content, "2026-11-09T00:00:00Z");
    expect(src).toContain("export const planContent");
    expect(src).toContain("私有化部署检查清单");
    expect(src).toContain("import type");
  });

  it("构建期合并把计划放在手写前面", () => {
    const planned = {
      insights: [{ id: "p1", title: "计划文章" }],
      faq: [],
      products: [],
      cases: [],
    };
    const merged = mergePlanContent(base, planned);
    expect(merged.insights?.[0].title).toBe("计划文章");
    expect(merged.insights?.some((i) => i.id === "manual")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { buildSearchIndex, searchIndex, splitByTerms } from "../search.js";
import type { SiteContent } from "../types.js";

/** 造一份含模块编排页 + 手写内容包的内容 */
function content(): SiteContent {
  return {
    siteId: "demo",
    name: "示例科技",
    description: "示例站点",
    url: "https://demo.example.com",
    locale: "zh-CN",
    organization: {
      name: "示例科技股份有限公司",
      url: "https://demo.example.com",
      logo: "/assets/logo.svg",
    },
    sections: [
      {
        id: "home",
        type: "home",
        title: "企业级数据平台",
        subtitle: "已服务 180 家企业客户",
        body: ["低代码数据交付平台，支持私有化部署。"],
      },
      {
        id: "products",
        type: "products",
        title: "产品矩阵",
        body: ["四条产品线说明。"],
      },
      {
        id: "faq",
        type: "faq",
        title: "常见问题",
        faq: [
          { question: "私有化部署需要几台服务器？", answer: "最小 3 台，推荐 5 台起。", category: "部署" },
        ],
      },
    ],
    products: [
      {
        id: "data-gateway",
        name: "数据集成网关",
        summary: "跨异构系统的数据采集网关",
        description: "连接 ERP、CRM 与数据库。",
        specs: [{ name: "连接器数量", value: "1200", unit: "个" }],
        image: "/assets/data-gateway.svg",
      },
    ],
    cases: [
      {
        id: "bank",
        title: "银行报表交付提速",
        challenge: "依赖 14 个系统人工取数。",
        solution: "部署数据集成网关对接源系统。",
        results: ["交付周期从 6 周缩短至 4 天"],
      },
    ],
    insights: [
      {
        id: "checklist",
        title: "私有化部署检查清单",
        summary: "合规团队必问的 12 个问题",
        body: ["排名第一的问题是部署后是否需要联网。"],
        date: "2026-09-20",
      },
    ],
    pages: [
      {
        id: "pg_solution",
        path: "/solutions",
        title: "解决方案",
        description: "解决方案总览",
        modules: [
          {
            id: "mod_hero",
            type: "hero",
            items: [
              {
                id: "it_hero",
                source: "manual",
                title: "合规数据交付的三个支点",
                summary: "从采集到审计的全链路能力",
                body: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "平台采用多租户架构实现数据隔离，支持国产化适配。" }],
                    },
                  ],
                },
              },
            ],
          },
          {
            id: "mod_cards",
            type: "card-grid",
            items: [
              {
                id: "it_card",
                source: "manual",
                title: "审计中枢",
                summary: "统一操作留痕",
                body: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "日志保留 3 年可追溯。" }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("搜索索引构建", () => {
  it("索引条目数正确 —— 模块条目 + 手写内容", () => {
    const index = buildSearchIndex(content());
    // 区块 3 + 产品 1 + 案例 1 + 洞察 1 + FAQ 1 + 模块条目 2
    expect(index.items).toHaveLength(9);
    expect(index.siteId).toBe("demo");
    expect(index.siteName).toBe("示例科技");
    expect(index.version).toBe(1);
  });

  it("正文纯文本正确 —— 富文本降级后不含标记", () => {
    const index = buildSearchIndex(content());
    const hero = index.items.find((i) => i.id === "pg_solution:mod_hero:it_hero");
    expect(hero).toBeDefined();
    expect(hero?.text).toBe("平台采用多租户架构实现数据隔离，支持国产化适配。");
    expect(hero?.text).not.toContain("{");
    expect(hero?.moduleType).toBe("hero");
    expect(hero?.pageTitle).toBe("解决方案");
    expect(hero?.path).toBe("/solutions");
  });

  it("手写内容的条目带上路径、标题与摘要", () => {
    const index = buildSearchIndex(content());
    const product = index.items.find((i) => i.id === "product:data-gateway");
    expect(product?.path).toBe("/products#data-gateway");
    expect(product?.title).toBe("数据集成网关");
    expect(product?.summary).toBe("跨异构系统的数据采集网关");
    expect(product?.text).toContain("连接器数量：1200个");
    expect(product?.image).toBe("/assets/data-gateway.svg");

    const faq = index.items.find((i) => i.moduleType === "faq");
    expect(faq?.title).toBe("私有化部署需要几台服务器？");
    expect(faq?.text).toBe("最小 3 台，推荐 5 台起。");
  });

  it("内容为空时不产生空条目", () => {
    const empty: SiteContent = {
      siteId: "empty",
      name: "空站",
      description: "空",
      url: "https://empty.example.com",
      locale: "zh-CN",
      organization: { name: "空站", url: "https://empty.example.com" },
      sections: [],
    };
    expect(buildSearchIndex(empty).items).toHaveLength(0);
  });
});

describe("搜索匹配", () => {
  const items = buildSearchIndex(content()).items;

  it("标题命中 —— 命中标题的条目排在前面", () => {
    const results = searchIndex(items, "审计中枢");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.title).toBe("审计中枢");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("权重排序 —— 标题命中权重高于正文命中", () => {
    const results = searchIndex(items, "私有化");
    expect(results.length).toBeGreaterThan(1);
    // 标题含「私有化部署」的洞察条目应排在只正文命中的前面
    expect(results[0].entry.title).toContain("私有化");
    const titleHit = results.find((r) => r.entry.title.includes("私有化"))!;
    const bodyHit = results.find((r) => !r.entry.title.includes("私有化"))!;
    expect(titleHit.score).toBeGreaterThan(bodyHit.score);
  });

  it("多关键词 —— all 模式要求全部命中", () => {
    const all = searchIndex(items, "审计 日志", { mode: "all" });
    expect(all.length).toBe(1);
    expect(all[0].entry.title).toBe("审计中枢");

    const any = searchIndex(items, "审计 私有化", { mode: "any" });
    expect(any.length).toBeGreaterThan(1);
  });

  it("空查询 —— 不返回任何结果", () => {
    expect(searchIndex(items, "")).toHaveLength(0);
    expect(searchIndex(items, "   ")).toHaveLength(0);
  });

  it("无结果 —— 关键词不匹配任何条目", () => {
    expect(searchIndex(items, "zzzz-不存在的关键词")).toHaveLength(0);
  });

  it("结果条数受 limit 限制", () => {
    const results = searchIndex(items, "平台", { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it("命中片段 —— 截取上下文并标出命中词", () => {
    const results = searchIndex(items, "多租户");
    expect(results.length).toBeGreaterThan(0);
    const snippet = results[0].snippet;
    expect(snippet.length).toBeGreaterThan(0);
    expect(snippet.some((s) => s.hit)).toBe(true);
    const joined = snippet.map((s) => s.text).join("");
    expect(joined).toContain("多租户");
  });
});

describe("命中词切段", () => {
  it("命中段与普通段交替", () => {
    const segments = splitByTerms("审计日志保留 3 年", ["日志"]);
    expect(segments).toEqual([
      { text: "审计", hit: false },
      { text: "日志", hit: true },
      { text: "保留 3 年", hit: false },
    ]);
  });

  it("无命中词时整段为普通段", () => {
    expect(splitByTerms("abc", [])).toEqual([{ text: "abc", hit: false }]);
  });
});

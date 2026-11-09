import { describe, expect, it } from "vitest";

import { buildContentIndex, extractQuotableSignals } from "../content-index.js";
import { generateJsonLd, renderJsonLdScript, validateJsonLd } from "../jsonld.js";
import { generateLlmsTxt, parseLlmsTxt } from "../llms-txt.js";
import { generateRobotsTxt, isCrawlerAllowed } from "../crawlers.js";
import { scoreAudit } from "../audit/scorer.js";
import { evaluateCrawlerAllowed } from "../audit/index.js";
import type { SiteContent } from "../types.js";

const site: SiteContent = {
  siteId: "test",
  name: "测试科技有限公司",
  description: "测试公司提供工业物联网设备，服务 100 家制造企业。",
  url: "https://test.example.com",
  locale: "zh-CN",
  organization: {
    name: "测试科技有限公司",
    url: "https://test.example.com",
    logo: "/assets/logo.svg",
    taxID: "91310000TEST",
  },
  social: [{ platform: "https://github.com", url: "https://github.com/test" }],
  sections: [
    {
      id: "home",
      type: "home",
      title: "工业物联网方案",
      subtitle: "已服务 100 家制造企业。",
      body: ["我们提供 12 款工业采集设备，单台日均采集 48000 个数据点。"],
      bullets: ["48000 数据点/日", "支持 3 类协议"],
    },
    {
      id: "faq",
      type: "faq",
      title: "常见问题",
      faq: [{ question: "最小起订量？", answer: "10 台起订。" }],
    },
  ],
  products: [
    {
      id: "p1",
      name: "EG-200",
      summary: "边缘网关",
      specs: [{ name: "采集点数", value: "48000" }],
    },
  ],
};

describe("内容索引", () => {
  it("从区块派生索引条目", () => {
    const idx = buildContentIndex(site);
    expect(idx.entries.length).toBe(2);
    expect(idx.entries[0].url).toBe("https://test.example.com/");
    expect(idx.entries[1].url).toBe("https://test.example.com/faq");
  });

  it("派生能力清单，含可写的询盘能力", () => {
    const idx = buildContentIndex(site);
    const ids = idx.capabilities.map((c) => c.id);
    expect(ids).toContain("content.home.home");
    expect(ids).toContain("product.lookup");
    expect(ids).toContain("faq.query");
  });

  it("能力都指向实际存在的区块", () => {
    const idx = buildContentIndex(site);
    const sectionIds = new Set(idx.entries.map((e) => e.sectionId));
    for (const cap of idx.capabilities) {
      for (const sid of cap.sectionIds) {
        expect(sectionIds.has(sid)).toBe(true);
      }
    }
  });
});

describe("可引用性信号抽取", () => {
  it("识别含数字的段落", () => {
    const s = extractQuotableSignals(["我们服务 320 家客户。"]);
    expect(s.withNumbers).toBe(1);
  });

  it("识别答案先行结构", () => {
    const s = extractQuotableSignals([
      "我们提供 12 款工业采集设备，覆盖 3 类协议。",
      "细节见下文。",
    ]);
    expect(s.answerFirst).toBe(true);
  });

  it("长引导句不算答案先行", () => {
    const s = extractQuotableSignals([
      "在当今这个高度竞争的工业物联网市场环境当中许多制造企业都面临着来自多方面的严峻挑战与压力",
    ]);
    expect(s.answerFirst).toBe(false);
  });

  it("识别引用来源", () => {
    const s = extractQuotableSignals(["据工信部 2025 年报告，设备联网率提升至 41%。"]);
    expect(s.withCitations).toBe(1);
  });
});

describe("JSON-LD 生成", () => {
  it("生成 Organization 与 WebSite", () => {
    const scripts = generateJsonLd(site);
    const types = scripts.map((s) => s.type);
    expect(types).toContain("Organization");
    expect(types).toContain("WebSite");
  });

  it("Organization 携带 sameAs 与 taxID", () => {
    const scripts = generateJsonLd(site);
    const org = scripts.find((s) => s.type === "Organization")!;
    expect(org.data.sameAs).toEqual(["https://github.com/test"]);
    expect(org.data.taxID).toBe("91310000TEST");
  });

  it("FAQ 区块生成 FAQPage", () => {
    const scripts = generateJsonLd(site);
    const faq = scripts.find((s) => s.type === "FAQPage");
    expect(faq).toBeDefined();
    expect((faq!.data.mainEntity as unknown[]).length).toBe(1);
  });

  it("产品生成 Product 且参数转 additionalProperty", () => {
    const scripts = generateJsonLd(site);
    const product = scripts.find((s) => s.type === "Product")!;
    expect(product.data.name).toBe("EG-200");
    expect(product.data.additionalProperty).toBeDefined();
  });

  it("script 标签转义 </script> 防注入", () => {
    const rendered = renderJsonLdScript({
      type: "Organization",
      data: { name: "</script><script>alert(1)</script>" },
      target: "head",
    });
    expect(rendered).not.toContain("</script><script>");
    expect(rendered).toContain("\\u003c");
  });

  it("校验能发现相对 URL", () => {
    const res = validateJsonLd([
      { type: "WebPage", data: { "@context": "https://schema.org", "@type": "WebPage", url: "/about" }, target: "head" },
    ]);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toContain("相对 URL");
  });
});

describe("llms.txt 生成", () => {
  it("结构符合 llmstxt 规范", () => {
    const txt = generateLlmsTxt(site);
    expect(txt).toMatch(/^# 测试科技有限公司/);
    expect(txt).toMatch(/^> .+/m);
    expect(txt).toMatch(/^## .+/m);
    expect(txt).toContain("- [工业物联网方案](https://test.example.com/)");
  });

  it("可被自己解析器解析且无问题", () => {
    const parsed = parseLlmsTxt(generateLlmsTxt(site));
    expect(parsed.problems).toEqual([]);
    expect(parsed.title).toBe("测试科技有限公司");
    expect(parsed.categories.length).toBe(2);
  });

  it("解析器能报出结构缺失", () => {
    const parsed = parseLlmsTxt("随便一些文字");
    expect(parsed.problems.length).toBeGreaterThan(0);
  });
});

describe("robots.txt 与爬虫策略", () => {
  it("显式放行检索型爬虫", () => {
    const txt = generateRobotsTxt("https://test.example.com");
    expect(txt).toContain("User-agent: OAI-SearchBot");
    expect(txt).toContain("User-agent: Claude-SearchBot");
  });

  it("训练型可配置为屏蔽", () => {
    const txt = generateRobotsTxt("https://test.example.com", {
      allowTraining: false,
      allowSearch: true,
      allowOnDemand: true,
      disallowSnippetControl: true,
    });
    expect(txt).toMatch(/User-agent: GPTBot\nDisallow: \//);
    expect(txt).toMatch(/User-agent: OAI-SearchBot\nAllow: \//);
  });

  it("包含 sitemap 声明", () => {
    const txt = generateRobotsTxt("https://test.example.com");
    expect(txt).toContain("Sitemap: https://test.example.com/sitemap.xml");
  });

  it("判定函数：屏蔽训练型不影响检索型", () => {
    const policy = {
      allowTraining: false,
      allowSearch: true,
      allowOnDemand: true,
      disallowSnippetControl: true,
    };
    expect(isCrawlerAllowed("GPTBot", policy)).toBe(false);
    expect(isCrawlerAllowed("OAI-SearchBot", policy)).toBe(true);
  });

  it("robots 判定：专属段落优先于通配符", () => {
    const robots = `User-agent: *
Disallow: /

User-agent: OAI-SearchBot
Allow: /
`;
    expect(evaluateCrawlerAllowed(robots, "OAI-SearchBot")).toBe(true);
    expect(evaluateCrawlerAllowed(robots, "SomeOtherBot")).toBe(false);
  });
});

describe("GEO 体检评分", () => {
  it("缺数据标记 unknown 而非 fail", () => {
    const result = scoreAudit({ url: "https://test.example.com" });
    const dimE = result.dimensions.find((d) => d.key === "E")!;
    const check = dimE.checks[0];
    expect(check.status).toBe("unknown");
  });

  it("满分场景得高分", () => {
    const index = buildContentIndex(site);
    const scripts = generateJsonLd(site);
    const result = scoreAudit({
      url: "https://test.example.com",
      robotsTxt: generateRobotsTxt(site.url),
      llmsTxt: generateLlmsTxt(site),
      html: `<html lang="zh-CN"><head><title>测试科技有限公司 - 工业物联网</title>
        <meta name="description" content="测试公司提供工业物联网设备，服务 100 家制造企业，专注工业场景数据采集。">
        <link rel="canonical" href="https://test.example.com/">
        <meta property="og:image" content="/og.png"></head><body><h1>测试</h1></body></html>`,
      jsonLd: scripts as unknown[],
      index: {
        entries: index.entries.map((e) => ({
          sectionId: e.sectionId,
          title: e.title,
          description: e.description,
          url: e.url,
          category: e.category,
          quotable: e.quotable,
          hasFaq: e.hasFaq,
        })),
        capabilities: index.capabilities,
      },
      locale: "zh-CN",
      expectedSchemaTypes: ["Organization", "WebSite", "FAQPage", "Product"],
      crawlerAllowed: { "OAI-SearchBot": true, GPTBot: true },
    });
    expect(result.score).toBeGreaterThan(60);
    expect(result.grade).toMatch(/[A-F]/);
    expect(result.dimensions.length).toBe(7);
  });

  it("全空站点得低分且有 critical 建议", () => {
    const result = scoreAudit({ url: "http://test.example.com" });
    expect(result.score).toBeLessThan(40);
    expect(result.grade).toBe("F");
  });

  it("各维度权重之和为 1", () => {
    const result = scoreAudit({ url: "https://test.example.com" });
    const total = result.dimensions.reduce((s, d) => s + d.weight, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });
});

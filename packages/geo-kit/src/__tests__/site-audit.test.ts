import { describe, expect, it } from "vitest";

import { auditSiteLevel, combineResults, findOrphanPages } from "../audit/site.js";
import { extractPageFacts, normalizeLink, parseSitemapUrls, rewriteUrlsToBase } from "../audit/crawl.js";
import { scoreAudit } from "../audit/scorer.js";
import type { SiteContent } from "../types.js";

const content: SiteContent = {
  siteId: "t",
  name: "测试公司",
  description: "测试公司提供工业物联网设备。",
  url: "https://prod.example.com",
  locale: "zh-CN",
  organization: { name: "测试公司", url: "https://prod.example.com" },
  sections: [
    {
      id: "home",
      type: "home",
      title: "首页",
      subtitle: "测试公司首页定位语",
      body: ["我们提供 12 款设备，服务 100 家企业。"],
    },
    {
      id: "products",
      type: "products",
      title: "产品",
      subtitle: "产品定位语与首页不同",
      body: ["四个产品线的参数说明。"],
    },
  ],
};

const okPage = (path: string, title: string, desc: string, h1 = 1) => ({
  url: `https://prod.example.com${path}`,
  status: 200,
  title,
  description: desc,
  h1Count: h1,
  canonical: `https://prod.example.com${path}`,
  textLength: 800,
});

describe("sitemap 与 URL 归一化", () => {
  it("解析 sitemap 的 loc", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://a.com/x</loc></url><url><loc>https://a.com/y</loc></url></urlset>`;
    expect(parseSitemapUrls(xml)).toEqual(["https://a.com/x", "https://a.com/y"]);
  });

  it("重写到被测域名（sitemap 用生产域名是对的）", () => {
    const out = rewriteUrlsToBase(["https://prod.example.com/a", "https://prod.example.com/b/"], "http://localhost:5101");
    expect(out).toEqual(["http://localhost:5101/a", "http://localhost:5101/b/"]);
  });

  it("归一化相对链接为绝对 URL", () => {
    expect(normalizeLink("/products", "http://localhost:5101")).toBe("http://localhost:5101/products");
    expect(normalizeLink("/products/", "http://localhost:5101")).toBe("http://localhost:5101/products");
    expect(normalizeLink("https://x.com/y", "http://localhost:5101")).toBe("https://x.com/y");
  });
});

describe("页面事实抽取", () => {
  it("抽取 title/description/canonical/h1/JSON-LD", () => {
    const html = `<html lang="zh-CN"><head>
      <title>测试页面标题</title>
      <meta content="页面描述内容" name="description"/>
      <link href="https://x.com/p" rel="canonical"/>
      <script type="application/ld+json">{"@type":"Organization","name":"X"}</script>
      </head><body><h1>一</h1><h1>二</h1><p>正文</p>
      <a href="/next">下一个</a></body></html>`;
    const facts = extractPageFacts(html);
    expect(facts.title).toBe("测试页面标题");
    expect(facts.description).toBe("页面描述内容");
    expect(facts.canonical).toBe("https://x.com/p");
    expect(facts.h1Count).toBe(2);
    expect(facts.jsonLdTypes).toContain("Organization");
    expect(facts.links).toContain("/next");
  });

  it("属性顺序颠倒也能抽到 description 与 canonical", () => {
    const html = `<head><meta name="description" content="A"><link rel="canonical" href="https://x.com/"></head>`;
    const facts = extractPageFacts(html);
    expect(facts.description).toBe("A");
    expect(facts.canonical).toBe("https://x.com/");
  });
});

describe("站级检查", () => {
  it("检测重复标题", () => {
    const pages = [
      okPage("/a", "同一个标题", "描述一"),
      okPage("/b", "同一个标题", "描述二"),
    ];
    const res = auditSiteLevel({ content, pages });
    expect(res.duplicateTitles).toHaveLength(1);
    expect(res.duplicateTitles[0].urls).toHaveLength(2);
    const check = res.checks.find((c) => c.id === "S2")!;
    expect(check.status).not.toBe("pass");
  });

  it("检测重复描述", () => {
    const pages = [
      okPage("/a", "标题一", "同一个描述"),
      okPage("/b", "标题二", "同一个描述"),
    ];
    const res = auditSiteLevel({ content, pages });
    expect(res.duplicateDescriptions).toHaveLength(1);
  });

  it("检测异常页面与过薄页面", () => {
    const pages = [
      okPage("/", "标题一", "描述一"),
      { url: "https://prod.example.com/bad", status: 404, error: "HTTP 404" },
      { ...okPage("/thin", "标题三", "描述三"), textLength: 100 },
    ];
    const res = auditSiteLevel({ content, pages });
    expect(res.failedPages).toHaveLength(1);
    const s1 = res.checks.find((c) => c.id === "S1")!;
    const s7 = res.checks.find((c) => c.id === "S7")!;
    expect(s1.status).not.toBe("pass");
    expect(s7.status).not.toBe("pass");
  });

  it("检测 H1 异常", () => {
    const pages = [okPage("/", "t", "d", 3)];
    const res = auditSiteLevel({ content, pages });
    const s4 = res.checks.find((c) => c.id === "S4")!;
    expect(s4.status).not.toBe("pass");
  });

  it("内容包与实际路由按路径比较（域名不同不算不一致）", () => {
    const pages = [
      { url: "http://localhost:5101/", status: 200, title: "a", description: "a", h1Count: 1, textLength: 500 },
      { url: "http://localhost:5101/products", status: 200, title: "b", description: "b", h1Count: 1, textLength: 500 },
    ];
    const res = auditSiteLevel({ content, pages });
    const s6 = res.checks.find((c) => c.id === "S6")!;
    expect(s6.status).toBe("pass");
  });
});

describe("孤立页面", () => {
  it("找出没有入链的页面", () => {
    const pages = [
      { url: "http://x.com/", links: ["http://x.com/a"] },
      { url: "http://x.com/a", links: [] },
      { url: "http://x.com/b", links: [] },
    ];
    const orphans = findOrphanPages(pages, "http://x.com/");
    expect(orphans).toEqual(["http://x.com/b"]);
  });

  it("相对链接也能算入链", () => {
    const pages = [
      { url: "http://x.com/", links: ["/a"] },
      { url: "http://x.com/a", links: [] },
    ];
    expect(findOrphanPages(pages, "http://x.com/")).toEqual([]);
  });
});

describe("合并单页与站级结果", () => {
  it("站级检查并入对应维度且总分重算", () => {
    const pageResult = scoreAudit({ url: "https://x.com" });
    const siteResult = auditSiteLevel({ content, pages: [okPage("/", "t", "d")] });
    const combined = combineResults([pageResult], siteResult);
    expect(combined.dimensions.length).toBe(7);
    // 站级检查被并入 A/E/B/D 维度
    const dimE = combined.dimensions.find((d) => d.key === "E")!;
    expect(dimE.checks.some((c) => c.id.startsWith("S"))).toBe(true);
    expect(combined.recommendations.length).toBeGreaterThan(0);
  });
});

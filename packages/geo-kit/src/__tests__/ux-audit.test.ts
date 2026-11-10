/**
 * UX 体检测试 —— 覆盖各检查项的 pass/warn/fail/skip、
 * 页面级与站级的划分，以及几个边界值。
 *
 * 为什么要单独测边界：UX 体检的阈值都是「行业经验值」，
 * 判据一旦差一位就会把合格站判成不合格 —— 边界必须钉死。
 */

import { describe, expect, it } from "vitest";

import { auditUx, contrastRatio, extractUxFacts } from "../audit/ux.js";
import type { UxAuditResult, UxPageFacts } from "../audit/ux.js";

/** 造一个「各项都合格」的页面事实，再按用例改 */
function page(overrides: Partial<UxPageFacts> = {}): UxPageFacts {
  return {
    url: "https://x.com/",
    isHome: true,
    title: "示例科技 | 工业物联网",
    description: "示例科技为制造业提供设备联网与数据采集方案。",
    h1s: ["让工厂数据五分钟内全部上线"],
    headings: [{ level: 1, text: "让工厂数据五分钟内全部上线" }],
    paragraphs: ["我们提供 12 款工业数据采集设备，服务 320 家制造企业。"],
    images: [{ src: "/assets/hero.webp", hasAlt: true, alt: "工厂车间设备联网示意图", width: 640, height: 480 }],
    links: [{ href: "/contact", text: "获取报价", primary: true }],
    buttons: [],
    forms: [],
    hasContact: true,
    heroImages: [{ src: "/assets/hero.webp", hasAlt: true, alt: "工厂车间设备联网示意图", width: 640, height: 480 }],
    heroPrimaryCtas: [{ href: "/contact", text: "获取报价", primary: true }],
    navItems: [
      { label: "首页", href: "/" },
      { label: "产品", href: "/products" },
      { label: "案例", href: "/cases" },
      { label: "洞察", href: "/insights" },
      { label: "关于我们", href: "/about" },
    ],
    footerLinkCount: 6,
    ...overrides,
  };
}

/** 在结果里找某个检查项 */
function find(res: UxAuditResult, id: string, url?: string) {
  if (url) {
    const p = res.pageResults.find((r) => r.url === url);
    const c = p?.checks.find((x) => x.id === id);
    if (!c) throw new Error(`找不到检查项 ${id}（页 ${url}）`);
    return c;
  }
  const c = res.siteChecks.find((x) => x.id === id);
  if (!c) throw new Error(`找不到站级检查项 ${id}`);
  return c;
}

describe("UX 体检的页面级 / 站级划分", () => {
  it("首屏与内容是页面级，导航是站级", () => {
    const res = auditUx({ pages: [page()] });

    // 页面级：逐页产出
    const pageIds = res.pageResults[0].checks.map((c) => c.id);
    expect(pageIds).toContain("ux-hero-claim");
    expect(pageIds).toContain("ux-paragraph-length");
    expect(pageIds).toContain("ux-image-dimensions");

    // 站级：只产出一份
    const siteIds = res.siteChecks.map((c) => c.id);
    expect(siteIds).toContain("ux-nav-count");
    expect(siteIds).toContain("ux-nav-depth");
    expect(siteIds).toContain("ux-page-description");
    expect(siteIds).not.toContain("ux-hero-claim");
  });

  it("结果结构与 auditSiteLevel 同构：checks / score / grade 都在", () => {
    const res = auditUx({ pages: [page()] });
    expect(Array.isArray(res.checks)).toBe(true);
    expect(typeof res.score).toBe("number");
    expect(typeof res.grade).toBe("string");
    expect(res.checks.length).toBe(res.siteChecks.length + res.pageResults.flatMap((p) => p.checks).length);
  });
});

describe("首屏检查", () => {
  it("主标题正好 20 字算通过", () => {
    const title = "让全国每家工厂的设备数据五分钟内全部上线";
    expect(title.length).toBe(20);
    const res = auditUx({ pages: [page({ h1s: [title] })] });
    expect(find(res, "ux-hero-claim", "https://x.com/").status).toBe("pass");
  });

  it("主标题 21 字算提醒，31 字算不通过", () => {
    const warn = auditUx({ pages: [page({ h1s: ["让全国每家工厂的设备数据五分钟内全部上线了"] })] });
    expect(find(warn, "ux-hero-claim", "https://x.com/").status).toBe("warn");

    const fail = auditUx({
      pages: [page({ h1s: ["让全国每家工厂的设备数据五分钟之内全部完成上线并且持续稳定运行"] })],
    });
    expect(find(fail, "ux-hero-claim", "https://x.com/").status).toBe("fail");
  });

  it("主标题含「欢迎访问」这类空话词直接判不通过", () => {
    const res = auditUx({ pages: [page({ h1s: ["欢迎访问示例科技官方网站"] })] });
    const c = find(res, "ux-hero-claim", "https://x.com/");
    expect(c.status).toBe("fail");
    expect(c.note).toContain("欢迎访问");
  });

  it("首屏只有一个主 CTA 才通过，三个主 CTA 判不通过", () => {
    const many = auditUx({
      pages: [
        page({
          heroPrimaryCtas: [
            { href: "/contact", text: "获取报价", primary: true },
            { href: "/demo", text: "预约演示", primary: true },
            { href: "/docs", text: "下载白皮书", primary: true },
          ],
        }),
      ],
    });
    expect(find(many, "ux-hero-single-cta", "https://x.com/").status).toBe("fail");
  });

  it("首屏图片缺尺寸要提醒，尺寸齐全才通过", () => {
    const noSize = auditUx({
      pages: [page({ heroImages: [{ src: "/a.webp", hasAlt: true, alt: "示意图" }] })],
    });
    expect(find(noSize, "ux-hero-image-lcp", "https://x.com/").status).toBe("fail");

    const ok = auditUx({ pages: [page()] });
    expect(find(ok, "ux-hero-image-lcp", "https://x.com/").status).toBe("pass");
  });
});

describe("信息架构检查", () => {
  it("导航正好 5 项通过，8 项判不通过，3 项提醒", () => {
    const five = ["/", "/products", "/cases", "/insights", "/about"].map((href, i) => ({
      label: `项${i}`,
      href,
    }));
    const eight = [...["/", "/products", "/cases", "/insights", "/about", "/faq", "/news", "/contact"].map(
      (href, i) => ({ label: `项${i}`, href }),
    )];
    const three = five.slice(0, 3);

    expect(find(auditUx({ pages: [page()], nav: { items: five } }), "ux-nav-count").status).toBe("pass");
    expect(find(auditUx({ pages: [page()], nav: { items: eight } }), "ux-nav-count").status).toBe("fail");
    expect(find(auditUx({ pages: [page()], nav: { items: three } }), "ux-nav-count").status).toBe("warn");
  });

  it("导航层级 3 级通过，4 级提醒，5 级判不通过", () => {
    const nav = (depth: number) => ({
      items: [{ label: "深层", href: Array.from({ length: depth }, (_, i) => `/l${i}`).join("/") }],
      depth,
    });
    expect(find(auditUx({ pages: [page()], nav: nav(3) }), "ux-nav-depth").status).toBe("pass");
    expect(find(auditUx({ pages: [page()], nav: nav(4) }), "ux-nav-depth").status).toBe("warn");
    expect(find(auditUx({ pages: [page()], nav: nav(5) }), "ux-nav-depth").status).toBe("fail");
  });

  it("页面 description 共用同一份要判不通过", () => {
    const dup = auditUx({
      pages: [
        page({ url: "https://x.com/", description: "同一份描述" }),
        page({ url: "https://x.com/about", description: "同一份描述", isHome: false }),
      ],
    });
    const c = find(dup, "ux-page-description");
    expect(c.status).toBe("fail");
    expect(c.note).toContain("共用");

    const unique = auditUx({
      pages: [
        page({ url: "https://x.com/", description: "首页描述" }),
        page({ url: "https://x.com/about", description: "关于我们页的独立描述", isHome: false }),
      ],
    });
    expect(find(unique, "ux-page-description").status).toBe("pass");
  });
});

describe("内容检查", () => {
  it("超长段落判不通过", () => {
    const long = "这".repeat(260);
    const res = auditUx({ pages: [page({ paragraphs: [long] })] });
    const c = find(res, "ux-paragraph-length", "https://x.com/");
    expect(c.status).toBe("fail");
    expect(c.note).toContain("超过");
  });

  it("页面没有 H1 或 H1 不唯一都判不通过", () => {
    const none = auditUx({ pages: [page({ h1s: [] })] });
    expect(find(none, "ux-heading-hierarchy", "https://x.com/").status).toBe("fail");

    const two = auditUx({ pages: [page({ h1s: ["一", "二"] })] });
    expect(find(two, "ux-heading-hierarchy", "https://x.com/").status).toBe("fail");
  });
});

describe("转化检查", () => {
  it("没有 CTA 判不通过，有 CTA 通过", () => {
    const none = auditUx({
      pages: [page({ links: [{ href: "/blog", text: "看博客", primary: false }] })],
    });
    expect(find(none, "ux-cta-presence", "https://x.com/").status).toBe("fail");

    const ok = auditUx({ pages: [page()] });
    expect(find(ok, "ux-cta-presence", "https://x.com/").status).toBe("pass");
  });

  it("没有联系入口判不通过", () => {
    const res = auditUx({ pages: [page({ hasContact: false })] });
    expect(find(res, "ux-contact-reachable", "https://x.com/").status).toBe("fail");
  });

  it("表单必填 3 项通过、6 项判不通过、2 项提醒", () => {
    const form = (required: number) => ({
      total: required,
      required,
      fields: Array.from({ length: required }, (_, i) => `f${i}`),
    });
    const withForm = (required: number) => auditUx({ pages: [page({ forms: [form(required)] })] });

    expect(find(withForm(3), "ux-form-fields", "https://x.com/").status).toBe("pass");
    expect(find(withForm(6), "ux-form-fields", "https://x.com/").status).toBe("fail");
    expect(find(withForm(2), "ux-form-fields", "https://x.com/").status).toBe("warn");
  });
});

describe("性能与移动端检查", () => {
  it("图片缺尺寸提醒，格式不是 WebP/AVIF 要提示", () => {
    const res = auditUx({
      pages: [
        page({
          images: [
            { src: "/a.jpg", hasAlt: true, alt: "照片", width: 100, height: 100 },
            { src: "/b.jpg", hasAlt: true, alt: "照片" },
          ],
        }),
      ],
    });
    expect(find(res, "ux-image-dimensions", "https://x.com/").status).toBe("warn");
    expect(find(res, "ux-image-format", "https://x.com/").status).toBe("warn");
  });

  it("字号、行高、点击尺寸达标才通过", () => {
    const styles = { fontSize: 16, lineHeight: 1.8, minTouchTarget: 48 };
    const ok = auditUx({ pages: [page({ styles })] });
    expect(find(ok, "ux-font-size", "https://x.com/").status).toBe("pass");
    expect(find(ok, "ux-line-height", "https://x.com/").status).toBe("pass");
    expect(find(ok, "ux-touch-target", "https://x.com/").status).toBe("pass");

    const bad = auditUx({
      pages: [page({ styles: { fontSize: 12, lineHeight: 1.4, minTouchTarget: 32 } })],
    });
    expect(find(bad, "ux-font-size", "https://x.com/").status).toBe("fail");
    expect(find(bad, "ux-line-height", "https://x.com/").status).toBe("fail");
    expect(find(bad, "ux-touch-target", "https://x.com/").status).toBe("fail");
  });

  it("取不到样式数据时跳过而不是判不通过", () => {
    const res = auditUx({ pages: [page({ styles: undefined })] });
    expect(find(res, "ux-font-size", "https://x.com/").status).toBe("skip");
    expect(find(res, "ux-contrast", "https://x.com/").status).toBe("skip");
  });
});

describe("无障碍检查", () => {
  it("所有图片都有 alt 才通过", () => {
    const ok = auditUx({ pages: [page()] });
    expect(find(ok, "ux-alt-coverage", "https://x.com/").status).toBe("pass");

    const missing = auditUx({
      pages: [page({ images: [{ src: "/a.webp", hasAlt: false }] })],
    });
    expect(find(missing, "ux-alt-coverage", "https://x.com/").status).toBe("fail");
  });

  it("对比度低于 4.5:1 判不通过", () => {
    const low = auditUx({
      pages: [page({ styles: { color: "#999999", background: "#ffffff" } })],
    });
    expect(find(low, "ux-contrast", "https://x.com/").status).toBe("fail");

    const high = auditUx({
      pages: [page({ styles: { color: "#1f2933", background: "#ffffff" } })],
    });
    expect(find(high, "ux-contrast", "https://x.com/").status).toBe("pass");
  });

  it("对比度计算本身符合 WCAG 公式", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#ffffff")!).toBeLessThan(4.5);
  });
});

describe("样式表解析", () => {
  it("展开 CSS 变量后再取字号与颜色", () => {
    const css = `:root{--text-base:1rem;--color-text:var(--neutral-900);--color-bg:#ffffff;--neutral-900:#0f172a}
      body{font-size:var(--text-base);line-height:1.8;color:var(--color-text);background:var(--color-bg)}`;
    const facts = extractUxFacts("<html><body><p>正文</p></body></html>", "https://x.com/", css);
    expect(facts.styles?.fontSize).toBe(16);
    expect(facts.styles?.color).toBe("#0f172a");
    expect(facts.styles?.background).toBe("#ffffff");
    expect(facts.styles?.hasStylesheet).toBe(true);
  });

  it("样式表拿到了却没写 min-height —— 提醒而不是跳过", () => {
    const css = `body{font-size:16px}`;
    const facts = extractUxFacts("<html><body><p>正文</p></body></html>", "https://x.com/", css);
    const res = auditUx({ pages: [page({ styles: facts.styles })] });
    const c = find(res, "ux-touch-target", "https://x.com/");
    expect(c.status).toBe("warn");
    expect(c.fix).toContain("min-height");
  });

  it("完全拿不到样式表时跳过", () => {
    const facts = extractUxFacts("<html><body><p>正文</p></body></html>", "https://x.com/");
    expect(facts.styles).toBeUndefined();
    const res = auditUx({ pages: [page({ styles: facts.styles })] });
    expect(find(res, "ux-touch-target", "https://x.com/").status).toBe("skip");
  });
});

describe("HTML 事实抽取", () => {
  it("抽出导航、主 CTA、图片尺寸、必填字段与样式", () => {
    const html = `<!doctype html><html lang="zh-CN"><head>
      <title>示例科技</title>
      <meta name="description" content="示例科技的描述"/>
      <style>body { font-size: 16px; line-height: 1.8; color: #1f2933; background: #ffffff; }
      .btn { min-height: 48px; }</style>
      </head><body>
      <nav><a href="/">首页</a><a href="/products">产品</a></nav>
      <section class="hero">
        <h1>让工厂数据五分钟内全部上线</h1>
        <img src="/hero.webp" alt="示意图" width="640" height="480"/>
        <a class="btn btn-primary" href="/contact">获取报价</a>
        <a class="btn btn-outline" href="/demo">预约演示</a>
      </section>
      <form>
        <input name="company" required/>
        <input name="phone" required/>
        <input name="email" required/>
        <input name="note"/>
        <button type="submit">提交</button>
      </form>
      <footer><a href="/">首页</a><a href="/about">关于</a></footer>
      </body></html>`;

    const facts = extractUxFacts(html, "https://x.com/");
    expect(facts.h1s).toEqual(["让工厂数据五分钟内全部上线"]);
    expect(facts.navItems.map((n) => n.href)).toEqual(["/", "/products"]);
    // 次要 CTA 不算主 CTA
    expect(facts.heroPrimaryCtas).toHaveLength(1);
    expect(facts.heroImages[0].width).toBe(640);
    expect(facts.forms[0].required).toBe(3);
    expect(facts.forms[0].total).toBe(4);
    expect(facts.styles?.fontSize).toBe(16);
    expect(facts.styles?.minTouchTarget).toBe(48);
    expect(facts.footerLinkCount).toBe(2);
  });
});

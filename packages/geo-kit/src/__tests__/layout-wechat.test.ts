import { describe, expect, it } from "vitest";

import {
  layoutCss,
  densityCss,
  generateLayoutCss,
  layoutHtmlAttrs,
  LAYOUT_VARIANTS,
} from "../layout.js";
import {
  docToWechatHtml,
  docToWechatText,
  wechatArticleHtml,
  WECHAT_THEMES,
} from "../rich-text/wechat.js";
import { mergeAppearance, mergeModuleContent } from "../modules/generate.js";
import { generateThemeCss, themeHtmlAttrs } from "../theme.js";
import type { RichTextDoc } from "../rich-text/types.js";
import type { SiteContent } from "../types.js";

const doc: RichTextDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "三个支点" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "已服务 " },
        { type: "text", text: "180", marks: [{ type: "bold" }] },
        { type: "text", text: " 家企业客户" },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "私有化部署" }] }] },
      ],
    },
    { type: "blockquote", content: [{ type: "text", text: "合规优先" }] },
    { type: "codeBlock", content: [{ type: "text", text: "npm i wb" }] },
  ],
};

describe("布局变体", () => {
  it("每个变体都能生成 CSS", () => {
    for (const v of LAYOUT_VARIANTS) {
      const css = layoutCss(v);
      expect(css).toContain(`[data-layout="${v}"]`);
      expect(css.length).toBeGreaterThan(50);
    }
  });

  it("变体之间真的有差异 —— 不是只改个名字", () => {
    const csses = LAYOUT_VARIANTS.map((v) => layoutCss(v));
    // 每一套都要有自己的版心宽度
    for (const css of csses) {
      expect(css).toMatch(/--container-max:/);
    }
    // 四套两两不同
    expect(new Set(csses).size).toBe(LAYOUT_VARIANTS.length);
  });

  it("editorial 用衬线字体，bold 用超大标题", () => {
    expect(layoutCss("editorial")).toContain("--font-display");
    expect(layoutCss("bold")).toContain("4.5rem");
  });

  it("密度变体只影响紧凑度", () => {
    expect(densityCss("compact")).toContain("--section-padding");
    expect(densityCss("comfortable")).toBe("");
  });

  it("生成 CSS 与 html 属性都带上变体", () => {
    const css = generateLayoutCss({ layout: "bold", density: "compact" });
    expect(css).toContain('[data-layout="bold"]');
    expect(css).toContain('[data-density="compact"]');

    const attrs = layoutHtmlAttrs({ layout: "editorial", density: "compact" });
    expect(attrs["data-layout"]).toBe("editorial");
    expect(attrs["data-density"]).toBe("compact");
  });

  it("主题 CSS 包含布局层", () => {
    const css = generateThemeCss({ layout: "split" });
    expect(css).toContain('[data-layout="split"]');
  });

  it("html 属性同时带主题与布局", () => {
    const attrs = themeHtmlAttrs({
      variant: "forest",
      style: "classic",
      layout: "bold",
      density: "compact",
    });
    expect(attrs["data-theme"]).toBe("forest");
    expect(attrs["data-style"]).toBe("classic");
    expect(attrs["data-layout"]).toBe("bold");
    expect(attrs["data-density"]).toBe("compact");
  });
});

describe("外观合并：后台覆盖手写", () => {
  it("后台的非空项覆盖手写主题", () => {
    const merged = mergeAppearance(
      { layout: "centered", style: "modern", primaryColor: "#123456" },
      { layout: "bold" },
    );
    expect(merged.layout).toBe("bold");
    // 没指定的项保留手写的
    expect(merged.style).toBe("modern");
    expect(merged.primaryColor).toBe("#123456");
  });

  it("空值不算覆盖", () => {
    const merged = mergeAppearance({ layout: "centered" }, { layout: "", density: undefined });
    expect(merged.layout).toBe("centered");
    expect(merged.density).toBeUndefined();
  });

  it("合并进内容包时覆盖 theme", () => {
    const base = {
      siteId: "t",
      name: "T",
      description: "d",
      url: "https://e.com",
      locale: "zh-CN" as const,
      organization: { name: "T", address: { addressLocality: "x", addressCountry: "CN" } },
      sections: [],
      theme: { layout: "centered" as const, style: "modern" as const },
    } as SiteContent;

    const merged = mergeModuleContent(base, [], { layout: "editorial" });
    expect(merged.theme?.layout).toBe("editorial");
    expect(merged.theme?.style).toBe("modern");
    // 手写内容不动
    expect(merged.sections).toEqual(base.sections);
  });

  it("没有外观配置时不动 theme", () => {
    const base = {
      siteId: "t",
      name: "T",
      description: "d",
      url: "https://e.com",
      locale: "zh-CN" as const,
      organization: { name: "T", address: { addressLocality: "x", addressCountry: "CN" } },
      sections: [],
      theme: { layout: "centered" as const },
    } as SiteContent;
    const merged = mergeModuleContent(base, []);
    expect(merged.theme?.layout).toBe("centered");
  });
});

describe("公众号排版", () => {
  it("输出全是内联样式 —— 没有 class 与 style 标签", () => {
    const html = docToWechatHtml(doc, "green");
    expect(html).toContain("style=");
    expect(html).not.toContain("<style");
    expect(html).not.toMatch(/class="/);
  });

  it("内容一字不改", () => {
    const html = docToWechatHtml(doc, "default");
    expect(html).toContain("三个支点");
    expect(html).toContain("已服务 ");
    expect(html).toContain("180");
    expect(html).toContain("家企业客户");
    expect(html).toContain("私有化部署");
    expect(html).toContain("合规优先");
  });

  it("转义 HTML 特殊字符", () => {
    const html = docToWechatHtml(
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "<img src=x onerror=alert(1)>" }] },
        ],
      },
      "default",
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("加粗保留为语义标签", () => {
    const html = docToWechatHtml(doc, "default");
    expect(html).toContain("<strong");
    expect(html).toContain("font-weight:700");
  });

  it("每个主题都能生成且有差异", () => {
    const htmls = WECHAT_THEMES.map((t) => docToWechatHtml(doc, t));
    for (const h of htmls) expect(h.length).toBeGreaterThan(100);
    // 主题不同 → 颜色不同
    expect(new Set(htmls).size).toBe(WECHAT_THEMES.length);
  });

  it("微信绿主题用微信绿做强调色", () => {
    expect(docToWechatHtml(doc, "green")).toContain("#07c160");
  });

  it("纯文本导出丢掉样式", () => {
    const text = docToWechatText(doc);
    expect(text).toContain("三个支点");
    expect(text).toContain("私有化部署");
    expect(text).not.toContain("<");
  });

  it("文章包装带标题与作者", () => {
    const html = wechatArticleHtml(doc, { title: "合规数据交付", author: "云枢科技", theme: "blue" });
    expect(html).toContain("合规数据交付");
    expect(html).toContain("云枢科技");
    expect(html).toContain("<section");
  });

  it("链接只放行安全协议", () => {
    const html = docToWechatHtml(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "好", marks: [{ type: "link", attrs: { href: "https://a.com" } }] },
              { type: "text", text: "坏", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
            ],
          },
        ],
      },
      "default",
    );
    expect(html).toContain('href="https://a.com"');
    expect(html).not.toContain("javascript:");
  });
});

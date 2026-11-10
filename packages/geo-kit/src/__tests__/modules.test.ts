import { describe, expect, it } from "vitest";

import {
  materializeModulePlan,
  modulePlanStats,
  validateModulePlan,
  isValidPath,
  normalizePath,
  textToDoc,
  emptyModulePlan,
  type ModulePlan,
} from "../index.js";
import { docToParagraphs, docToPlainText, readingMinutes } from "../rich-text/convert.js";
import { docToHtml, docToMarkdown } from "../rich-text/render.js";
import { isDocEmpty } from "../rich-text/types.js";
import type { KnowledgeItem } from "../sync/knowledge-sync.js";

const kbItem: KnowledgeItem = {
  id: "kb1",
  kb_id: "default",
  title: "私有化部署说明",
  content: "支持私有化部署。\n- 8C32G 规格\n- 离线安装包",
  summary: "私有化部署要点",
  tags: ["部署"],
  updated_at: "2026-11-01T00:00:00Z",
};

const items = new Map<string, KnowledgeItem>([[kbItem.id, kbItem]]);

/** 造一份编排 */
function plan(pages: ModulePlan["pages"]): ModulePlan {
  return { ...emptyModulePlan("demo"), pages };
}

describe("富文本：段落降级", () => {
  it("段落与列表各自成段", () => {
    const doc = {
      type: "doc" as const,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "第一段" }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "甲" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "乙" }] }] },
          ],
        },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "小标题" }] },
      ],
    };
    const paras = docToParagraphs(doc);
    expect(paras).toHaveLength(3);
    expect(paras[1]).toBe("- 甲\n- 乙");
    expect(paras[2]).toBe("小标题");
  });

  it("空文档判定", () => {
    expect(isDocEmpty(undefined)).toBe(true);
    expect(isDocEmpty({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
    expect(
      isDocEmpty({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "有字" }] }],
      }),
    ).toBe(false);
  });

  it("阅读时长至少 1 分钟", () => {
    expect(readingMinutes({ type: "doc", content: [{ type: "paragraph" }] })).toBe(1);
  });
});

describe("富文本：HTML 输出必须转义", () => {
  it("文本里的尖括号被转义", () => {
    const html = docToHtml({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
      ],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("只放行白名单 mark", () => {
    const html = docToHtml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "粗",
              marks: [{ type: "bold" }],
            },
            {
              type: "text",
              text: "邪",
              marks: [{ type: "color" }],
            },
          ],
        },
      ],
    });
    expect(html).toContain("<strong>粗</strong>");
    expect(html).toContain("邪");
    expect(html).not.toContain("font");
  });

  it("link 只放行安全协议", () => {
    const html = docToHtml({
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
    });
    expect(html).toContain('href="https://a.com"');
    expect(html).not.toContain("javascript:");
  });
});

describe("富文本：Markdown 降级", () => {
  it("标题与列表转 markdown", () => {
    const md = docToMarkdown({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "标题" }] },
        {
          type: "orderedList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "一" }] }] },
          ],
        },
      ],
    });
    expect(md).toContain("### 标题");
    expect(md).toContain("1. 一");
  });
});

describe("模块编排：物化", () => {
  it("知识库来源取原文物化成条目", () => {
    const p = plan([
      {
        id: "pg1",
        path: "/about",
        title: "关于",
        description: "关于我们",
        order: 0,
        published: true,
        modules: [
          {
            id: "m1",
            type: "rich-text",
            title: "正文",
            order: 0,
            enabled: true,
            items: [
              { id: "i1", source: "kb", kbItemId: "kb1", order: 0, published: true },
            ],
          },
        ],
      },
    ]);

    const { pages } = materializeModulePlan(p, items);
    const item = pages[0].modules[0].items[0];
    expect(item.source).toBe("kb");
    expect(item.title).toBe("私有化部署说明");
    expect(item.paragraphs.length).toBeGreaterThan(0);
    expect(item.paragraphs.join("\n")).toContain("8C32G");
  });

  it("草稿条目与停用模块被剔除", () => {
    const p = plan([
      {
        id: "pg1",
        path: "/x",
        title: "X",
        order: 0,
        published: true,
        modules: [
          {
            id: "m1",
            type: "rich-text",
            order: 0,
            enabled: true,
            items: [
              { id: "i1", source: "manual", title: "已发", order: 0, published: true },
              { id: "i2", source: "manual", title: "草稿", order: 1, published: false },
            ],
          },
          { id: "m2", type: "rich-text", order: 1, enabled: false, items: [] },
        ],
      },
    ]);
    const { pages } = materializeModulePlan(p, items);
    expect(pages[0].modules).toHaveLength(1);
    expect(pages[0].modules[0].items).toHaveLength(1);
  });

  it("未发布页面被剔除", () => {
    const p = plan([
      {
        id: "pg1",
        path: "/x",
        title: "X",
        order: 0,
        published: false,
        modules: [],
      },
    ]);
    expect(materializeModulePlan(p, items).pages).toHaveLength(0);
  });

  it("知识库条目已删除时记入 skipped", () => {
    const p = plan([
      {
        id: "pg1",
        path: "/x",
        title: "X",
        order: 0,
        published: true,
        modules: [
          {
            id: "m1",
            type: "rich-text",
            order: 0,
            enabled: true,
            items: [
              { id: "i1", source: "kb", kbItemId: "gone", order: 0, published: true },
            ],
          },
        ],
      },
    ]);
    const { skipped } = materializeModulePlan(p, items);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toContain("知识库");
  });

  it("手工条目的富文本正文被保留", () => {
    const p = plan([
      {
        id: "pg1",
        path: "/x",
        title: "X",
        order: 0,
        published: true,
        modules: [
          {
            id: "m1",
            type: "rich-text",
            order: 0,
            enabled: true,
            items: [
              {
                id: "i1",
                source: "manual",
                title: "手写",
                order: 0,
                published: true,
                body: {
                  type: "doc",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "我写的" }] }],
                },
              },
            ],
          },
        ],
      },
    ]);
    const { pages } = materializeModulePlan(p, items);
    expect(pages[0].modules[0].items[0].paragraphs).toEqual(["我写的"]);
  });
});

describe("模块编排：校验", () => {
  const base = {
    id: "pg1",
    path: "/x",
    title: "X",
    description: "描述",
    order: 0,
    published: true,
  };

  it("案例缺客户名与量化结果被拦", () => {
    const p = plan([
      {
        ...base,
        modules: [
          {
            id: "m1",
            type: "card-grid",
            props: { kind: "cases" },
            order: 0,
            enabled: true,
            items: [
              { id: "i1", source: "manual", title: "案例", order: 0, published: true },
            ],
          },
        ],
      },
    ]);
    const problems = validateModulePlan(p, items);
    const msgs = problems.map((x) => x.message).join(" ");
    expect(msgs).toContain("客户名");
    expect(msgs).toContain("量化结果");
  });

  it("FAQ 标题必须是问句", () => {
    const p = plan([
      {
        ...base,
        modules: [
          {
            id: "m1",
            type: "faq",
            order: 0,
            enabled: true,
            items: [
              {
                id: "i1",
                source: "manual",
                question: "这是陈述",
                answer: "答",
                order: 0,
                published: true,
              },
            ],
          },
        ],
      },
    ]);
    const problems = validateModulePlan(p, items);
    expect(problems.map((x) => x.message).join(" ")).toContain("问句");
  });

  it("数据条缺数值被拦，但不算正文空", () => {
    const p = plan([
      {
        ...base,
        modules: [
          {
            id: "m1",
            type: "stats",
            order: 0,
            enabled: true,
            items: [{ id: "i1", source: "manual", label: "客户", order: 0, published: true }],
          },
        ],
      },
    ]);
    const problems = validateModulePlan(p, items);
    const msgs = problems.map((x) => x.message).join(" ");
    expect(msgs).toContain("数值");
    // 数据条没有正文是正常的 —— 不该报「正文为空」
    expect(msgs).not.toContain("正文为空");
  });

  it("知识库条目已删除被拦", () => {
    const p = plan([
      {
        ...base,
        modules: [
          {
            id: "m1",
            type: "rich-text",
            order: 0,
            enabled: true,
            items: [
              { id: "i1", source: "kb", kbItemId: "gone", order: 0, published: true },
            ],
          },
        ],
      },
    ]);
    expect(validateModulePlan(p, items).map((x) => x.message).join(" ")).toContain("找不到");
  });

  it("草稿条目不参与校验", () => {
    const p = plan([
      {
        ...base,
        modules: [
          {
            id: "m1",
            type: "card-grid",
            props: { kind: "cases" },
            order: 0,
            enabled: true,
            items: [
              { id: "i1", source: "manual", title: "草稿案例", order: 0, published: false },
            ],
          },
        ],
      },
    ]);
    expect(validateModulePlan(p, items)).toHaveLength(0);
  });

  it("路由路径重复被拦", () => {
    const p = plan([
      { ...base, id: "a", path: "/dup" },
      { ...base, id: "b", path: "/dup" },
    ]);
    expect(validateModulePlan(p, items).map((x) => x.message).join(" ")).toContain("重复");
  });
});

describe("模块编排：路径与统计", () => {
  it("路径规范化", () => {
    expect(normalizePath("about")).toBe("/about");
    expect(normalizePath("/about/")).toBe("/about");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("")).toBe("/");
  });

  it("非法路径被拒（防目录穿越）", () => {
    expect(isValidPath("/about")).toBe(true);
    expect(isValidPath("/a/b/c")).toBe(true);
    expect(isValidPath("/../etc/passwd")).toBe(false);
    expect(isValidPath("/a/../b")).toBe(false);
  });

  it("统计区分来源与发布状态", () => {
    const p = plan([
      {
        id: "pg1",
        path: "/x",
        title: "X",
        order: 0,
        published: true,
        modules: [
          {
            id: "m1",
            type: "rich-text",
            order: 0,
            enabled: true,
            items: [
              { id: "i1", source: "kb", kbItemId: "kb1", order: 0, published: true },
              { id: "i2", source: "manual", title: "手写", order: 1, published: false },
            ],
          },
        ],
      },
    ]);
    const s = modulePlanStats(p);
    expect(s.pages).toBe(1);
    expect(s.modules).toBe(1);
    expect(s.items).toBe(2);
    expect(s.publishedItems).toBe(1);
    expect(s.kbItems).toBe(1);
    expect(s.manualItems).toBe(1);
  });
});

describe("纯文本转富文本", () => {
  it("知识库正文转成段落与列表", () => {
    const doc = textToDoc("第一段。\n- 甲\n- 乙");
    expect(doc.content[0].type).toBe("paragraph");
    expect(doc.content[1].type).toBe("bulletList");
    expect(docToPlainText(doc)).toContain("甲");
  });
});

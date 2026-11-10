import { describe, expect, it } from "vitest";

import {
  syncKnowledgeBase,
  structureContent,
  deriveSummary,
  toArticleId,
  renderKnowledgeModule,
  applyKnowledgeArticles,
  type KnowledgeItem,
} from "../sync/knowledge-sync.js";
import { MemoryKnowledgeSource } from "../sync/source.js";
import type { SiteContent } from "../types.js";

const kb = { id: "kb-1", name: "测试知识库", item_count: 3 };

function item(over: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id: "6489f9f0-a0d4-402c-bce3-59c20054f33d",
    kb_id: "kb-1",
    title: "现代文-赏析 答题方法",
    content: "题型：现代文-赏析\n【得分点】\n- 手法/技巧：修辞、描写方法\n- 表达效果：把手法落到具体内容上",
    summary: "赏析题答题方法",
    sync_status: "pulled",
    source_type: "weknora_webhook",
    updated_at: "2026-11-09T10:00:00.000Z",
    ...over,
  };
}

describe("正文结构化", () => {
  it("识别列表项", () => {
    const r = structureContent("标题\n- 甲\n- 乙\n- 丙");
    expect(r.lists).toHaveLength(1);
    expect(r.lists[0]).toEqual(["甲", "乙", "丙"]);
  });

  it("识别标签行", () => {
    const r = structureContent("题型：现代文-赏析\n【得分点】");
    expect(r.paragraphs).toContain("题型：现代文-赏析");
    expect(r.paragraphs).toContain("【得分点】");
  });

  it("普通行是段落", () => {
    const r = structureContent("这是一段正文。");
    expect(r.paragraphs).toEqual(["这是一段正文。"]);
  });
});

describe("摘要生成", () => {
  it("优先用条目自带 summary", () => {
    expect(deriveSummary(item({ summary: "已有摘要" }))).toBe("已有摘要");
  });

  it("没有 summary 时从正文提取", () => {
    const s = deriveSummary(item({ summary: undefined }));
    expect(s.length).toBeGreaterThan(0);
    expect(s).not.toContain("题型：");
  });

  it("超长摘要被截断", () => {
    const s = deriveSummary(item({ summary: "长".repeat(300) }));
    expect(s.length).toBeLessThanOrEqual(160);
  });
});

describe("文章 id", () => {
  it("稳定且含库标识", () => {
    const a = toArticleId(item(), "kb-1");
    const b = toArticleId(item(), "kb-1");
    expect(a).toBe(b);
    expect(a.startsWith("kb1")).toBe(true);
  });

  it("不同库不撞 id", () => {
    expect(toArticleId(item(), "kb-1")).not.toBe(toArticleId(item(), "kb-2"));
  });

  it("支持前缀", () => {
    expect(toArticleId(item(), "kb-1", "p")).toMatch(/^p-/);
  });
});

describe("同步核心", () => {
  it("采用正常状态的条目", () => {
    const r = syncKnowledgeBase(kb, [item()]);
    expect(r.stats.included).toBe(1);
    expect(r.insights[0].title).toBe("现代文-赏析 答题方法");
  });

  it("排除 conflict 状态", () => {
    const r = syncKnowledgeBase(kb, [item({ sync_status: "conflict" })]);
    expect(r.stats.included).toBe(0);
    expect(r.skipped[0].reason).toContain("conflict");
  });

  it("排除 sync_failed", () => {
    const r = syncKnowledgeBase(kb, [item({ sync_status: "sync_failed" })]);
    expect(r.stats.included).toBe(0);
  });

  it("排除空正文", () => {
    const r = syncKnowledgeBase(kb, [item({ content: "   " })]);
    expect(r.stats.included).toBe(0);
    expect(r.skipped[0].reason).toContain("正文为空");
  });

  it("同名条目去重", () => {
    const r = syncKnowledgeBase(kb, [
      item({ id: "a1" }),
      item({ id: "a2", content: "不同正文" }),
    ]);
    expect(r.stats.included).toBe(1);
    expect(r.stats.deduped).toBe(1);
  });

  it("标题过滤生效", () => {
    const r = syncKnowledgeBase(kb, [item()], { titlePattern: "不匹配" });
    expect(r.stats.included).toBe(0);
    expect(r.skipped[0].reason).toContain("标题不匹配");
  });

  it("标签过滤生效", () => {
    const r = syncKnowledgeBase(kb, [item({ tags: ["部署"] })], {
      includeTags: ["合规"],
    });
    expect(r.stats.included).toBe(0);
  });

  it("超长正文被截断", () => {
    const r = syncKnowledgeBase(kb, [item({ content: "长".repeat(20000) })], {
      maxContentLength: 100,
    });
    expect(r.insights[0].body.join("").length).toBeLessThanOrEqual(200);
  });

  it("日期从 updated_at 取前 10 位", () => {
    const r = syncKnowledgeBase(kb, [item()]);
    expect(r.insights[0].date).toBe("2026-11-09");
  });
});

describe("知识文章模块", () => {
  it("产出可导入的 TS 模块", () => {
    const r = syncKnowledgeBase(kb, [item()]);
    const mod = renderKnowledgeModule(r, "2026-11-09T12:00:00Z");
    expect(mod).toContain("export const knowledgeInsights");
    expect(mod).toContain("现代文-赏析 答题方法");
    expect(mod).toContain("测试知识库");
  });
});

describe("合并进内容包", () => {
  const content: SiteContent = {
    siteId: "t",
    name: "测试",
    description: "d",
    url: "https://x.com",
    locale: "zh-CN",
    organization: { name: "测试" },
    sections: [
      { id: "ins", type: "insights", title: "洞察", body: ["原提示语"] },
    ],
    insights: [{ id: "manual", title: "手写文章" }],
  };

  it("知识文章在前，手写文章保留", () => {
    const r = syncKnowledgeBase(kb, [item()]);
    const merged = applyKnowledgeArticles(content, r.insights);
    expect(merged.insights?.[0].title).toBe("现代文-赏析 答题方法");
    expect(merged.insights?.some((i) => i.id === "manual")).toBe(true);
  });

  it("replace 模式丢弃手写文章", () => {
    const r = syncKnowledgeBase(kb, [item()]);
    const merged = applyKnowledgeArticles(content, r.insights, { replace: true });
    expect(merged.insights?.some((i) => i.id === "manual")).toBe(false);
  });

  it("同步不修改原内容包（关键：手写内容必须安全）", () => {
    const before = JSON.stringify(content);
    const r = syncKnowledgeBase(kb, [item()]);
    applyKnowledgeArticles(content, r.insights);
    expect(JSON.stringify(content)).toBe(before);
  });
});

describe("内存数据源", () => {
  it("按库返回条目", async () => {
    const src = new MemoryKnowledgeSource(
      [{ id: "kb-1", name: "k" }],
      new Map([["kb-1", [item()]]]),
    );
    expect((await src.listBases()).length).toBe(1);
    expect((await src.listItems("kb-1")).length).toBe(1);
    expect((await src.listItems("nope")).length).toBe(0);
  });
});

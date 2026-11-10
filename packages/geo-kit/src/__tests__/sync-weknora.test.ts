import { describe, expect, it, vi } from "vitest";

import {
  WeKnoraKnowledgeSource,
  groupHitsToItems,
  type FetchLike,
} from "../sync/source.js";
import { runSync } from "../sync/cli.js";

/**
 * WeKnora 版知识源的单测。
 *
 * 全部用假 fetch —— **不打网络**。
 */

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

interface FakeReply {
  status?: number;
  body: unknown;
}

/** 造一个假 fetch：按 url 关键字匹配返回 */
function fakeFetch(replies: Array<{ match: string; reply: FakeReply }>): {
  impl: FetchLike;
  calls: Call[];
} {
  const calls: Call[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
    const hit = replies.find((r) => url.includes(r.match));
    if (!hit) {
      return {
        ok: false,
        status: 404,
        text: async () => "no fake reply",
      };
    }
    const status = hit.reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(hit.reply.body),
    };
  };
  return { impl, calls };
}

const KB_LIST = {
  success: true,
  data: [
    {
      id: "kb-1",
      name: "企业知识库",
      description: "主库",
      type: "document",
      knowledge_count: 12,
    },
    { id: "kb-2", name: "其他库", type: "faq" },
  ],
};

const SEARCH_OK = {
  success: true,
  data: [
    {
      id: "chunk-a1",
      knowledge_id: "know-1",
      knowledge_title: "部署说明",
      content: "第一段正文",
      chunk_index: 0,
      start_at: 0,
      score: 0.91,
      // 契约禁忌 5：metadata 塞了整段 chunk 配置，单条 19KB+
      metadata: { chunk_config: "x".repeat(19_000) },
    },
    {
      id: "chunk-a2",
      knowledge_id: "know-1",
      knowledge_title: "部署说明",
      content: "第二段正文",
      chunk_index: 1,
      start_at: 100,
      score: 0.88,
      metadata: { chunk_config: "y".repeat(19_000) },
    },
    {
      id: "chunk-b1",
      knowledge_id: "know-2",
      knowledge_title: "合规白皮书",
      knowledge_description: "一份合规说明",
      content: "白皮书正文",
      chunk_index: 0,
      score: 0.75,
      metadata: { chunk_config: "z".repeat(19_000) },
    },
  ],
};

function sourceWith(
  replies: Array<{ match: string; reply: FakeReply }>,
  overrides: Partial<ConstructorParameters<typeof WeKnoraKnowledgeSource>[0]> = {},
) {
  const { impl, calls } = fakeFetch(replies);
  const src = new WeKnoraKnowledgeSource({
    baseUrl: "http://weknora.test:3016",
    apiKey: "sk-test",
    fetchImpl: impl,
    ...overrides,
  });
  return { src, calls };
}

describe("WeKnora 数据源 —— 列库", () => {
  it("解析 data 包装并映射字段", async () => {
    const { src } = sourceWith([{ match: "/knowledge-bases", reply: { body: KB_LIST } }]);
    const bases = await src.listBases();
    expect(bases).toHaveLength(2);
    expect(bases[0]).toEqual({
      id: "kb-1",
      name: "企业知识库",
      description: "主库",
      kb_type: "document",
      item_count: 12,
    });
  });

  it("缺字段时不崩（name 退回 id，count 退回 0）", async () => {
    const { src } = sourceWith([
      { match: "/knowledge-bases", reply: { body: { success: true, data: [{ id: "kb-x" }] } } },
    ]);
    const bases = await src.listBases();
    expect(bases[0].name).toBe("kb-x");
    expect(bases[0].item_count).toBe(0);
  });

  it("用 X-API-Key 认证，不带 Bearer", async () => {
    const { src, calls } = sourceWith([
      { match: "/knowledge-bases", reply: { body: KB_LIST } },
    ]);
    await src.listBases();
    expect(calls[0].headers["X-API-Key"]).toBe("sk-test");
    expect(calls[0].headers["Authorization"]).toBeUndefined();
    expect(calls[0].method).toBe("GET");
  });

  it("客户端 KB 白名单外的库不返回", async () => {
    const { src } = sourceWith(
      [{ match: "/knowledge-bases", reply: { body: KB_LIST } }],
      { knowledgeBaseIds: ["kb-1"] },
    );
    const bases = await src.listBases();
    expect(bases.map((b) => b.id)).toEqual(["kb-1"]);
  });

  it("服务端报 success:false 时抛错", async () => {
    const { src } = sourceWith([
      {
        match: "/knowledge-bases",
        reply: { body: { success: false, message: "unauthorized" } },
      },
    ]);
    await expect(src.listBases()).rejects.toThrow(/unauthorized/);
  });
});

describe("WeKnora 数据源 —— 检索取条目", () => {
  it("正常返回映射为知识条目", async () => {
    const { src } = sourceWith([
      { match: "/knowledge-search", reply: { body: SEARCH_OK } },
    ]);
    const items = await src.listItems("kb-1");
    expect(items).toHaveLength(2);
    const first = items[0];
    expect(first?.id).toBe("know-1");
    expect(first?.kb_id).toBe("kb-1");
    expect(first?.title).toBe("部署说明");
    expect(first?.content).toBe("第一段正文\n\n第二段正文");
    expect(first?.source_type).toBe("weknora");
  });

  it("同一知识条目的多个 chunk 合并成一条", async () => {
    const { src } = sourceWith([
      { match: "/knowledge-search", reply: { body: SEARCH_OK } },
    ]);
    const items = await src.listItems("kb-1");
    expect(items.filter((i) => i.id === "know-1")).toHaveLength(1);
    expect(items.map((i) => i.id)).toEqual(["know-1", "know-2"]);
  });

  it("knowledge_description 映射为 summary", async () => {
    const { src } = sourceWith([
      { match: "/knowledge-search", reply: { body: SEARCH_OK } },
    ]);
    const items = await src.listItems("kb-1");
    expect(items.find((i) => i.id === "know-2")?.summary).toBe("一份合规说明");
  });

  it("解析 results 包装（旧版形态）", async () => {
    const { src } = sourceWith([
      {
        match: "/knowledge-search",
        reply: { body: { results: SEARCH_OK.data } },
      },
    ]);
    const items = await src.listItems("kb-1");
    expect(items).toHaveLength(2);
  });

  it("大响应只取必要字段 —— 不把 19KB metadata 带下来", async () => {
    const { src } = sourceWith([
      { match: "/knowledge-search", reply: { body: SEARCH_OK } },
    ]);
    const items = await src.listItems("kb-1");
    for (const item of items) {
      const meta = JSON.stringify(item.metadata ?? {});
      expect(meta.length).toBeLessThan(200);
      expect(meta).not.toContain("chunk_config");
    }
    // content 里也不该混入 metadata
    expect(items[0]?.content).not.toContain("chunk_config");
  });

  it("KB 白名单传参正确：knowledge_base_ids 复数、只含当前库", async () => {
    const { src, calls } = sourceWith(
      [{ match: "/knowledge-search", reply: { body: SEARCH_OK } }],
      { knowledgeBaseIds: ["kb-1", "kb-2"] },
    );
    await src.listItems("kb-1");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.knowledge_base_ids).toEqual(["kb-1"]);
    // 契约禁忌 1：单数字段会被服务端忽略 → 403
    expect(body.knowledge_base_id).toBeUndefined();
    // 契约禁忌 2：受限 key 传 knowledge_ids 一律 403
    expect(body.knowledge_ids).toBeUndefined();
    expect(body.match_count).toBeGreaterThan(0);
    expect(typeof body.query).toBe("string");
    expect(body.query.length).toBeGreaterThan(0);
  });

  it("白名单外的库明确报错，不发请求（不撞服务端 403）", async () => {
    const { src, calls } = sourceWith(
      [{ match: "/knowledge-search", reply: { body: SEARCH_OK } }],
      { knowledgeBaseIds: ["kb-1"] },
    );
    await expect(src.listItems("kb-9")).rejects.toThrow(/不在允许同步的范围/);
    expect(calls).toHaveLength(0);
  });

  it("可用调用方传入的 query 覆盖默认检索词", async () => {
    const { src, calls } = sourceWith([
      { match: "/knowledge-search", reply: { body: SEARCH_OK } },
    ]);
    await src.listItems("kb-1", "部署 步骤");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.query).toBe("部署 步骤");
  });

  it("matchCount 越界直接报错（服务端上限 200）", () => {
    expect(
      () =>
        new WeKnoraKnowledgeSource({
          baseUrl: "http://x",
          apiKey: "k",
          matchCount: 500,
        }),
    ).toThrow(/matchCount/);
  });

  it("缺 baseUrl / apiKey 直接报错", () => {
    expect(
      () => new WeKnoraKnowledgeSource({ baseUrl: "", apiKey: "k" }),
    ).toThrow(/baseUrl/);
    expect(
      () => new WeKnoraKnowledgeSource({ baseUrl: "http://x", apiKey: "" }),
    ).toThrow(/apiKey/);
  });
});

describe("WeKnora 数据源 —— 错误与超时", () => {
  it("HTTP 错误带上状态码与响应片段", async () => {
    const { src } = sourceWith([
      {
        match: "/knowledge-search",
        reply: { status: 403, body: { success: false, message: "scope does not allow" } },
      },
    ]);
    await expect(src.listItems("kb-1")).rejects.toThrow(/403/);
  });

  it("响应不是 JSON 时报错", async () => {
    const impl: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => "<html>not json</html>",
    });
    const src = new WeKnoraKnowledgeSource({
      baseUrl: "http://x",
      apiKey: "k",
      fetchImpl: impl,
    });
    await expect(src.listItems("kb-1")).rejects.toThrow(/JSON/);
  });

  it("超时抛超时错误（默认预算 120s 量级）", async () => {
    const impl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    const src = new WeKnoraKnowledgeSource({
      baseUrl: "http://x",
      apiKey: "k",
      timeoutMs: 20,
      fetchImpl: impl,
    });
    await expect(src.listItems("kb-1")).rejects.toThrow(/超时/);
  });

  it("默认超时预算是 120s 量级（rerank 慢）", () => {
    const src = new WeKnoraKnowledgeSource({
      baseUrl: "http://x",
      apiKey: "k",
    });
    // 用一个必然超时的假 fetch 探一下默认预算：timeoutMs 默认 120_000
    expect((src as unknown as { timeoutMs: number }).timeoutMs).toBe(120_000);
  });
});

describe("命中聚合（纯函数）", () => {
  it("空命中返回空数组", () => {
    expect(groupHitsToItems([], "kb-1")).toEqual([]);
  });

  it("空正文的命中被丢弃", () => {
    const items = groupHitsToItems(
      [{ knowledge_id: "k1", knowledge_title: "t", content: "   " }],
      "kb-1",
    );
    expect(items).toEqual([]);
  });

  it("chunk 按 index 排序拼接", () => {
    const items = groupHitsToItems(
      [
        { knowledge_id: "k1", content: "b", chunk_index: 1 },
        { knowledge_id: "k1", content: "a", chunk_index: 0 },
      ],
      "kb-1",
    );
    expect(items[0]?.content).toBe("a\n\nb");
  });

  it("knowledge_id 缺失时退化用 chunk id", () => {
    const items = groupHitsToItems([{ id: "chunk-1", content: "x" }], "kb-1");
    expect(items[0]?.id).toBe("chunk-1");
  });

  it("保留最高分作为 metadata.score", () => {
    const items = groupHitsToItems(
      [
        { knowledge_id: "k1", content: "a", score: 0.4 },
        { knowledge_id: "k1", content: "b", score: 0.9 },
      ],
      "kb-1",
    );
    expect(items[0]?.metadata?.score).toBe(0.9);
  });
});

describe("同步编排 —— WeKnora 源", () => {
  it("产出知识文章模块（不覆盖内容包）", async () => {
    const { impl } = fakeFetch([
      { match: "/knowledge-bases", reply: { body: KB_LIST } },
      { match: "/knowledge-search", reply: { body: SEARCH_OK } },
    ]);
    const { result, module } = await runSync({
      kbId: "kb-1",
      weknora: {
        baseUrl: "http://weknora.test:3016",
        apiKey: "sk-test",
        fetchImpl: impl,
      },
    });
    expect(result.stats.total).toBe(2);
    expect(result.insights.map((i) => i.title)).toEqual([
      "部署说明",
      "合规白皮书",
    ]);
    expect(module).toContain("export const knowledgeInsights");
  });

  it("不给 --kb 且只有一个可见库时用它", async () => {
    const { impl } = fakeFetch([
      {
        match: "/knowledge-bases",
        reply: { body: { success: true, data: [KB_LIST.data[0]] } },
      },
      { match: "/knowledge-search", reply: { body: SEARCH_OK } },
    ]);
    const { result } = await runSync({
      weknora: {
        baseUrl: "http://weknora.test:3016",
        apiKey: "sk-test",
        fetchImpl: impl,
      },
    });
    expect(result.kbId).toBe("kb-1");
  });

  it("不给 --kb 且有多个可见库时报错（不猜）", async () => {
    const { impl } = fakeFetch([
      { match: "/knowledge-bases", reply: { body: KB_LIST } },
    ]);
    await expect(
      runSync({
        weknora: {
          baseUrl: "http://weknora.test:3016",
          apiKey: "sk-test",
          fetchImpl: impl,
        },
      }),
    ).rejects.toThrow(/--kb/);
  });

  it("没配数据源时明确报错", async () => {
    await expect(runSync({})).rejects.toThrow(/数据源/);
  });
});

describe("现有 PG 实现不被破坏", () => {
  it("Postgres 源仍走 listBases/listItems", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const end = vi.fn(async () => {});
    const src = new (await import("../sync/source.js")).PostgresKnowledgeSource({
      connectionString: "postgres://x/y",
      createClient: async () => ({ query, end }) as never,
    });
    await src.listBases();
    await src.listItems("kb-1");
    expect(query).toHaveBeenCalledTimes(2);
    expect(src.kind).toBe("postgres");
    await src.close();
    expect(end).toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  validateInquiry,
  toCrmLead,
  submitInquiry,
} from "../integrations/crm.js";
import {
  buildMcpTools,
  handleMcpRequest,
  callReadTool,
  exportMcpManifest,
} from "../integrations/mcp.js";
import type { SiteContent } from "../types.js";

const content: SiteContent = {
  siteId: "t",
  name: "示例科技",
  description: "工业物联网设备制造商。",
  url: "https://example.com",
  locale: "zh-CN",
  organization: {
    name: "示例科技",
    legalName: "示例科技股份有限公司",
    url: "https://example.com",
    description: "专注工业物联网设备研发与制造。",
    foundingDate: "2015-06-18",
    numberOfEmployees: "51-200",
  },
  contact: { telephone: "021-50000000", email: "sales@example.com" },
  sections: [
    {
      id: "home",
      type: "home",
      title: "工业物联网方案",
      subtitle: "已服务 320 家制造企业。",
      body: ["我们提供 12 款工业采集设备。"],
    },
    {
      id: "faq",
      type: "faq",
      title: "常见问题",
      faq: [{ question: "最小起订量是多少？", answer: "最小起订量为 10 台。" }],
    },
    {
      id: "contact",
      type: "contact",
      title: "联系我们",
      subtitle: "填写需求后我们会在 1 个工作日内回复。",
    },
  ],
  products: [
    {
      id: "eg-200",
      name: "EG-200 边缘网关",
      summary: "支持三线协议接入，单机可并发采集 48000 个数据点。",
      specs: [{ name: "并发采集数据点", value: "48000" }],
    },
  ],
  cases: [
    { id: "c1", title: "产线联网改造", client: "某 Tier 1", results: ["完整率从 71% 提升至 99.2%"] },
  ],
  insights: [{ id: "a1", title: "协议选型的 5 个误区", summary: "68 个项目复盘。" }],
};

describe("询盘校验", () => {
  it("必填缺失时报错", () => {
    const v = validateInquiry({});
    expect(v.ok).toBe(false);
    expect(v.errors.length).toBeGreaterThan(3);
  });

  it("电话与邮箱至少一项", () => {
    const v = validateInquiry({ name: "张", company: "A", message: "想了解产品" });
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain("电话与邮箱");
  });

  it("邮箱格式校验", () => {
    const v = validateInquiry({ name: "张", company: "A", message: "咨询", email: "bad@" });
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain("邮箱格式");
  });

  it("电话格式校验", () => {
    const v = validateInquiry({ name: "张", company: "A", message: "咨询", phone: "abc" });
    expect(v.ok).toBe(false);
  });

  it("完整询盘通过", () => {
    const v = validateInquiry({
      name: "张工",
      company: "某制造公司",
      phone: "13800138000",
      email: "zhang@example.com",
      message: "需要 20 台采集器",
    });
    expect(v.ok).toBe(true);
  });
});

describe("CRM 线索转换", () => {
  it("转成 CRM 的 GEO Lead 契约", () => {
    const body = toCrmLead(
      {
        name: "张工",
        company: "某制造公司",
        phone: "13800138000",
        email: "zhang@example.com",
        message: "需要 20 台采集器",
        sourceUrl: "https://example.com/contact",
        siteId: "demo",
      },
      { brand: "示例科技" },
    );
    expect(body.source).toBe("website_building");
    expect(body.brand).toBe("示例科技");
    expect(body.contact).toBe("zhang@example.com");
    expect(body.contact_type).toBe("email");
    expect(body.event).toBe("website_inquiry");
    expect((body.metadata as Record<string, unknown>).company).toBe("某制造公司");
  });

  it("无邮箱时用电话作为 contact", () => {
    const body = toCrmLead(
      { name: "张", company: "A", phone: "13800138000", message: "咨询" },
      { brand: "X" },
    );
    expect(body.contact).toBe("13800138000");
    expect(body.contact_type).toBe("phone");
  });
});

describe("询盘提交", () => {
  const valid = {
    name: "张工",
    company: "某制造公司",
    phone: "13800138000",
    email: "zhang@example.com",
    message: "需要 20 台采集器",
  };

  it("成功提交返回线索 id", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ lead_id: "L-123", is_new: true }), { status: 200 }),
    );
    const r = await submitInquiry(valid, { baseUrl: "http://crm.local", brand: "示例科技" }, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.ok).toBe(true);
    expect(r.leadId).toBe("L-123");
    expect(r.isNew).toBe(true);
    expect(r.attempts).toBe(1);
  });

  it("带 X-API-Key 头", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await submitInquiry(valid, { baseUrl: "http://crm.local", brand: "X", apiKey: "k-1" }, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("k-1");
  });

  it("4xx 不重试（客户端错误重试无意义）", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad request", { status: 400 }));
    const r = await submitInquiry(valid, { baseUrl: "http://crm.local", brand: "X" }, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(1);
    expect(r.error).toContain("400");
  });

  it("5xx 会重试并最终成功", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls < 3) return new Response("err", { status: 503 });
      return new Response(JSON.stringify({ lead_id: "L-9" }), { status: 200 });
    });
    const r = await submitInquiry(valid, { baseUrl: "http://crm.local", brand: "X" }, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(r.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("全部失败时返回错误与尝试次数", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const r = await submitInquiry(valid, { baseUrl: "http://crm.local", brand: "X", maxRetries: 2 }, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(2);
  });

  it("校验失败不发起请求", async () => {
    const fetchImpl = vi.fn();
    const r = await submitInquiry({ name: "" }, { baseUrl: "http://crm.local", brand: "X" }, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("MCP 工具清单", () => {
  const tools = buildMcpTools(content);

  it("覆盖内容/产品/案例/文章/FAQ/询盘", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("content.home.home");
    expect(names).toContain("product.lookup");
    expect(names).toContain("case.lookup");
    expect(names).toContain("insight.lookup");
    expect(names).toContain("faq.query");
    expect(names).toContain("inquiry.submit");
  });

  it("写能力与只读能力可区分", () => {
    const write = tools.find((t) => t.name === "inquiry.submit")!;
    expect(write.inputSchema.required).toContain("message");
    const read = tools.find((t) => t.name === "product.lookup")!;
    expect(read.inputSchema.required).toBeUndefined();
  });
});

describe("MCP JSON-RPC 处理", () => {
  it("initialize 返回协议版本与服务器信息", () => {
    const res = handleMcpRequest(content, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.id).toBe(1);
    const result = res.result as { protocolVersion: string; serverInfo: { name: string } };
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.serverInfo.name).toContain("示例科技");
  });

  it("tools/list 返回全部工具", () => {
    const res = handleMcpRequest(content, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const result = res.result as { tools: unknown[] };
    expect(result.tools.length).toBeGreaterThan(5);
  });

  it("tools/call 调用产品查询并带来源", () => {
    const res = handleMcpRequest(content, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "product.lookup", arguments: { query: "EG-200" } },
    });
    const result = res.result as { content: Array<{ text: string }> };
    expect(result.content[0].text).toContain("48000");
    expect(result.content[0].text).toContain("来源");
  });

  it("tools/call 对写能力返回提示而非执行", () => {
    const res = handleMcpRequest(content, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "inquiry.submit", arguments: {} },
    });
    const result = res.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("只提供只读查询能力");
  });

  it("未知方法返回 -32601", () => {
    const res = handleMcpRequest(content, { jsonrpc: "2.0", id: 5, method: "nope" });
    expect(res.error?.code).toBe(-32601);
  });

  it("tools/call 缺 name 返回 -32602", () => {
    const res = handleMcpRequest(content, { jsonrpc: "2.0", id: 6, method: "tools/call" });
    expect(res.error?.code).toBe(-32602);
  });

  it("FAQ 查询命中问答", () => {
    const r = callReadTool(content, "faq.query", { query: "起订量" });
    expect(r.content[0].text).toContain("10 台");
  });
});

describe("MCP 静态清单导出", () => {
  it("导出含工具与内容索引", () => {
    const json = JSON.parse(exportMcpManifest(content));
    expect(json.tools.length).toBeGreaterThan(5);
    expect(json.content.length).toBeGreaterThan(2);
    expect(json.serverInfo.instructions).toContain("示例科技");
  });
});

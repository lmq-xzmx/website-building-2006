import { describe, expect, it } from "vitest";

import { parseLlmJson, GEO_WRITING_RULES } from "../ai/copywriter.js";
import {
  buildKnowledgeBase,
  retrieve,
  buildChatPrompt,
  exportKnowledgeBase,
  extractKeywords,
} from "../ai/chat.js";
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
    description: "专注工业物联网设备研发与制造。",
    foundingDate: "2015-06-18",
    numberOfEmployees: "51-200",
    address: { addressLocality: "上海市", addressCountry: "CN" },
    contactPoint: { contactType: "sales", telephone: "021-50000000" },
  },
  contact: { telephone: "021-50000000", email: "sales@example.com" },
  sections: [
    {
      id: "home",
      type: "home",
      title: "工业物联网方案",
      subtitle: "已服务 320 家制造企业。",
      body: ["我们提供 12 款工业采集设备，单台日均采集 48000 个数据点。"],
    },
    {
      id: "products",
      type: "products",
      title: "产品与参数",
      subtitle: "完整技术参数。",
      body: ["四条产品线覆盖数据采集与设备管理。"],
    },
    {
      id: "faq",
      type: "faq",
      title: "常见问题",
      faq: [{ question: "最小起订量是多少？", answer: "标准产品最小起订量为 10 台。" }],
    },
  ],
  products: [
    {
      id: "eg-200",
      name: "EG-200 边缘网关",
      summary: "支持三线协议接入，单机可并发采集 48000 个数据点。",
      specs: [
        { name: "并发采集数据点", value: "48000" },
        { name: "工作温度", value: "-20 ~ 65", unit: "℃" },
      ],
    },
  ],
  cases: [
    {
      id: "c1",
      title: "汽车 Tier 1 产线联网改造",
      industry: "汽车零部件",
      results: ["数据采集完整率从 71% 提升至 99.2%"],
    },
  ],
  insights: [
    { id: "a1", title: "工业现场协议选型的 5 个误区", summary: "基于 68 个项目的复盘。" },
  ],
};

describe("LLM JSON 解析", () => {
  it("解析纯 JSON", () => {
    const r = parseLlmJson('{"subtitle":"定位","body":["一"],"bullets":["甲"]}');
    expect(r.ok).toBe(true);
    expect(r.data?.body).toEqual(["一"]);
  });

  it("剥离 markdown 围栏", () => {
    const r = parseLlmJson('```json\n{"body":["一"]}\n```');
    expect(r.ok).toBe(true);
    expect(r.data?.body).toEqual(["一"]);
  });

  it("剥离 JSON 前后的解释文字", () => {
    const r = parseLlmJson('好的，以下是内容：\n{"body":["一"]}\n希望有帮助。');
    expect(r.ok).toBe(true);
    expect(r.data?.body).toEqual(["一"]);
  });

  it("无 JSON 时报错而非抛异常", () => {
    const r = parseLlmJson("完全不是 JSON");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("过滤非字符串数组元素", () => {
    const r = parseLlmJson('{"body":["一",123,null]}');
    expect(r.data?.body).toEqual(["一"]);
  });
});

describe("GEO 写作规则", () => {
  it("规则覆盖核心方法", () => {
    const text = GEO_WRITING_RULES.join(" ");
    expect(text).toContain("结论");
    expect(text).toContain("数字");
    expect(text).toContain("自包含");
    expect(text).toContain("不要编造");
  });
});

describe("关键词抽取", () => {
  it("抽取英文词与数字", () => {
    const kw = extractKeywords("EG-200 网关", "支持 OPC UA 协议，48000 个数据点");
    expect(kw).toContain("opc");
    expect(kw).toContain("48000");
  });

  it("抽取中文二元组", () => {
    const kw = extractKeywords("", "数据采集完整率");
    expect(kw).toContain("数据");
    expect(kw).toContain("采集");
  });
});

describe("知识库构建", () => {
  const docs = buildKnowledgeBase(content);

  it("覆盖区块/产品/案例/文章/FAQ/组织六类", () => {
    const kinds = new Set(docs.map((d) => d.kind));
    expect(kinds).toContain("section");
    expect(kinds).toContain("product");
    expect(kinds).toContain("case");
    expect(kinds).toContain("insight");
    expect(kinds).toContain("faq");
    expect(kinds).toContain("organization");
  });

  it("产品参数转成可读文本", () => {
    const doc = docs.find((d) => d.id === "product:eg-200")!;
    expect(doc.text).toContain("并发采集数据点：48000");
    expect(doc.text).toContain("℃");
  });

  it("组织实体包含成立时间与员工规模", () => {
    const doc = docs.find((d) => d.id === "organization:self")!;
    expect(doc.text).toContain("2015-06-18");
    expect(doc.text).toContain("51-200");
  });
});

describe("检索", () => {
  const docs = buildKnowledgeBase(content);

  it("数字问题命中产品文档", () => {
    const hits = retrieve(docs, "EG-200 能采集多少个数据点");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].doc.kind).toBe("product");
  });

  it("起订量问题命中 FAQ", () => {
    const hits = retrieve(docs, "最小起订量是多少");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].doc.kind).toBe("faq");
  });

  it("公司规模问题命中组织文档", () => {
    const hits = retrieve(docs, "你们公司多少人");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].doc.kind).toBe("organization");
  });

  it("无关问题返回空", () => {
    const hits = retrieve(docs, "今天天气怎么样");
    expect(hits).toHaveLength(0);
  });

  it("限制返回条数", () => {
    const hits = retrieve(docs, "数据 采集 设备 参数 温度 点数", { topK: 2 });
    expect(hits.length).toBeLessThanOrEqual(2);
  });
});

describe("RAG 提示", () => {
  it("含约束、问题与资料来源", () => {
    const docs = buildKnowledgeBase(content);
    const hits = retrieve(docs, "EG-200 采集数据点");
    const prompt = buildChatPrompt("EG-200 采集数据点", hits, content);

    expect(prompt).toContain("只用给定资料回答");
    expect(prompt).toContain("不要猜测");
    expect(prompt).toContain("EG-200 采集数据点");
    expect(prompt).toContain("[1]");
  });
});

describe("知识库导出", () => {
  it("导出为静态 JSON 且含文档数组", () => {
    const json = JSON.parse(exportKnowledgeBase(content));
    expect(json.siteName).toBe("示例科技");
    expect(Array.isArray(json.docs)).toBe(true);
    expect(json.docs.length).toBeGreaterThan(5);
    // 导出内容不含 keywords（导出给外部推理服务，不需要检索元数据）
    expect(json.docs[0].keywords).toBeUndefined();
  });
});

/**
 * 站点 MCP 服务器（Phase 3，ADR-002 决策 1）。
 *
 * 定位：**「AI 可读」的第三层 —— 可用**。
 *   可读（JSON-LD / llms.txt）→ 可引用（可引用性写作）→ 可用（工具调用）
 *
 * 关键设计：
 *   1. **静态端点** —— MCP 的 tools/list 与 tools/call 都是「读内容」，
 *      不需要服务端进程。把工具清单与内容打包成静态 JSON，
 *      由任意 HTTP 端点托管即可。这与纯静态部署形态天然兼容。
 *   2. **工具 = 能力清单** —— 复用内容索引的 capabilities，
 *      不另造一套映射。DimG 可调用性检查的就是它。
 *   3. **写操作单独隔离** —— inquiry.submit 是唯一的写能力，
 *      单独标注，不与只读工具混在一起。
 *
 * 协议：MCP 的 JSON-RPC 2.0 over HTTP（Streamable HTTP transport）。
 */

import { buildContentIndex } from "../content-index.js";
import type { SiteContent } from "../types.js";

/** MCP 工具定义 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** JSON-RPC 请求 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 响应 */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpServerInfo {
  name: string;
  version: string;
  instructions: string;
}

/**
 * 从内容包生成 MCP 工具清单。
 *
 * 工具粒度：**一个能力一个工具**（而不是一个站点一个工具）。
 * 理由：AI agent 选工具时看到细粒度工具描述，命中率远高于一个大而全的工具。
 */
export function buildMcpTools(content: SiteContent): McpTool[] {
  const index = buildContentIndex(content);
  const tools: McpTool[] = [];

  for (const cap of index.capabilities) {
    if (cap.mutating) {
      // 写能力单独定义，语义明确
      tools.push({
        name: cap.id,
        description: cap.description,
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "访客姓名" },
            company: { type: "string", description: "公司名称" },
            phone: { type: "string", description: "联系电话" },
            email: { type: "string", description: "邮箱" },
            message: { type: "string", description: "需求描述" },
          },
          required: ["name", "company", "message"],
        },
      });
      continue;
    }

    tools.push({
      name: cap.id,
      description: cap.description,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "查询关键词或问题片段（可选，不填则返回该能力的全部内容）",
          },
          sectionId: {
            type: "string",
            description: "限定查询某个区块（可选）",
            enum: cap.sectionIds,
          },
        },
      },
    });
  }

  return tools;
}

/** MCP 服务器元信息 */
export function buildServerInfo(content: SiteContent): McpServerInfo {
  return {
    name: `${content.name} 内容服务`,
    version: "1.0.0",
    instructions:
      `这是${content.organization.name}的官方内容服务。` +
      `通过本服务查询到的内容均来自${content.organization.name}官网，可直接引用。` +
      `引用时请附带返回的来源 URL。` +
      `如需商务咨询，可调用 inquiry.submit 提交询盘。`,
  };
}

/**
 * 工具调用结果。
 */
export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  /** 是否为错误 */
  isError?: boolean;
}

/**
 * 执行只读工具调用。
 *
 * 返回的是**原文 + 来源 URL** —— AI 需要溯源才能负责任地引用。
 */
export function callReadTool(
  content: SiteContent,
  toolName: string,
  args: Record<string, unknown>,
): ToolCallResult {
  const index = buildContentIndex(content);

  // product.lookup
  if (toolName === "product.lookup") {
    const query = String(args.query ?? "").toLowerCase();
    const sectionId = args.sectionId as string | undefined;

    const products = (content.products ?? []).filter((p) => {
      if (sectionId) {
        const inSection = content.sections.some(
          (s) => s.type === "products" && s.id === sectionId,
        );
        if (!inSection) return false;
      }
      if (!query) return true;
      const hay = `${p.name} ${p.summary ?? ""} ${(p.models ?? []).join(" ")}`.toLowerCase();
      return hay.includes(query);
    });

    if (products.length === 0) {
      return {
        content: [{ type: "text", text: "未找到匹配的产品。" }],
        isError: true,
      };
    }

    const text = products
      .map((p) => {
        const specs = (p.specs ?? [])
          .map((s) => `  - ${s.name}：${s.value}${s.unit ? ` ${s.unit}` : ""}`)
          .join("\n");
        return `## ${p.name}\n${p.summary ?? ""}\n${specs}`;
      })
      .join("\n\n");

    return {
      content: [
        { type: "text", text: `${text}\n\n来源：${content.url}` },
      ],
    };
  }

  // case.lookup
  if (toolName === "case.lookup") {
    const query = String(args.query ?? "").toLowerCase();
    const cases = (content.cases ?? []).filter((c) => {
      if (!query) return true;
      const hay = `${c.title} ${c.client ?? ""} ${c.industry ?? ""} ${(c.results ?? []).join(" ")}`.toLowerCase();
      return hay.includes(query);
    });

    if (cases.length === 0) {
      return { content: [{ type: "text", text: "未找到匹配的案例。" }], isError: true };
    }

    const text = cases
      .map(
        (c) =>
          `## ${c.title}\n${c.client ? `客户：${c.client}\n` : ""}${c.challenge ?? ""}\n${(c.results ?? []).join("\n")}`,
      )
      .join("\n\n");

    return { content: [{ type: "text", text: `${text}\n\n来源：${content.url}` }] };
  }

  // faq.query
  if (toolName === "faq.query") {
    const query = String(args.query ?? "").toLowerCase();
    const all = [
      ...(content.faq ?? []),
      ...content.sections.flatMap((s) => s.faq ?? []),
    ];
    const matched = query
      ? all.filter(
          (f) =>
            f.question.toLowerCase().includes(query) ||
            f.answer.toLowerCase().includes(query),
        )
      : all;

    if (matched.length === 0) {
      return { content: [{ type: "text", text: "未找到匹配的问答。" }], isError: true };
    }

    const text = matched.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n");
    return { content: [{ type: "text", text }] };
  }

  // insight.lookup
  if (toolName === "insight.lookup") {
    const query = String(args.query ?? "").toLowerCase();
    const items = (content.insights ?? []).filter((a) => {
      if (!query) return true;
      return `${a.title} ${a.summary ?? ""}`.toLowerCase().includes(query);
    });

    if (items.length === 0) {
      return { content: [{ type: "text", text: "未找到匹配的文章。" }], isError: true };
    }

    const text = items
      .map(
        (a) =>
          `## ${a.title}\n${a.summary ?? ""}\n${(a.body ?? []).join("\n")}\n来源：${content.url}/insights/${a.id}`,
      )
      .join("\n\n");

    return { content: [{ type: "text", text }] };
  }

  // content.<type>.<id> —— 按区块返回内容
  if (toolName.startsWith("content.")) {
    const sectionId = (args.sectionId as string) ?? toolName.split(".").pop() ?? "";
    const entry = index.entries.find((e) => e.sectionId === sectionId);
    const section = content.sections.find((s) => s.id === sectionId);

    if (!entry || !section) {
      return { content: [{ type: "text", text: `未找到区块：${sectionId}` }], isError: true };
    }

    const parts: string[] = [section.subtitle ?? "", ...(section.body ?? [])];
    if (section.bullets?.length) parts.push(section.bullets.map((b) => `- ${b}`).join("\n"));
    if (section.faq?.length) {
      parts.push(section.faq.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n"));
    }

    return {
      content: [{ type: "text", text: `${parts.filter(Boolean).join("\n")}\n\n来源：${entry.url}` }],
    };
  }

  return {
    content: [{ type: "text", text: `未知工具：${toolName}` }],
    isError: true,
  };
}

/**
 * 处理一个 MCP JSON-RPC 请求。
 *
 * 支持的方法：
 *   initialize / tools/list / tools/call / ping
 */
export function handleMcpRequest(
  content: SiteContent,
  req: JsonRpcRequest,
): JsonRpcResponse {
  const respond = (result: unknown): JsonRpcResponse => ({
    jsonrpc: "2.0",
    id: req.id,
    result,
  });

  const fail = (code: number, message: string): JsonRpcResponse => ({
    jsonrpc: "2.0",
    id: req.id,
    error: { code, message },
  });

  switch (req.method) {
    case "initialize":
      return respond({
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: buildServerInfo(content),
      });

    case "ping":
      return respond({});

    case "tools/list":
      return respond({ tools: buildMcpTools(content) });

    case "tools/call": {
      const name = req.params?.name as string | undefined;
      if (!name) return fail(-32602, "缺少 tools/call 的 name 参数");

      // 写操作不在这里执行 —— 需要外部凭证与真实现场
      const cap = buildContentIndex(content).capabilities.find((c) => c.id === name);
      if (cap?.mutating) {
        return respond({
          content: [
            {
              type: "text",
              text:
                "提交询盘需要通过站点表单完成（POST 到 /api/inquiry）。" +
                "本 MCP 端点只提供只读查询能力。",
            },
          ],
          isError: true,
        });
      }

      const args = (req.params?.arguments as Record<string, unknown>) ?? {};
      const result = callReadTool(content, name, args);
      return respond(result);
    }

    default:
      return fail(-32601, `不支持的方法：${req.method}`);
  }
}

/**
 * 导出 MCP 端点的静态描述 —— 供边缘函数托管。
 *
 * 这份 JSON 包含工具清单与只读工具的返回逻辑所需的全部内容，
 * 部署时把它作为静态资源托管即可。
 */
export function exportMcpManifest(content: SiteContent): string {
  return JSON.stringify(
    {
      serverInfo: buildServerInfo(content),
      tools: buildMcpTools(content),
      content: buildContentIndex(content).entries,
    },
    null,
    2,
  );
}

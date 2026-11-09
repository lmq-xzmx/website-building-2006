/**
 * 行业内容包 —— 模板矩阵化的载体（ADR-000 决策 2）。
 *
 * 设计意图：
 *   **一个骨架 × N 个行业包**，而不是 N 个模板。
 *   骨架（页型组件）不变，行业包只提供：
 *     1. 内容（文字、数据、参数、案例）
 *     2. 行业特有的 Schema 类型映射
 *     3. 行业术语库（提升可引用性的「Technical Terms」信号）
 *
 * 行业包是**纯数据**，不依赖任何框架 —— 与 SiteContent 同构。
 */

import type { SchemaType, SectionContent, SiteContent, SiteLocale } from "./types.js";

/**
 * 行业包 —— 描述一个行业的建站配置。
 *
 * 与 SiteContent 的关系：SiteContent 是**完整站点**（内容包），
 * 行业包是**行业预设**（可复用的起点）。二者组合出客户站。
 */
export interface IndustryPack {
  /** 行业标识 */
  id: string;
  /** 行业显示名 */
  name: string;
  /** 适用语言 */
  locale: SiteLocale;
  /** 该行业的默认 Schema 类型（骨架会据此选择页面 Schema） */
  defaultSchemaTypes?: Partial<Record<string, SchemaType>>;
  /**
   * 行业术语库 —— 可引用性的「Technical Terms」信号来源。
   *
   * 术语要**具体**：AI 引用时带上行业术语能提升专业性判定。
   */
  terminology?: string[];
  /**
   * 该行业的可引用性写作提示 —— 给内容编写者（人或 LLM）的指引。
   */
  writingHints?: string[];
  /**
   * 指标单位约定 —— 让不同页面的数字口径一致。
   */
  metricUnits?: Record<string, string>;
}

/**
 * 内置行业包。
 *
 * 起步只做两个 —— 先验证矩阵化确实比「每行业一个模板」省事，
 * 有真实客户再按同样的结构扩展（ADR-000 开放问题）。
 */
export const INDUSTRY_PACKS: IndustryPack[] = [
  {
    id: "industrial-iot",
    name: "工业物联网设备制造",
    locale: "zh-CN",
    defaultSchemaTypes: {
      products: "ItemList",
      cases: "CollectionPage",
    },
    terminology: [
      "边缘网关",
      "数据采集器",
      "OPC UA",
      "Modbus RTU",
      "Profinet",
      "数据采集完整率",
      "无故障时间 MTBF",
      "宽温工作",
      "无风扇设计",
      "固件回滚",
      "A/B 双分区",
    ],
    writingHints: [
      "参数必须带单位：48000 点/日/台，而不是「性能强劲」",
      "案例结果写成「指标 + 变化量」：完整率从 71% 提升至 99.2%",
      "首段给结论 + 具体数字，不要铺垫",
      "认证与标准要写全称与编号：CE、RoHS、ISO 9001",
    ],
    metricUnits: {
      采集点数: "点/日/台",
      温度范围: "℃",
      存储容量: "GB",
      响应时间: "分钟",
    },
  },
  {
    id: "saas-enterprise",
    name: "企业软件 SaaS",
    locale: "zh-CN",
    defaultSchemaTypes: {
      products: "ItemList",
      insights: "BlogPage",
    },
    terminology: [
      "多租户架构",
      "SLA 可用性",
      "私有化部署",
      "单点登录 SSO",
      "审计日志",
      "灰度发布",
      "API 网关",
      "数据隔离",
      "国产化适配",
    ],
    writingHints: [
      "SLA 写成具体数字：99.95%，并说明统计口径与赔付方式",
      "部署形态逐项列出：公有云 / 私有化 / 信创适配",
      "价格与套餐要写清包含项，不要只写「灵活定价」",
      "客户数要注明统计时间范围",
    ],
    metricUnits: {
      可用性: "%",
      响应时间: "ms",
      并发数: "QPS",
    },
  },
];

/** 按 id 取行业包。 */
export function getIndustryPack(id: string): IndustryPack | undefined {
  return INDUSTRY_PACKS.find((p) => p.id === id);
}

/**
 * 应用行业包到内容包 —— 返回带行业增强的内容包。
 *
 * 增强点：
 *   1. 给区块补默认 Schema 类型（行业包覆盖骨架默认）
 *   2. 校验内容是否用到行业术语（可引用性体检提示）
 */
export function applyIndustryPack(
  content: SiteContent,
  pack: IndustryPack,
): SiteContent {
  const sections: SectionContent[] = content.sections.map((s) => {
    const override = pack.defaultSchemaTypes?.[s.type];
    if (override && !s.schemaType) {
      return { ...s, schemaType: override };
    }
    return s;
  });

  return { ...content, sections };
}

/**
 * 内容术语覆盖率 —— 可引用性检查项。
 *
 * 术语覆盖过低意味着内容太泛，AI 难以判定专业性。
 */
export function terminologyCoverage(
  content: SiteContent,
  pack: IndustryPack,
): { covered: number; total: number; ratio: number; missing: string[] } {
  const terms = pack.terminology ?? [];
  if (terms.length === 0) {
    return { covered: 0, total: 0, ratio: 0, missing: [] };
  }

  const haystack = JSON.stringify(content);
  const missing = terms.filter((t) => !haystack.includes(t));
  const covered = terms.length - missing.length;

  return {
    covered,
    total: terms.length,
    ratio: terms.length > 0 ? covered / terms.length : 0,
    missing,
  };
}

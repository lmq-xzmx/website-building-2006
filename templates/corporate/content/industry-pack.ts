/**
 * 企业软件 SaaS 行业包 —— 第二个行业，验证矩阵化。
 *
 * 与工业物联网包共用**同一套骨架**（templates/corporate 的 7 个页型），
 * 只有内容与术语不同。这就是「骨架 × 行业包」的意义：
 * 第二个行业的落地成本 ≈ 写一个内容包，而不是复制一套模板。
 */

import type { IndustryPack } from "@geokit/geo-kit";

export const saasPack: IndustryPack = {
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
};

export default saasPack;

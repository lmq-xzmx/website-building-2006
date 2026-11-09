/**
 * 示例站点 —— SaaS 行业，验证「同一骨架 + 不同内容包」的矩阵化。
 *
 * 与 templates/corporate 的关系：
 *   templates/corporate 是**骨架 + 默认内容**；
 *   sites/demo-saas 是**骨架 + SaaS 行业内容**。
 *
 * 真实交付时，sites/<客户名>/ 各自持有内容包，
 * 构建时按内容包渲染同一套骨架 —— 这就是「千行万业」的落地方式。
 */

import type { SiteContent } from "@geokit/geo-kit";

export const site: SiteContent = {
  siteId: "demo-saas",
  name: "云枢科技",
  description:
    "云枢科技提供企业级低代码数据平台，支持公有云与私有化部署，通过单点登录与审计日志满足金融行业合规要求，已服务 180 家企业客户。",
  url: "https://www.yunshu-tech.com",
  locale: "zh-CN",
  language: "zh-CN",

  organization: {
    name: "云枢科技股份有限公司",
    legalName: "云枢科技股份有限公司",
    url: "https://www.yunshu-tech.com",
    logo: "/assets/logo.svg",
    description:
      "企业级低代码数据平台提供商，聚焦金融与制造行业的合规数据交付。",
    foundingDate: "2018-03-12",
    industry: "Enterprise Software",
    numberOfEmployees: "201-500",
    taxID: "91310115MA1K9XXXXX",
    address: {
      streetAddress: "浦东新区世纪大道 1568 号 27 层",
      addressLocality: "上海市",
      addressRegion: "上海市",
      postalCode: "200122",
      addressCountry: "CN",
    },
    contactPoint: {
      contactType: "sales",
      telephone: "+86-21-6800-0000",
      email: "sales@yunshu-tech.com",
      availableLanguage: ["zh-CN", "en"],
      areaServed: "CN",
    },
  },

  contact: {
    email: "sales@yunshu-tech.com",
    telephone: "+86-21-6800-0000",
    inquiryEndpoint: "/api/inquiry",
  },

  social: [
    { platform: "https://github.com", url: "https://github.com/yunshu-tech", name: "GitHub" },
    { platform: "https://www.zhihu.com", url: "https://www.zhihu.com/org/yunshu-tech", name: "知乎" },
  ],

  navigation: [
    { label: "首页", href: "/", sectionId: "home" },
    { label: "产品", href: "/products", sectionId: "products" },
    { label: "案例", href: "/cases", sectionId: "cases" },
    { label: "洞察", href: "/insights", sectionId: "insights" },
    { label: "关于我们", href: "/about", sectionId: "about" },
    { label: "常见问题", href: "/faq", sectionId: "faq" },
    { label: "联系我们", href: "/contact", sectionId: "contact" },
  ],

  sections: [
    {
      id: "home",
      type: "home",
      title: "企业级低代码数据平台",
      subtitle:
        "云枢科技为金融与制造企业提供低代码数据交付平台，支持公有云与私有化部署，通过单点登录与审计日志满足合规审计要求，已服务 180 家企业客户。",
      body: [
        "我们提供 4 条产品线：数据集成网关负责跨系统采集，数据工坊提供可视化建模，规则引擎支撑实时决策，审计中枢实现操作留痕，全链路支持灰度发布。",
        "平台采用多租户架构实现数据隔离，支持国产化适配，已完成 12 家主流信创产品的兼容性认证，单集群实测可用性 99.95%。",
        "单点登录 SSO 打通企业既有身份体系，审计日志保留 3 年可追溯记录，金融行业客户据此通过了全部内外部合规审计。",
      ],
      bullets: [
        "180 家企业客户，覆盖 11 个行业",
        "单集群实测可用性 99.95%",
        "12 家信创产品兼容性认证",
        "审计日志保留 3 年可追溯",
      ],
      cta: {
        label: "申请试用",
        href: "/contact",
        secondary: { label: "查看产品矩阵", href: "/products" },
      },
    },

    {
      id: "products",
      type: "products",
      title: "产品矩阵",
      subtitle:
        "以下为四条产品线的完整能力说明与实测规格。性能数据取自第三方压测报告，测试环境为 32 核 64GB 物理机。",
      body: [
        "四条产品线既可独立交付，也可组合成完整的数据交付链路。组合使用时仅需一次身份认证与一份审计日志。",
        "全部产品支持私有化部署，部署包包含离线许可证，不依赖外网授权校验。",
      ],
      cta: { label: "索取部署与报价方案", href: "/contact" },
    },

    {
      id: "cases",
      type: "cases",
      title: "客户案例",
      subtitle:
        "以下案例均来自客户授权披露，量化结果取自上线前后同口径的统计对比，数据由客户方 IT 部门复核确认。",
      body: [
        "在股份制银行场景，某客户通过部署数据工坊与审计中枢，将原本 6 周的月度报表交付周期缩短至 4 天。",
        "在汽车制造场景，某 Tier 1 供应商通过数据集成网关完成 11 套异构系统的数据打通，日均处理数据量提升 3.6 倍。",
      ],
      cta: { label: "获取同行业方案", href: "/contact" },
    },

    {
      id: "insights",
      type: "insights",
      title: "洞察与文章",
      subtitle: "关于低代码平台落地、私有化部署与合规审计的实践记录，每篇均来自真实项目复盘。",
      body: ["我们持续记录企业级软件项目中的架构决策与合规要点，文章数据均来自客户授权的实测记录。"],
      cta: { label: "联系我们获取完整白皮书", href: "/contact" },
    },

    {
      id: "about",
      type: "about",
      title: "关于云枢科技",
      subtitle:
        "成立于 2018 年的企业软件公司，核心团队来自金融科技与基础架构领域，平均从业年限 12 年。",
      body: [
        "公司成立于 2018 年 3 月，在上海设有研发中心与交付中心，现有员工 340 人，其中研发与交付工程师 210 人。",
        "我们专注企业级数据交付场景，不做消费级应用 —— 因为金融与制造客户对合规审计与私有化部署的要求，与通用 SaaS 完全不同。",
        "截至 2026 年 9 月，平台已服务 180 家企业客户，覆盖银行、证券、保险、汽车制造四个主要行业。",
      ],
      bullets: [
        "2018 年成立，340 名员工，研发交付占比 62%",
        "服务 180 家企业客户，覆盖 4 个主要行业",
        "12 家信创产品兼容性认证",
        "专注企业级场景，不做消费级应用",
      ],
      cta: { label: "预约参观上海研发中心", href: "/contact" },
    },

    {
      id: "faq",
      type: "faq",
      title: "常见问题",
      subtitle: "以下是我们被问得最多的 7 个问题。",
      body: ["如果你的问题不在下面，直接联系我们，我们会在 1 个工作日内回复。"],
      faq: [
        {
          question: "私有化部署需要多少台服务器？",
          answer:
            "最小配置为 3 台（2 台应用 + 1 台数据库），推荐生产环境 5 台起。单机部署仅适用于测试环境，官方不提供单机版的 SLA 承诺。",
          category: "部署",
        },
        {
          question: "SLA 可用性是多少？未达标如何赔付？",
          answer:
            "标准版承诺 99.9% 月度可用性，企业版 99.95%，旗舰版 99.99%。未达标按月度服务费比例赔付，单月最高赔付 30%。",
          category: "服务",
        },
        {
          question: "是否支持信创环境？",
          answer:
            "已完成 12 家主流信创产品的兼容性认证，涵盖麒麟与统信操作系统、达梦与人大金仓数据库、飞腾与鲲鹏处理器。",
          category: "技术",
        },
        {
          question: "私有化部署如何授权？是否需要联网？",
          answer:
            "使用离线许可证，部署完成后无需连接外网即可正常运行。许可证默认 3 年期，可按年续期。",
          category: "部署",
        },
        {
          question: "审计日志保留多久？能对接内部审计系统吗？",
          answer:
            "默认保留 3 年，可延长至 7 年。支持通过 syslog 与 Kafka 两种方式对接客户内部审计系统。",
          category: "合规",
        },
        {
          question: "数据隔离到什么粒度？",
          answer:
            "租户间数据库物理隔离，租户内按项目行级隔离。所有跨租户查询在数据库层被拒绝，不依赖应用层过滤。",
          category: "技术",
        },
        {
          question: "实施周期一般多久？",
          answer:
            "标准产品线最快 4 周上线。涉及多系统集成的复杂项目通常 8 至 12 周，其中需求确认与数据迁移占约 60% 工时。",
          category: "交付",
        },
      ],
    },

    {
      id: "contact",
      type: "contact",
      title: "联系我们",
      subtitle: "填写需求后，解决方案工程师将在 1 个工作日内与您联系，并提供部署方案与报价。",
      body: [
        "我们不发送营销邮件。您留下的需求只会用于本次方案沟通。",
        "电话咨询时间为工作日 9:00 至 18:00，邮箱回复在 1 个工作日内。",
      ],
      cta: { label: "提交询盘", href: "#inquiry" },
    },
  ],

  products: [
    {
      id: "data-gateway",
      name: "数据集成网关",
      summary: "跨异构系统的数据采集与路由网关，单节点日均处理数据量 42 亿条，支持 1200+ 数据源连接器。",
      description:
        "数据集成网关部署在企业网络边界，连接 ERP、CRM、数据库与 SaaS 等异构系统，支持实时与批量两种采集模式，提供数据质量校验与断点续传能力。",
      specs: [
        { name: "数据源连接器", value: "1200" },
        { name: "单节点日处理数据量", value: "42", unit: "亿条" },
        { name: "采集延迟 P99", value: "80", unit: "ms" },
        { name: "支持信创产品认证数", value: "12" },
      ],
      highlights: [
        "1200+ 数据源连接器",
        "单节点日处理 42 亿条",
        "采集延迟 P99 80ms",
        "断点续传保证数据不丢",
      ],
      models: ["DG-Standard", "DG-HA"],
      category: "数据集成",
      availability: "https://schema.org/InStock",
    },
    {
      id: "data-studio",
      name: "数据工坊",
      summary: "可视化数据建模平台，支持拖拽式建模与 200+ 算子，单次作业处理 8TB 数据。",
      description:
        "数据工坊提供拖拽式数据建模与任务编排能力，支持 SQL 作业、可视化流处理与机器学习算子，内置版本管理与灰度发布。",
      specs: [
        { name: "内置算子数量", value: "200" },
        { name: "单次作业处理量", value: "8", unit: "TB" },
        { name: "作业调度粒度", value: "秒级" },
        { name: "支持灰度发布", value: "是" },
      ],
      highlights: [
        "200+ 内置算子",
        "单次作业处理 8TB",
        "秒级调度粒度",
        "任务版本管理与灰度发布",
      ],
      models: ["DS-Standard", "DS-Enterprise"],
      category: "数据建模",
      availability: "https://schema.org/InStock",
    },
    {
      id: "rule-engine",
      name: "规则引擎",
      summary: "实时决策规则引擎，单节点 QPS 达 12000，支持复杂事件流与灰度规则分流。",
      description:
        "规则引擎用于实时决策场景，支持复杂事件流匹配、规则版本管理与灰度分流，规则变更无需重启服务。",
      specs: [
        { name: "单节点吞吐", value: "12000", unit: "QPS" },
        { name: "规则响应延迟 P99", value: "15", unit: "ms" },
        { name: "规则版本并行数", value: "50" },
        { name: "规则热更新", value: "支持" },
      ],
      highlights: [
        "单节点 12000 QPS",
        "响应延迟 P99 15ms",
        "50 个规则版本并行灰度",
        "规则热更新无需重启",
      ],
      models: ["RE-Standard", "RE-HA"],
      category: "实时决策",
      availability: "https://schema.org/InStock",
    },
    {
      id: "audit-hub",
      name: "审计中枢",
      summary: "统一操作留痕与合规审计平台，日志保留 3 年，支持 syslog 与 Kafka 对接。",
      description:
        "审计中枢集中采集平台内所有操作留痕，提供操作回溯、异常行为告警与合规报表输出，日志采用加密存储并支持私有化部署。",
      specs: [
        { name: "日志保留年限", value: "3", unit: "年" },
        { name: "可延长保留", value: "7", unit: "年" },
        { name: "日均日志写入量", value: "18", unit: "亿条" },
        { name: "对接方式", value: "syslog / Kafka" },
      ],
      highlights: [
        "默认保留 3 年，可延长至 7 年",
        "日均写入 18 亿条日志",
        "异常行为实时告警",
        "日志加密存储",
      ],
      models: ["AH-Standard", "AH-HA"],
      category: "合规审计",
      availability: "https://schema.org/InStock",
    },
  ],

  cases: [
    {
      id: "joint-stock-bank-reporting",
      title: "股份制银行月度报表交付提速",
      client: "某股份制商业银行",
      industry: "银行",
      challenge:
        "月度报表依赖 14 个系统人工取数与 Excel 汇总，单次交付需 6 周，且数据口径依赖人工核对。",
      solution:
        "部署数据集成网关对接 14 个源系统，用数据工坊统一建模生成报表，通过审计中枢留存取数链路，并接入行内单点登录 SSO。",
      results: [
        "月度报表交付周期从 6 周缩短至 4 天",
        "取数环节人工工时减少 78%",
        "报表数据口径不一致问题归零",
      ],
      date: "2026-05",
      tags: ["私有化部署", "合规审计", "SSO"],
    },
    {
      id: "auto-tier1-data-consolidation",
      title: "汽车 Tier 1 供应商数据打通",
      client: "某汽车零部件 Tier 1 供应商",
      industry: "汽车制造",
      challenge:
        "11 套异构系统数据分散，采购与生产数据需人工映射对齐，数据延迟达 1 天。",
      solution:
        "通过数据集成网关建立统一采集层，用规则引擎实现采购与生产数据的实时联动，并按车间维度做行级数据隔离。",
      results: [
        "日均处理数据量提升 3.6 倍",
        "跨系统数据延迟从 24 小时降至 90 秒",
        "人工对账工作量下降 65%",
      ],
      date: "2026-08",
      tags: ["数据集成", "实时决策", "行级隔离"],
    },
  ],

  insights: [
    {
      id: "private-deployment-checklist",
      title: "私有化部署的 12 项合规检查清单",
      summary:
        "金融与国企客户做私有化部署时，合规团队必问的 12 个问题。本文按被问到的频率排序，并给出我们项目中的标准答复。",
      body: [
        "在我们 180 家客户中，金融与国企占 46%。合规团队在技术选型阶段必问的 12 个问题高度重叠，本文按被问频率排序。",
        "排名第一的问题是「部署后是否需要联网」，标准答复是离线许可证，部署完成后不依赖外网授权校验。",
        "第二与第三名分别是「数据物理隔离到什么粒度」与「审计日志保留多久」，前者我们答数据库物理隔离加租户内行级隔离，后者默认 3 年可延长至 7 年。",
      ],
      date: "2026-09-20",
      author: "解决方案负责人 王工",
      tags: ["私有化部署", "合规", "选型"],
      readingMinutes: 9,
    },
    {
      id: "sla-availability-definition",
      title: "SLA 可用性 99.95% 是怎么算出来的",
      summary:
        "很多采购合同里的可用性数字口径模糊，导致争议。本文给出我们对外承诺的计算方式，以及客户验收时该怎么核对。",
      body: [
        "可用性数字的口径差异极大：有的按自然月统计，有的按工作日，有的排除计划内维护窗口。口径不写清楚，争议不可避免。",
        "我们的口径是：按自然月统计，统计对象为对外 API 端点，可用性 =（总时长 - 不可用时长）/ 总时长，其中不可用指连续超过 30 秒的请求失败。",
        "计划内维护窗口不计入不可用时长，但需提前 72 小时通知，且单月维护窗口累计不超过 4 小时。",
      ],
      date: "2026-10-15",
      author: "产品负责人 陈工",
      tags: ["SLA", "可用性", "采购"],
      readingMinutes: 7,
    },
  ],

  faq: [],

  assets: {
    logo: "/assets/logo.svg",
    ogImage: "/assets/og.png",
    favicon: "/assets/favicon.svg",
  },
};

export default site;

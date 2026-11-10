/**
 * 通用企业站内容包 —— 骨架的默认内容。
 *
 * 这是「内容即配置」的示范（ADR-000 决策 2）：
 *   - 换客户 = 换这个文件（行业包提供不同内容，骨架不动）
 *   - 类型安全（SiteContent），编译期就能发现字段拼错
 *   - geo-kit 从这里派生 JSON-LD / llms.txt / 内容索引 / 体检输入
 *
 * 行业内容包的替换点：本文件 + 少量样式变量。
 */

import type { SiteContent } from "@geokit/geo-kit";

export const site: SiteContent = {
  siteId: "corporate-demo",
  name: "示例科技有限公司",
  description:
    "示例科技有限公司专注工业物联网设备研发与制造，为制造业客户提供设备联网、数据采集与远程运维一体化方案，已服务 320 家制造企业。",
  url: "https://www.example-tech.com",
  locale: "zh-CN",
  language: "zh-CN",

  theme: {
    // 工业物联网：沉稳的蓝 + modern 圆角风格
    variant: "default",
    style: "modern",
    respectColorScheme: true,
  },

  organization: {
    name: "示例科技有限公司",
    legalName: "示例科技股份有限公司",
    url: "https://www.example-tech.com",
    logo: "/assets/logo.svg",
    description:
      "专注工业物联网设备研发与制造的科技企业，产品覆盖数据采集器、边缘网关与设备管理平台。",
    foundingDate: "2015-06-18",
    industry: "Industrial IoT",
    numberOfEmployees: "51-200",
    taxID: "91310000MA1K3XXXXX",
    address: {
      streetAddress: "张江高科技园区博云路 2 号 5 楼",
      addressLocality: "上海市",
      addressRegion: "上海市",
      postalCode: "201203",
      addressCountry: "CN",
    },
    contactPoint: {
      contactType: "sales",
      telephone: "+86-21-5000-0000",
      email: "sales@example-tech.com",
      availableLanguage: ["zh-CN", "en"],
      areaServed: "CN",
    },
  },

  contact: {
    email: "sales@example-tech.com",
    telephone: "+86-21-5000-0000",
    address: {
      streetAddress: "张江高科技园区博云路 2 号 5 楼",
      addressLocality: "上海市",
      addressRegion: "上海市",
      postalCode: "201203",
      addressCountry: "CN",
    },
    // Phase 3 接 CRM：询盘提交端点
    inquiryEndpoint: "/api/inquiry",
  },

  social: [
    { platform: "https://github.com", url: "https://github.com/example-tech", name: "GitHub" },
    { platform: "https://www.zhihu.com", url: "https://www.zhihu.com/org/example-tech", name: "知乎" },
    {
      platform: "https://www.linkedin.com",
      url: "https://www.linkedin.com/company/example-tech",
      name: "LinkedIn",
    },
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
      title: "工业物联网设备与平台",
      subtitle:
        "示例科技为制造业客户提供设备联网、数据采集与远程运维的一体化方案，已服务 320 家制造企业，覆盖 26 个省份。",
      body: [
        "我们提供 12 款工业数据采集设备与 3 套边缘网关产品，支持 Modbus、OPC UA、Profinet 三类主流工业协议，单台设备日均采集数据点 48000 个。",
        "在设备管理平台上，客户可完成远程参数下发、固件升级与异常告警配置，平均故障响应时间从 4 小时缩短至 25 分钟。",
        "所有产品均通过 CE 与 RoHS 认证，支持 7×24 小时运行，已在汽车零部件、锂电packpack与光伏组件三条产线上稳定运行超过 3 年。",
      ],
      bullets: [
        "320 家 制造企业已上线",
        "48000 数据点/日/台",
        "12 款 工业采集设备",
        "3 类 工业协议",
      ],
      cta: {
        label: "获取选型报价",
        href: "/contact",
        secondary: { label: "查看产品参数", href: "/products" },
      },
      images: ["/assets/hero.svg"],
    },

    {
      id: "products",
      type: "products",
      title: "产品与参数",
      subtitle:
        "以下为在售产品的完整技术参数。所有参数均来自实测报告，测试条件为 25℃ 恒定环境下的连续运行 72 小时。",
      body: [
        "我们提供三条产品线：EG 系列边缘网关面向产线级数据汇聚，DA 系列采集器面向单机设备接入，DM 系列管理平台面向多厂区统一运维。",
        "全部产品支持远程固件升级，升级失败自动回滚到上一稳定版本，升级过程不中断采数任务。",
      ],
      cta: { label: "索取完整规格书", href: "/contact" },
    },

    {
      id: "cases",
      type: "cases",
      title: "客户案例",
      subtitle:
        "以下案例均来自客户授权披露，量化结果取自上线前后的同口径统计对比。",
      body: [
        "在汽车零部件行业，某 Tier 1 供应商通过部署 240 台 EG-200 边缘网关，实现 18 个车间的设备联网，数据采集完整率从 71% 提升至 99.2%。",
        "在锂电行业，某电芯工厂通过接入 DM 管理平台，把跨 4 个基地的设备运维集中到一个控制台，人工巡检工作量下降 62%。",
      ],
      cta: { label: "获取同行业方案", href: "/contact" },
    },

    {
      id: "insights",
      type: "insights",
      title: "洞察与文章",
      subtitle: "关于工业物联网选型、部署与运维的实践记录，每篇均来自真实项目复盘。",
      body: [
        "我们持续记录工业物联网项目中的选型决策与踩坑经验，文章数据均来自客户授权的实测记录。",
      ],
      cta: { label: "联系我们获取完整白皮书", href: "/contact" },
    },

    {
      id: "about",
      type: "about",
      title: "关于示例科技",
      subtitle:
        "成立于 2015 年的工业物联网设备制造商，核心团队来自精密仪器与汽车电子行业，平均从业年限 11 年。",
      body: [
        "公司成立于 2015 年 6 月，在上海张江设有研发与制造中心，现有员工 168 人，其中研发工程师 72 人。",
        "我们专注于工业场景下的设备联网与数据采集，不做通用云平台 —— 因为工业现场对稳定性与协议兼容性的要求，与互联网应用完全不同。",
        "截至 2026 年 10 月，我们的产品已在全国 26 个省份的 320 家制造企业上线，累计采集工业数据超过 47 亿点。",
      ],
      bullets: [
        "2015 年成立，168 名员工，研发占比 43%",
        "产品覆盖 26 个省份，累计采集 47 亿点数据",
        "专注工业场景，不做通用云平台",
      ],
      cta: { label: "预约参观上海研发中心", href: "/contact" },
    },

    {
      id: "faq",
      type: "faq",
      title: "常见问题",
      subtitle: "以下是我们被问得最多的 6 个问题。",
      body: [
        "如果你的问题不在下面，直接联系我们，我们会在 1 个工作日内回复。",
      ],
      faq: [
        {
          question: "最小起订量是多少？",
          answer:
            "标准产品线最小起订量为 10 台，单台即可购买样机。定制开发项目最小起订量为 50 台。",
          category: "采购",
        },
        {
          question: "从下单到交付需要多长时间？",
          answer:
            "标准型号备货充足，下单后 3 个工作日内发货。定制型号交期为 25 至 40 个工作日，取决于硬件改版与认证进度。",
          category: "交付",
        },
        {
          question: "支持哪些工业协议？",
          answer:
            "标准固件支持 Modbus RTU/TCP、OPC UA、Profinet、Modbus RTU over Serial 四类协议。第三方协议可通过 SDK 扩展，通常需要 5 个工作日。",
          category: "技术",
        },
        {
          question: "能否对接客户已有的 MES 或 ERP 系统？",
          answer:
            "可以。DM 管理平台提供 RESTful API 与 Kafka 消息队列两种对接方式，已预置 SAP、Oracle、用友、金蝶四套标准连接器。",
          category: "技术",
        },
        {
          question: "设备的质保期与售后响应是什么？",
          answer:
            "标准型号质保 3 年，定制型号质保 2 年。华东地区承诺 4 小时到场，远程支持在 30 分钟内响应。",
          category: "售后",
        },
        {
          question: "是否支持私有化部署？",
          answer:
            "支持。DM 管理平台提供私有化部署包，支持单机与三节点高可用两种拓扑，授权按节点数计费。",
          category: "部署",
        },
      ],
    },

    {
      id: "contact",
      type: "contact",
      title: "联系我们",
      subtitle: "填写需求后，销售工程师将在 1 个工作日内与您联系，并提供选型建议与报价。",
      body: [
        "我们不发送营销邮件。您留下的需求只会用于本次报价沟通。",
        "电话咨询时间为工作日 9:00 至 18:00，邮箱回复在 1 个工作日内。",
      ],
      cta: { label: "提交询盘", href: "#inquiry" },
    },
  ],

  products: [
    {
      id: "eg-200",
      name: "EG-200 边缘网关",
      summary:
        "面向产线级数据汇聚的工业边缘网关，支持三线协议接入，单机可并发采集 48000 个数据点。",
      description:
        "EG-200 部署在产线侧工控机柜内，通过以太网或 RS-485 接入现场设备，将 Modbus、OPC UA、Profinet 三类协议的数据汇聚后上送至 DM 管理平台。设备采用 -20℃ 至 65℃ 宽温设计，无风扇结构，支持 DIN 导轨与壁挂两种安装方式。",
      specs: [
        { name: "并发采集数据点", value: "48000" },
        { name: "协议支持", value: "Modbus RTU/TCP、OPC UA、Profinet" },
        { name: "存储容量", value: "128", unit: "GB" },
        { name: "工作温度", value: "-20 ~ 65", unit: "℃" },
        { name: "供电方式", value: "DC 9~36V" },
        { name: "防护等级", value: "IP40" },
        { name: "平均无故障时间", value: "80000", unit: "小时" },
      ],
      highlights: [
        "48000 数据点并发采集",
        "-20℃ 至 65℃ 宽温工作",
        "无风扇设计，7×24 小时稳定运行",
        "固件升级失败自动回滚",
      ],
      models: ["EG-200", "EG-200S", "EG-200T"],
      category: "边缘网关",
      image: "/assets/eg-200.svg",
      availability: "https://schema.org/InStock",
    },
    {
      id: "da-100",
      name: "DA-100 数据采集器",
      summary: "面向单机设备接入的低成本采集器，支持 16 路模拟量输入，单价低于 900 元。",
      description:
        "DA-100 用于单台设备的轻量数据采集，支持 8 路数字量输入与 4 路模拟量输入，通过 RS-485 总线级联最多 32 台，适用于老旧产线的低成本改造。",
      specs: [
        { name: "数字量输入", value: "8", unit: "路" },
        { name: "模拟量输入", value: "4", unit: "路" },
        { name: "级联数量", value: "32", unit: "台" },
        { name: "采样精度", value: "16", unit: "bit" },
        { name: "工作温度", value: "-10 ~ 55", unit: "℃" },
      ],
      highlights: ["单台即可改造一条老旧产线", "RS-485 总线级联 32 台", "16bit 采样精度"],
      models: ["DA-100", "DA-100P"],
      category: "数据采集器",
      image: "/assets/da-100.svg",
      availability: "https://schema.org/InStock",
    },
    {
      id: "dm-cloud",
      name: "DM 设备管理平台",
      summary: "面向多厂区统一运维的设备管理平台，单集群可管理 20000 台设备，支持私有化部署。",
      description:
        "DM 平台提供设备台账、远程参数下发、固件升级、异常告警与数据分析五大能力，支持单机与三节点高可用两种部署拓扑，可完全私有化部署在客户内网。",
      specs: [
        { name: "单机管理设备数", value: "20000", unit: "台" },
        { name: "部署拓扑", value: "单机 / 三节点高可用" },
        { name: "私有化支持", value: "支持" },
        { name: "标准连接器", value: "SAP、Oracle、用友、金蝶" },
      ],
      highlights: [
        "单集群管理 20000 台设备",
        "支持单机与三节点高可用",
        "可完全私有化部署在客户内网",
        "预置四套 ERP/MES 标准连接器",
      ],
      models: ["DM-Standard", "DM-HA"],
      category: "管理平台",
      image: "/assets/dm-cloud.svg",
      availability: "https://schema.org/InStock",
    },
  ],

  cases: [
    {
      id: "auto-parts-tier1",
      title: "汽车零部件 Tier 1 供应商产线联网改造",
      client: "某上市汽车零部件供应商",
      industry: "汽车零部件",
      challenge:
        "18 个车间共 1400 余台设备使用 6 种不同年代的总线协议，数据采集完整率仅 71%，无法支撑质量追溯。",
      solution:
        "部署 240 台 EG-200 边缘网关与 120 台 DA-100 采集器，统一接入 DM 管理平台，并预置金蝶 ERP 连接器实现工单与设备状态联动。",
      results: [
        "数据采集完整率从 71% 提升至 99.2%",
        "质量追溯查询响应时间从 3 天缩短至 4 分钟",
        "设备故障平均响应时间从 4 小时缩短至 25 分钟",
      ],
      date: "2026-03",
      tags: ["设备联网", "数据采集", "MES 对接"],
    },
    {
      id: "lithium-cell-factory",
      title: "锂电电芯工厂跨基地设备运维集中化",
      client: "某动力电池电芯制造商",
      industry: "新能源",
      challenge:
        "4 个生产基地分属不同 IT 系统，设备台账不统一，运维团队需要在 4 套系统间切换，巡检工作量庞大。",
      solution:
        "在 4 个基地各部署一套 DM 三节点高可用集群，通过专线接入统一运维门户，实现告警集中处置与固件批量下发。",
      results: [
        "人工巡检工作量下降 62%",
        "固件升级从人工逐台操作变为批量下发，耗时从 3 天降至 2 小时",
        "设备非计划停机时间同比下降 34%",
      ],
      date: "2026-07",
      tags: ["私有化部署", "高可用", "统一运维"],
    },
  ],

  insights: [
    {
      id: "proto-cols-in-plant",
      title: "工业现场协议选型的 5 个常见误区",
      summary:
        "很多项目在协议选型阶段就埋下隐患。本文基于 68 个工业物联网项目的部署复盘，总结 5 个高代价的常见误区。",
      body: [
        "在 68 个已交付项目中，我们统计到 41 个项目在协议选型阶段出现过返工，平均返工成本约为项目总额的 8%。",
        "最常见的误区是按设备说明书标称的协议选型，而不考虑实际现场的总线拓扑与终端电阻配置。",
        "第二个误区是忽略协议网关的转发延迟。在 1000 点规模下，未经优化的串行级联方案端到端延迟可达 3 秒。",
      ],
      date: "2026-09-12",
      author: "技术负责人 张工",
      tags: ["协议选型", "项目复盘", "工业物联网"],
      readingMinutes: 8,
    },
    {
      id: "device-firmware-rollback",
      title: "OTA 固件升级失败回滚：把 3 小时停机降到 0",
      summary:
        "工业设备的远程升级一旦失败，停机代价极高。本文介绍我们实现双分区固件与自动回滚的完整方案与实测数据。",
      body: [
        "我们对 320 台在线设备做过统计，未实现回滚机制时升级失败率约为 4.2%，其中 73% 会导致设备完全离线。",
        "采用 A/B 双分区与健康检查确认机制后，升级失败率降至 0.3%，且失败设备可在 90 秒内自动回滚到上一稳定版本。",
        "实现要点包括：固件包签名校验、升级前状态快照、升级后 5 分钟健康检查窗口，以及失败时的强制回滚。",
      ],
      date: "2026-10-08",
      author: "固件组 李工",
      tags: ["OTA", "固件升级", "可靠性"],
      readingMinutes: 11,
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

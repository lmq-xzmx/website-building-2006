# website-building · 智能 GEO 建站

为千行万业客户构建「AI 引擎友好」的企业站点 —— GEO 产品矩阵的入口。

**核心主张**：页面一半的读者是 AI 爬虫。我们同时优化两种读者—— 人要好看，AI 要好提（可抓取、可解析、可引用）。

## 当前能力

| 能力 | 状态 | 说明 |
|------|------|------|
| GEO 核心库（geo-kit） | ✅ | JSON-LD / llms.txt / robots+爬虫策略 / 体检评分 / 内容索引 / 行业包 / AI 文案 / 数字分身 / MCP |
| 通用企业骨架 | ✅ | 7 页型（Home/Products/Cases/Insights/About/FAQ/Contact）+ 文章详情，静态导出，JS 102KB |
| 骨架复用构建 | ✅ | 一个骨架 × N 个客户站，骨架永远只有一份 |
| 行业内容包 | ✅ | 2 个内置包（工业物联网 / 企业软件 SaaS），可扩展 |
| GEO 体检 | ✅ | 单页 + 站级两档，A–G 七维，输出根因诊断与修复建议 |
| AI 文案生成 | ✅ | 提示词内置 GEO 写作规则，生成即符合可引用性 |
| 数字分身 | ✅ | 静态知识库 + 关键词检索，无向量库依赖 |
| 询盘 → CRM | ✅ | 契约对齐 geo-platform CRM，带重试与降级 |
| 站点 MCP 端点 | ✅ | 12 个工具，静态清单可托管 |
| 知识库同步 | ✅ | 只读接入 geo-knowledge，按同步状态筛选（冲突条目不发） |
| **内容后台** | ✅ | 从知识库挑内容 → 定槽位/排序/定稿 → 发布。手写内容永不被覆盖 |
| CI 流水线 | ✅ | typecheck + test + 构建 + GEO 产物校验 |

**实测**：SaaS 示例站 GEO 站级体检 **95/100（A 级）**，9 项站级检查全通过。

## 目录

```
packages/geo-kit/     # 核心库（框架无关，不 import 任何 React/Astro API）
templates/corporate/  # 通用企业骨架（页面层 + 默认内容）
sites/demo-saas/      # 示例客户站（SaaS 行业，复用同一骨架）
apps/admin/           # 内容后台（从知识库组织内容）
scripts/build-site.mjs# 骨架复用构建
scripts/run-admin.sh  # 启动内容后台
docs/                 # 架构决策与部署文档
reference/            # 外部参考项目（gitignore，不进产品代码）
```

## 常用命令

```bash
pnpm install

# 生成 GEO 产物（robots/llms/sitemap/JSON-LD/索引/知识库/MCP 清单）
pnpm --filter @geokit/site-corporate geo:generate

# 构建（骨架站 / 客户站）
pnpm --filter @geokit/site-corporate build
pnpm --filter @geokit/site-demo-saas build

# 内容后台（http://127.0.0.1:5105）
scripts/run-admin.sh

# GEO 体检
node packages/geo-kit/dist/cli.js audit http://localhost:5102 \
  --content sites/demo-saas/content/site.ts --full

# AI 文案初稿（需要 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL）
node packages/geo-kit/dist/cli.js copy sites/demo-saas/content/site.ts --out /tmp/draft.ts

# 数字分身检索问答
node packages/geo-kit/dist/cli.js ask sites/demo-saas/content/site.ts "EG-200 能采集多少数据点"
```

## 文档

- [00 产品定位与架构决策](docs/00-产品定位与架构决策.md) — ADR-000
- [01 geo-kit 检查项矩阵设计](docs/01-geo-kit-检查项矩阵设计.md) — 三方方法论融合
- [02 agent-ready 扩展方案](docs/02-agent-ready-扩展方案.md) — ADR-002（MCP/WebMCP）
- [03 部署与数据闭环](docs/03-部署与数据闭环.md) — 运维形态与契约
- [04 端口登记申请](docs/04-端口登记申请.md) — 5100-5109 / 3100-3109
- [05 内容后台](docs/05-内容后台.md) — 知识库 → 网站内容的编排链路

## 与 GEO 矩阵的关系

```
本站(GEO-ready 载体) → GEO-Flow(分发) → GEO-Monitor(监测) → CRM(线索)
```

# website-building · 智能 GEO 建站

为千行万业客户构建「AI 引擎友好」的企业站点 —— GEO 产品矩阵的入口。

**核心主张**：页面一半的读者是 AI 爬虫。我们同时优化两种读者——人要好看，AI 要好提（可抓取、可解析、可引用）。

- 产品定位与全部架构决策：[docs/00-产品定位与架构决策.md](docs/00-产品定位与架构决策.md)
- 技术栈：geo-kit（框架无关核心库）+ Next.js 15 模板先行，Astro 后置
- 部署：纯静态导出，构建管道负责更新

## 规划结构（Phase 0 落地）

```
packages/geo-kit/     # JSON-LD 生成器 / llms.txt / GEO 体检评分 / AI 爬虫策略
templates/corporate/  # 通用企业骨架（Home/Products/Cases/About/Contact/Insights/FAQ）
sites/                # 客户站实例（内容包 = TS 配置）
```

## 与 GEO 矩阵的关系

```
本站(GEO-ready 载体) → GEO-Flow(分发) → GEO-Monitor(监测) → CRM(线索)
```

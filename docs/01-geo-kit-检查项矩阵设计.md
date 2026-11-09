# geo-kit 检查项矩阵设计

> 来源：外部方法论调研（2026-11-04）+ 本地 geo-platform 既有能力盘点
> 参考仓库：`reference/geo-optimizer-skill`（MIT）、`reference/GEORank`（Apache-2.0）—— **仅供查阅，不进产品代码、不提交 git**
> 状态：设计稿，Phase 0 实施依据

---

## 1. 为什么要这份对照表

geo-kit 的「GEO 体检」不是从零发明，而是**三份来源的融合**：

| 来源 | 贡献 | 归属 |
|---|---|---|
| 本地 `geo-platform/apps/geo-knowledge/internal/audit/` | A–F 六维评分骨架、权重机制、根因诊断、中英文市场分 | **移植+扩展**（现有针对素材/文章，需补站点维度） |
| `geo-optimizer-skill`（MIT） | 9 类评分权重表、27 个 AI 爬虫清单、**可引用性 14 方法（含影响力百分比与论文依据）** | **方法论借鉴**（检查项清单） |
| `GEORank`（Apache-2.0） | 中文市场检查项、中文诊断建议话术、私有化部署运维形态 | **中文市场借鉴** |

**关键缺口**：`geo-optimizer-skill` 全库检索 `baidu|zh-CN|china|中国` **零命中** —— 它只面向海外 AI 引擎。国内客户必须靠 GEORank 补齐中文维度。这是两者都必须 clone 的原因。

---

## 2. 评分维度融合方案

### 2.1 geo-optimizer v2 权重表（100 分，9 类）

```
google_ai      20   schema          14   content         14   brand_entity   12
meta           11   robots          14   llms             6   signals         6
ai_discovery    3
```

另设**不计分的特殊类**：
- `blockers` —— CDN/WAF 拦截、需 JS 渲染才出内容、提示词注入、UGC 注入风险
- `other` —— 非关键 UGC 建议、负面信号、WebMCP、多模态、审计失败路径

### 2.2 GEORank 权重（4 类）

```
schema 0.3   content 0.3   meta 0.2   citation 0.2
```

### 2.3 本地 geo-knowledge A–F 六维

```
DimA AI爬虫准入   DimB AI发现文件   DimC 结构化数据
DimD 内容可抽取性   DimE 内容结构     DimF 信任与权威
```

### 2.4 融合决策

**保留本地六维作为主骨架**（已有权重/partial/pass/fail 机制与根因诊断，不必重造），把外部两套的检查项**映射进六维**：

| 本地维度 | 吸收的外部检查项 |
|---|---|
| DimA AI爬虫准入 | geo-optimizer `robots`(14) + `ai_discovery`(3) + blockers；**补中文引擎**（百度/搜狗/360/头条/神马） |
| DimB AI发现文件 | geo-optimizer `llms`(6)（llms.txt / llms-full.txt / blockquote / sections / links / depth）；**GEORank 的中文 llms.txt 实践** |
| DimC 结构化数据 | geo-optimizer `schema`(14)（any_valid / richness / FAQPage / Article / Organization / WebSite / sameAs / visible_match） |
| DimD 内容可抽取性 | geo-optimizer `content`(14) + **可引用性 14 方法**（见 §3） |
| DimE 内容结构 | geo-optimizer `meta`(11) + `signals`(6) + `brand_entity`(12)；GEORank 的 H1 数量/og:image/meta description 长度（中文建议话术） |
| DimF 信任与权威 | `trust_stack.py` 的技术信任层（HTTPS/HSTS/CSP）+ `citation`(0.2) |

**GEORank 的 4 类权重不直接采用** —— 它太粗（4 类），本地六维粒度更细。采用其**检查项与中文话术**。

---

## 3. 可引用性方法清单（DimD 的核心，外部最高价值资产）

来自 `geo-optimizer-skill/src/geo_optimizer/core/citability.py`，每项标注**影响力百分比**，部分标注论文依据。这套清单是**外部唯一有研究支撑的可引用性方法论**：

| 方法 | 影响力 | 说明 |
|---|---|---|
| Quotation Addition | +41% | 段落含直接引语（AI 更易整段引用） |
| Statistics Addition | +33% | 含具体数字 |
| Fluency Optimization | +29% | 表达流畅度 |
| Cite Sources | +27% | 引用来源/出处 |
| **Answer-First Structure** | **+25%** | **结论先行**（依据 AutoGEO, arXiv:2510.11438） |
| Passage Density | +23% | 段落信息密度 |
| Technical Terms | +18% | 术语使用 |
| Authoritative Tone | +16% | 权威语气 |
| Readability Score | +15% | 可读性 |
| Citability Density | +15% | 可引用性密度 |
| Easy-to-Understand | +14% | 易懂度 |
| FAQ-in-Content | +12% | 正文内嵌 FAQ |
| Content Freshness | +10% | 内容新鲜度 |
| Image Alt Quality | +8% | 图片 alt 质量 |
| Unique Words | +7% | 用词多样性 |
| **No Keyword Stuffing** | **−9%** | **负向信号**（堆砌会扣分） |

**这与 ADR-000 的「可引用性（quotable）」主张完全对应** —— 本地 geo-knowledge 的评分器尚未覆盖这 14 项，是 geo-kit 的实质增量。

---

## 4. AI 爬虫清单（DimA 依据）

`geo-optimizer-skill/references/ai-bots-list.md` 的 27 个 UA，按用途分四类。**DIM-A 的关键区分是「训练 vs 检索」**：

| 类型 | 用途 | GEO 优先级 | UA |
|---|---|---|---|
| **Search** | 答案引擎检索，**决定是否被引用** | 🔴 CRITICAL | `OAI-SearchBot`、`Claude-SearchBot`、`PerplexityBot` |
| **On-demand** | 用户提问时实时抓取 | ⭐⭐⭐ | `ChatGPT-User`、`Claude-User`、`Perplexity-User`、`meta-externalagent`、`Applebot-Extended`、`DuckAssistBot` |
| **Training** | 模型训练，**不影响引用** | ⚠️ 仅训练 | `GPTBot`、`ClaudeBot`、`CCBot`、`Google-Extended`、`anthropic-ai`、`Bytespider`、`Amazonbot`、`AI2Bot`、`Googlebot`、`Bingbot` |
| **指令** | 行为控制指令 | — | `nosnippet`（禁止摘要）、`max-snippet`（限制摘要长度）、`claude-web` |

**geo-kit 的落地要求**：
- `robots.txt` 策略要**按类型区分** —— 常见错误是一刀切禁掉 `GPTBot`（无引用收益却失去训练收录），正确做法是**放行 Search + On-demand，按需屏蔽 Training**
- 记录「训练型放行 / 屏蔽」为显式配置项，而非隐式默认

**中文引擎需补**（geo-optimizer 没有，GEORank 有相关实践）：百度、搜狗、360、神马、头条 —— 但需注意：国内主流引擎对 GEO 结构化数据的支持程度需实测，不能照搬海外权重。

---

## 5. geo-kit 检查项矩阵（实施用）

### DimA — AI 爬虫准入
| 检查项 | 来源 | 权重档 |
|---|---|---|
| robots.txt 存在且可解析 | geo-optimizer `robots_found` | 高 |
| robots 允许 Search 型爬虫 | geo-optimizer `robots_citation_ok` | **高** |
| robots 对 Training 型策略显式声明 | 本项目新增 | 中 |
| 无 CDN/WAF 拦截（`blockers`） | geo-optimizer | **高** |
| 内容无需 JS 渲染（`blockers`） | geo-optimizer | **高** |
| 中文引擎准入（百度/搜狗/360） | GEORank | 中 |

### DimB — AI 发现文件
| 检查项 | 来源 |
|---|---|
| llms.txt 存在 | geo-optimizer `llms_found` |
| llms.txt 含 blockquote 区块 | `llms_blockquote` |
| llms.txt 有 sections 结构 | `llms_sections` |
| llms.txt 含链接 | `llms_links` |
| llms.txt 深度（词数 ≥ 阈值 / 高阈值） | `llms_depth` / `llms_depth_high` |
| llms-full.txt 存在 | `llms_full` |

### DimC — 结构化数据
| 检查项 | 来源 |
|---|---|
| 存在任一合法 JSON-LD | `schema_any_valid` |
| Schema 丰富度 | `schema_richness` |
| FAQPage（FAQ 页必需） | `schema_faq` |
| Article/BlogPosting（文章页必需） | `schema_article` |
| Organization（企业站必需） | `schema_organization` |
| WebSite | `schema_website` |
| sameAs 社交账号关联 | `schema_sameas` |
| Schema 与可见内容一致 | `schema_visible_match` |
| **无提示词注入内容**（`blockers`） | geo-optimizer `injection_detector` |

### DimD — 内容可抽取性
| 检查项 | 来源 |
|---|---|
| 答案先行结构 | citability +25% |
| 段落含引用/数字 | citability +27%/+33% |
| 段落密度 | citability +23% |
| 可读性 | citability +15% |
| FAQ 内嵌正文 | citability +12% |
| 无关键词堆砌 | citability −9% |
| 术语使用 | citability +18% |
| 内容新鲜度 | citability +10% |

### DimE — 内容结构
| 检查项 | 来源 |
|---|---|
| title 存在且长度合理 | geo-optimizer `meta_title` |
| meta description（中文建议 150–160 字符） | GEORank |
| canonical 存在 | geo-optimizer `has_canonical` |
| og:image（1200×630） | GEORank |
| H1 唯一 | GEORank |
| 语言声明 / RSS / 新鲜度信号 | geo-optimizer `signals` |
| 品牌实体一致性 | geo-optimizer `brand_entity` |

### DimF — 信任与权威
| 检查项 | 来源 |
|---|---|
| HTTPS + HSTS + CSP 等安全头 | `trust_stack.py` |
| 引述来源（citation） | GEORank `citation` |
| 作者/主体权威语气 | citability +16% |
| 信任信号堆栈 | `trust_stack.py` |

---

## 6. 实施待决

- [ ] 本地六维的**权重重新分配**（吸收外部项后，各维权重是否等比缩放）
- [ ] 可引用性 14 方法的**算法实现成本**：多数是正则/LLM 判定，Phase 1 的实现优先级排序
- [ ] 中文引擎检查项的**实测校准** —— 国内引擎对 JSON-LD/llms.txt 的实际读取行为需验证，不能照搬
- [ ] DimA 的 robots 策略**默认配置**：训练型默认放行还是屏蔽（需产品决策，影响面大）
- [ ] 站点级评分与素材级评分（GEO-Knowledge 现有）的**结果如何合并/展示**

---

## 7. 参考位置

| 资料 | 路径（`reference/` 内，不提交 git） |
|---|---|
| 评分类别权重表 | `geo-optimizer-skill/src/geo_optimizer/models/config.py:714` |
| 可引用性方法 | `geo-optimizer-skill/src/geo_optimizer/core/citability.py` |
| 评分实现 | `geo-optimizer-skill/src/geo_optimizer/core/scoring.py` |
| AI 爬虫清单 | `geo-optimizer-skill/references/ai-bots-list.md` |
| 注入检测 | `geo-optimizer-skill/src/geo_optimizer/core/injection_detector.py` |
| 信任信号堆栈 | `geo-optimizer-skill/src/geo_optimizer/core/trust_stack.py` |
| 中文诊断规则 | `GEORank/backend/app/tasks/diagnose.py` |
| 中文建议话术 | `GEORank/backend/app/tasks/diagnose.py:517+` |
| 本地既有评分器 | `geo-platform/apps/geo-knowledge/backend/internal/audit/` |

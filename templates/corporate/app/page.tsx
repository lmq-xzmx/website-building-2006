import type { Metadata } from "next";
import Link from "next/link";

import { site } from "@/content/site";
import { getSection } from "./geo";

/**
 * 首页 —— 骨架的「答案先行」示范。
 *
 * GEO 写作原则落到结构上：
 *   1. H1 就是一句定位（AI 直接摘这一句）
 *   2. 首段给结论 + 具体数字（Statistics Addition +33%）
 *   3. 要点列表化（Passage Density +23%）
 *   4. 每块内容自带小标题，段落自包含
 */

export const metadata: Metadata = {
  title: `${site.name} | ${site.organization.industry ?? "工业物联网"}`,
  // 每页必须有**自己的** description —— 多页共用一份会让 AI 无法区分页面实体，
  // 这是 GEO 体检 E3 检查项要抓的问题。
  description: getSection("home")?.subtitle ?? site.description,
  alternates: { canonical: "/" },
};

export default function HomePage() {
  const home = getSection("home")!;
  const products = site.products ?? [];
  const cases = site.cases ?? [];
  const insights = site.insights ?? [];

  return (
    <>
      {/* ── 英雄区：H1 = 定位句 ── */}
      <section className="hero">
        <div className="container hero-split">
          <div>
            <h1>{home.title}</h1>
            {home.subtitle && <p className="lead">{home.subtitle}</p>}

            {home.bullets && home.bullets.length > 0 && (
              <ul className="bullets">
                {home.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}

            {home.cta && (
              <div className="cta-row">
                <Link href={home.cta.href} className="btn btn-primary btn-lg">
                  {home.cta.label}
                </Link>
                {home.cta.secondary && (
                  <Link href={home.cta.secondary.href} className="btn btn-outline btn-lg">
                    {home.cta.secondary.label}
                  </Link>
                )}
              </div>
            )}
          </div>

          {home.images && home.images.length > 0 && (
            <div className="hero-visual">
              {/* 客户站的图片走自己的 CDN；这里用普通 img 而非 next/image，
                  因为静态导出下 next/image 需自定义 loader */}
              <img src={home.images[0]} alt="" width={640} height={480} />
            </div>
          )}
        </div>
      </section>

      {/* ── 数据条：量化数字 ──
          双重价值：转化上给人「有实力」的第一印象；
          GEO 上是 AI 最爱引用的结构（Statistics Addition +33%）。

          只在**真的是「数字 + 指标名」**时才拆成大字 + 小字。
          「支持 Modbus、OPC UA、Profinet 三大协议」虽然以「支持」开头，
          但没有数值，不该被当成数据条 —— 大字显示协议名很荒唐。

          判据：整条 bullet 必须**以数值开头**（允许前置中文动词如「已服务」）。
          否则整条作为标签显示，数值列为空。 */}
      {home.bullets && home.bullets.length > 0 && (
        <section className="section-tight">
          <div className="container">
            <div className="stat-strip">
              {home.bullets.slice(0, 4).map((b) => {
                // 数值 + 单位。单位只允许**单个**中文单位字或符号，
                // 否则「12 款工业采集设备」会把「工业采」当单位截断。
                const UNIT = "[%‰]|个|台|条|款|家|人|位|项|套|次|万|亿|年|月|日|天|小时|分钟|秒|元|美元|倍|米|平方米|吨|kg";
                // 两种写法都支持：
                //   句首式：「320 家 制造企业已上线」
                //   句尾式：「单集群实测可用性 99.95%」
                const m = b.match(
                  new RegExp(`^(?:已|共|累计|超过|近|逾)?\\s*(\\d[\\d.,]*\\s*(?:${UNIT})?)\\s*[，,、]?\\s*(.*)$`),
                );
                const mTail = b.match(
                  new RegExp(`^(.*?)\\s*(\\d[\\d.,]*\\s*(?:${UNIT})?)\\s*[。.]?$`),
                );
                let value = "";
                let label = b;
                if (m) {
                  value = m[1].trim();
                  label = m[2].trim() || b;
                } else if (mTail) {
                  value = mTail[2].trim();
                  label = mTail[1].trim();
                }
                return (
                  <div className="stat" key={b}>
                    {value ? (
                      <>
                        <span className="stat-value">{value}</span>
                        <span className="stat-label">{label}</span>
                      </>
                    ) : (
                      <span className="stat-label">{label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── 定位正文：首段结论先行 ──
          注意：不要给同一个元素同时加 .container 与 .prose ——
          两者都设 max-width，.prose 的 72ch 会覆盖容器宽度，
          导致正文被挤成窄条。宽度约束取其一。 */}
      {home.body && home.body.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="prose">
              {home.body.map((p) => (
                <p key={p.slice(0, 32)}>{p}</p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 产品概览 ── */}
      {products.length > 0 && (
        <section className="section section-alt">
          <div className="container">
            <div className="section-head">
              <h2>产品与参数</h2>
              <p>
                {site.sections.find((s) => s.type === "products")?.subtitle ??
                  "以下为在售产品的完整技术参数。"}
              </p>
            </div>
            <div className="grid grid-3">
              {products.map((p) => (
                <article className="card" key={p.id}>
                  <h3>{p.name}</h3>
                  {p.summary && <p>{p.summary}</p>}
                  {p.highlights && (
                    <ul className="bullets">
                      {p.highlights.slice(0, 3).map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  )}
                  <Link href={`/products#${p.id}`} className="btn btn-outline">
                    查看完整参数
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 案例：量化结果最易被引用 ── */}
      {cases.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <h2>客户案例</h2>
              <p>{site.sections.find((s) => s.type === "cases")?.subtitle}</p>
            </div>
            <div className="grid grid-2">
              {cases.map((c) => (
                <article className="card" key={c.id}>
                  <h3>{c.title}</h3>
                  {c.challenge && <p>{c.challenge}</p>}
                  {c.results && (
                    <ul className="bullets">
                      {c.results.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 洞察 ── */}
      {insights.length > 0 && (
        <section className="section section-alt">
          <div className="container">
            <div className="section-head">
              <h2>洞察与文章</h2>
              <p>{site.sections.find((s) => s.type === "insights")?.subtitle}</p>
            </div>
            <div className="grid grid-2">
              {insights.map((a) => (
                <article className="card" key={a.id}>
                  <h3>
                    <Link href={`/insights/${a.id}`}>{a.title}</Link>
                  </h3>
                  {a.summary && <p>{a.summary}</p>}
                  <div className="article-meta">
                    {a.date && <span>{a.date}</span>}
                    {a.author && <span>{a.author}</span>}
                    {a.readingMinutes && <span>{a.readingMinutes} 分钟阅读</span>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ 摘要 ── */}
      {site.sections.some((s) => s.type === "faq") && (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <h2>常见问题</h2>
              <p>{site.sections.find((s) => s.type === "faq")?.subtitle}</p>
            </div>
            <FaqList limit={4} />
            <div className="cta-row">
              <Link href="/faq" className="btn btn-outline">
                查看全部问题
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/** FAQ 列表组件（首页与 /faq 页共用） */
export function FaqList({ limit }: { limit?: number }) {
  const items = site.sections.find((s) => s.type === "faq")?.faq ?? site.faq ?? [];
  const shown = limit ? items.slice(0, limit) : items;

  if (shown.length === 0) return null;

  return (
    <div className="faq-list">
      {shown.map((item) => (
        <div className="faq-item" key={item.question}>
          <h3>{item.question}</h3>
          <p>{item.answer}</p>
        </div>
      ))}
    </div>
  );
}

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
        <div className="container">
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
              <Link href={home.cta.href} className="btn btn-primary">
                {home.cta.label}
              </Link>
              {home.cta.secondary && (
                <Link href={home.cta.secondary.href} className="btn btn-outline">
                  {home.cta.secondary.label}
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── 定位正文：首段结论先行 ── */}
      {home.body && home.body.length > 0 && (
        <section className="section">
          <div className="container prose">
            {home.body.map((p) => (
              <p key={p.slice(0, 32)}>{p}</p>
            ))}
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

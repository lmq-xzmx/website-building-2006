import type { Metadata } from "next";

import { site } from "@/content/site";
import { getSection, pageDescription } from "../geo";

export const metadata: Metadata = {
  title: "客户案例",
  description: pageDescription("cases"),
  alternates: { canonical: "/cases/" },
};

/**
 * 案例页 —— 量化结果是最容易被 AI 引用的内容。
 *
 * 每条结果都是「指标 + 变化量」的完整表述，脱离上下文也能成立：
 *   ✅「数据采集完整率从 71% 提升至 99.2%」
 *   ❌「效果显著提升」
 */
export default function CasesPage() {
  const section = getSection("cases");
  const cases = site.cases ?? [];

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h1>{section?.title ?? "客户案例"}</h1>
          {section?.subtitle && <p>{section.subtitle}</p>}
        </div>

        {section?.body?.map((p) => (
          <div className="prose" key={p.slice(0, 32)}>
            <p>{p}</p>
          </div>
        ))}

        <div className="grid grid-2">
          {cases.map((c) => (
            <article className="card" key={c.id}>
              <h2>{c.title}</h2>
              {c.client && <p>客户：{c.client}</p>}

              {c.challenge && (
                <>
                  <h3>面临的问题</h3>
                  <p>{c.challenge}</p>
                </>
              )}

              {c.solution && (
                <>
                  <h3>解决方案</h3>
                  <p>{c.solution}</p>
                </>
              )}

              {c.results && c.results.length > 0 && (
                <>
                  <h3>量化结果</h3>
                  <ul className="bullets">
                    {c.results.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </>
              )}

              <div className="article-meta">
                {c.industry && <span className="tag">{c.industry}</span>}
                {c.date && <span>{c.date}</span>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

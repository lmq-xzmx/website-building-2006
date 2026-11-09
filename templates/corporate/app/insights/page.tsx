import type { Metadata } from "next";
import Link from "next/link";

import { site } from "@/content/site";
import { getSection, pageDescription } from "../geo";

export const metadata: Metadata = {
  title: "洞察与文章",
  description: pageDescription("insights"),
  alternates: { canonical: "/insights/" },
};

/** 洞察列表页 */
export default function InsightsPage() {
  const section = getSection("insights");
  const insights = site.insights ?? [];

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h1>{section?.title ?? "洞察与文章"}</h1>
          {section?.subtitle && <p>{section.subtitle}</p>}
        </div>

        {section?.body?.map((p) => (
          <div className="prose" key={p.slice(0, 32)}>
            <p>{p}</p>
          </div>
        ))}

        <div className="grid grid-2">
          {insights.map((a) => (
            <article className="card" key={a.id}>
              <h2>
                <Link href={`/insights/${a.id}`}>{a.title}</Link>
              </h2>
              {a.summary && <p>{a.summary}</p>}
              <div className="article-meta">
                {a.date && <span>{a.date}</span>}
                {a.author && <span>{a.author}</span>}
                {a.readingMinutes && <span>{a.readingMinutes} 分钟阅读</span>}
              </div>
              {a.tags && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  {a.tags.map((t) => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { site } from "@/content/site";

/** 静态导出必需：枚举全部文章路由 */
export function generateStaticParams() {
  return (site.insights ?? []).map((a) => ({ id: a.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const article = site.insights?.find((a) => a.id === id);
  if (!article) return {};

  return {
    title: article.title,
    description: article.summary ?? article.title,
    alternates: { canonical: `/insights/${article.id}/` },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.summary,
      publishedTime: article.date,
      authors: article.author ? [article.author] : undefined,
      tags: article.tags,
    },
  };
}

/** 文章详情页 */
export default async function InsightPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const article = site.insights?.find((a) => a.id === id);
  if (!article) notFound();

  return (
    <section className="section">
      <div className="container">
        <article className="article-body">
          <h1>{article.title}</h1>
          <div className="article-meta">
            {article.date && <span>{article.date}</span>}
            {article.author && <span>{article.author}</span>}
            {article.readingMinutes && <span>{article.readingMinutes} 分钟阅读</span>}
          </div>

          {article.summary && <p className="lead">{article.summary}</p>}

          {article.body?.map((p) => (
            <p key={p.slice(0, 32)}>{p}</p>
          ))}

          {article.tags && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 32 }}>
              {article.tags.map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </article>

        <div className="cta-row">
          <Link href="/insights" className="btn btn-outline">
            返回洞察列表
          </Link>
          <Link href="/contact" className="btn btn-primary">
            获取完整白皮书
          </Link>
        </div>
      </div>
    </section>
  );
}

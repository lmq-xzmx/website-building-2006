import Link from "next/link";

import { docToHtml } from "@geokit/geo-kit";
import type { ContentItem, ContentModule, PageContent } from "@geokit/geo-kit";

/**
 * 模块渲染器 —— 把后台编排出来的模块渲染成页面区块。
 *
 * 为什么单独一个文件：
 *   固定页型（home/products/cases...）是**骨架写死**的路由，
 *   而模块编排出来的页面是**后台自由组合**的 —— 两套渲染逻辑必须并存，
 *   但共用同一套 CSS 与 GEO 语义。
 *
 * GEO 约束（照抄固定页型的规矩）：
 *   - 每个模块有标题，且**标题自包含**（AI 摘一段要知道它在讲什么）
 *   - 正文段落是纯文本，可被精确引用
 *   - 卡片有摘要，不要只留标题
 */

export function ModuleRenderer({ page }: { page: PageContent }) {
  return (
    <>
      {page.modules.map((module) => (
        <ModuleBlock key={module.id} module={module} />
      ))}
    </>
  );
}

function ModuleBlock({ module }: { module: ContentModule }) {
  switch (module.type) {
    case "hero":
      return <HeroModule module={module} />;
    case "rich-text":
      return <RichTextModule module={module} />;
    case "card-grid":
      return <CardGridModule module={module} />;
    case "faq":
      return <FaqModule module={module} />;
    case "stats":
      return <StatsModule module={module} />;
    case "cta":
      return <CtaModule module={module} />;
    case "gallery":
      return <GalleryModule module={module} />;
    default:
      return null;
  }
}

/** 模块级标题 —— 抽成组件，保证每个模块都有自包含的标题 */
function ModuleHead({
  module,
  level = 2,
}: {
  module: ContentModule;
  level?: 2 | 3;
}) {
  if (!module.title && !module.subtitle) return null;
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className="section-head">
      {module.title && <H>{module.title}</H>}
      {module.subtitle && <p>{module.subtitle}</p>}
    </div>
  );
}

/** 富文本正文 —— HTML 由 geo-kit 生成（同一套语义，后台预览与站点一致） */
function RichTextBlock({ item }: { item: ContentItem }) {
  const html = docToHtml(item.body);
  if (!html) return null;
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

function HeroModule({ module }: { module: ContentModule }) {
  const item = module.items[0];
  if (!item) return null;
  return (
    <section className="hero">
      <div className="container hero-split">
        <div>
          {item.title && <h1>{item.title}</h1>}
          {item.summary && <p className="lead">{item.summary}</p>}
          {item.body && docToHtml(item.body) && (
            <div
              className="prose"
              dangerouslySetInnerHTML={{ __html: docToHtml(item.body) }}
            />
          )}
        </div>
        {item.image && (
          <div className="hero-visual">
            <img src={item.image} alt="" width={640} height={480} />
          </div>
        )}
      </div>
    </section>
  );
}

function RichTextModule({ module }: { module: ContentModule }) {
  if (!module.items.length) return null;
  return (
    <section className="section">
      <div className="container">
        <ModuleHead module={module} />
        {module.items.map((item) => (
          <article key={item.id} style={{ marginBottom: 20 }}>
            {item.title && <h3>{item.title}</h3>}
            <RichTextBlock item={item} />
          </article>
        ))}
      </div>
    </section>
  );
}

function CardGridModule({ module }: { module: ContentModule }) {
  if (!module.items.length) return null;
  const kind = String(module.props?.kind ?? "generic");

  return (
    <section className="section section-alt">
      <div className="container">
        <ModuleHead module={module} />
        <div className="grid grid-3">
          {module.items.map((item) => (
            <article className="card" key={item.id}>
              {item.image && (
                <img
                  src={item.image}
                  alt=""
                  width={480}
                  height={270}
                  style={{ width: "100%", height: "auto", marginBottom: 10 }}
                />
              )}
              <h3>{item.title}</h3>
              {item.client && (
                <p className="article-meta">
                  <span>客户：{item.client}</span>
                </p>
              )}
              {item.summary && <p>{item.summary}</p>}
              {item.results && item.results.length > 0 && (
                <ul className="bullets">
                  {item.results.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              {item.specs && item.specs.length > 0 && (
                <table className="spec-table">
                  <tbody>
                    {item.specs.map((s) => (
                      <tr key={s.name}>
                        <th scope="row">{s.name}</th>
                        <td>
                          {s.value}
                          {s.unit ? ` ${s.unit}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqModule({ module }: { module: ContentModule }) {
  if (!module.items.length) return null;
  return (
    <section className="section">
      <div className="container">
        <ModuleHead module={module} />
        <div className="faq-list">
          {module.items.map((item) => (
            <div className="faq-item" key={item.id}>
              <h3>{item.question ?? item.title}</h3>
              {item.answer && <p>{item.answer}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsModule({ module }: { module: ContentModule }) {
  if (!module.items.length) return null;
  return (
    <section className="section-tight">
      <div className="container">
        {module.title && (
          <div className="section-head">
            <h2>{module.title}</h2>
          </div>
        )}
        <div className="stat-strip">
          {module.items.map((item) => (
            <div className="stat" key={item.id}>
              {item.value && (
                <span className="stat-value">
                  {item.value}
                  {item.unit ? ` ${item.unit}` : ""}
                </span>
              )}
              {item.label && <span className="stat-label">{item.label}</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaModule({ module }: { module: ContentModule }) {
  const item = module.items[0];
  if (!item) return null;
  return (
    <section className="section">
      <div className="container">
        <div className="cta-box">
          <h2>{item.title}</h2>
          {item.summary && <p>{item.summary}</p>}
          {item.href && (
            <div className="cta-row">
              <Link href={item.href} className="btn btn-primary btn-lg">
                {item.label ?? "了解更多"}
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function GalleryModule({ module }: { module: ContentModule }) {
  const images = module.items
    .map((i) => i.image)
    .filter((x): x is string => Boolean(x));
  if (!images.length) return null;
  return (
    <section className="section">
      <div className="container">
        <ModuleHead module={module} />
        <div className="grid grid-3">
          {images.map((src, i) => (
            <img
              key={src + i}
              src={src}
              alt=""
              width={400}
              height={300}
              style={{ width: "100%", height: "auto" }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

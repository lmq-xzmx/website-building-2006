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
    case "trust":
      return <TrustModule module={module} />;
    case "logo-wall":
      return <LogoWallModule module={module} />;
    case "process":
      return <ProcessModule module={module} />;
    case "form":
      return <FormModule module={module} />;
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
  // 带 alt —— 图片缺替代文本是最常见的可访问性与 SEO 硬伤
  const images = module.items
    .filter((i) => Boolean(i.image))
    .map((i) => ({ src: i.image as string, alt: i.alt ?? i.title ?? "" }));
  if (!images.length) return null;
  return (
    <section className="section">
      <div className="container">
        <ModuleHead module={module} />
        <div className="grid grid-3">
          {images.map((img, i) => (
            <img
              key={img.src + i}
              src={img.src}
              alt={img.alt}
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

/**
 * 信任背书 —— 资质认证 / 合作客户 / 数据证明。
 *
 * 为什么单独一个模块而不是塞进 card-grid：
 *   信任证据的**形态**和卡片不一样 —— 它要「图 + 一句结论」成对出现，
 *   混在产品卡片里会被当成普通卖点，读者不会当成证据。
 */
function TrustModule({ module }: { module: ContentModule }) {
  if (!module.items.length) return null;
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
                  alt={item.alt ?? item.title ?? ""}
                  width={480}
                  height={270}
                  style={{ width: "100%", height: "auto", marginBottom: 10 }}
                />
              )}
              <h3>{item.title}</h3>
              {item.caption && <p className="form-note">{item.caption}</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 客户 logo 墙 —— 别人替我说话，比自己说「行业领先」有用。
 *
 * alt 一律写客户名 —— logo 本身对屏幕阅读器只是一张图，
 * 没有 alt 就等于这张墙对辅助技术完全不存在。
 */
function LogoWallModule({ module }: { module: ContentModule }) {
  const logos = module.items.filter((item) => item.image);
  if (!logos.length) return null;
  return (
    <section className="section-tight">
      <div className="container">
        <ModuleHead module={module} />
        <div className="logo-wall">
          {logos.map((item) => (
            <img
              className="logo-item"
              key={item.id}
              src={item.image}
              alt={item.alt ?? item.title ?? ""}
              width={160}
              height={40}
              loading="lazy"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 流程步骤 —— 「我们怎么和你合作」。
 *
 * 步骤序号是核心信息 —— 用户买服务时最想知道的是要经过哪几步，
 * 所以序号显式渲染成徽标，而不是靠 <ol> 的默认样式（会被主题覆盖）。
 */
function ProcessModule({ module }: { module: ContentModule }) {
  if (!module.items.length) return null;
  return (
    <section className="section">
      <div className="container">
        <ModuleHead module={module} />
        <ol className="process-list">
          {module.items.map((item, i) => (
            <li className="process-step" key={item.id}>
              <span className="process-num">{item.step ?? i + 1}</span>
              <div>
                <h3>{item.title}</h3>
                {item.summary && <p>{item.summary}</p>}
                {item.body && docToHtml(item.body) && (
                  <div
                    className="prose"
                    dangerouslySetInnerHTML={{ __html: docToHtml(item.body) }}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** 表单字段定义 —— 与 geo-kit 的 FormFieldDef 同形 */
type FormField = {
  name: string;
  label: string;
  type?: "text" | "tel" | "email" | "url" | "textarea" | "select";
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

/**
 * 零摩擦表单 —— 字段定义在模块 props，条目只说明「提交之后会怎样」。
 *
 * 为什么不复用联系页那个表单组件：
 *   那个是**客户端**组件（要 fetch 外部端点），而模块渲染是服务端渲染；
 *   这里用原生 form 提交，action 指向外部端点即可 ——
 *   静态站没有服务端路由，原生提交是唯一不依赖 JS 的路径。
 */
function FormModule({ module }: { module: ContentModule }) {
  const fields = (Array.isArray(module.props?.fields) ? module.props.fields : []) as FormField[];
  if (!fields.length) return null;
  const action = typeof module.props?.action === "string" ? module.props.action : "";
  const submitLabel =
    typeof module.props?.submitLabel === "string" ? module.props.submitLabel : "提交";

  return (
    <section className="section">
      <div className="container">
        <ModuleHead module={module} />
        <form className="inquiry-form" method="post" action={action || undefined}>
          {fields.map((f) => (
            <div className="field" key={f.name}>
              <label htmlFor={`ux-field-${f.name}`}>
                {f.label}
                {f.required ? " *" : ""}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  id={`ux-field-${f.name}`}
                  name={f.name}
                  required={f.required}
                  placeholder={f.placeholder}
                />
              ) : f.type === "select" ? (
                <select
                  id={`ux-field-${f.name}`}
                  name={f.name}
                  required={f.required}
                  defaultValue=""
                >
                  <option value="" disabled>
                    请选择
                  </option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`ux-field-${f.name}`}
                  name={f.name}
                  type={f.type ?? "text"}
                  required={f.required}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}
          <div className="cta-row">
            <button type="submit" className="btn btn-primary btn-lg">
              {submitLabel}
            </button>
          </div>
          {/* 提交结果说明 —— 降低「提交之后呢」的犹豫 */}
          {module.items.map((item) => (
            <p className="form-note" key={item.id}>
              {item.title}
              {item.summary ? ` —— ${item.summary}` : ""}
            </p>
          ))}
        </form>
      </div>
    </section>
  );
}

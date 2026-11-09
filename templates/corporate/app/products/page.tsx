import type { Metadata } from "next";

import { site } from "@/content/site";
import { getSection, pageDescription } from "../geo";

export const metadata: Metadata = {
  title: "产品与参数",
  description: pageDescription("products"),
  alternates: { canonical: "/products/" },
};

/**
 * 产品页 —— GEO 价值最高的页型。
 *
 * 参数表是 AI 高频引用的结构：
 *   - 每行「参数名 = 数值」本身就是可独立引用的句子
 *   - 数值明确、带单位，不依赖上下文
 *   - 对应 Product Schema 的 additionalProperty
 */
export default function ProductsPage() {
  const section = getSection("products");
  const products = site.products ?? [];

  return (
    <>
      <section className="section">
        <div className="container">
          <div className="section-head">
            <h1>{section?.title ?? "产品与参数"}</h1>
            {section?.subtitle && <p>{section.subtitle}</p>}
          </div>

          {section?.body?.map((p) => (
            <div className="prose" key={p.slice(0, 32)}>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      {products.map((p) => (
        <section className="section section-alt" id={p.id} key={p.id}>
          <div className="container">
            <div className="section-head">
              <h2>{p.name}</h2>
              {p.summary && <p>{p.summary}</p>}
            </div>

            {p.description && (
              <div className="prose">
                <p>{p.description}</p>
              </div>
            )}

            {p.specs && p.specs.length > 0 && (
              <>
                <h3>技术参数</h3>
                <table className="spec-table">
                  <tbody>
                    {p.specs.map((spec) => (
                      <tr key={spec.name}>
                        <th scope="row">{spec.name}</th>
                        <td>
                          {spec.value}
                          {spec.unit ? ` ${spec.unit}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {p.highlights && p.highlights.length > 0 && (
              <>
                <h3>核心特性</h3>
                <ul className="bullets">
                  {p.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </>
            )}

            {p.models && p.models.length > 0 && (
              <>
                <h3>可选型号</h3>
                <p>{p.models.join(" · ")}</p>
              </>
            )}
          </div>
        </section>
      ))}
    </>
  );
}

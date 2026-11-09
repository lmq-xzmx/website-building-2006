import type { Metadata } from "next";

import { site } from "@/content/site";
import { getSection } from "../geo";
import { FaqList } from "../page";

export const metadata: Metadata = {
  title: "常见问题",
  alternates: { canonical: "/faq/" },
};

/**
 * FAQ 页 —— AI 最喜欢的格式。
 *
 * 每个问答都是「问题 + 直接答案」，答案自带数字与边界条件，
 * 可以脱离页面上下文被独立引用。
 */
export default function FaqPage() {
  const section = getSection("faq");

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h1>{section?.title ?? "常见问题"}</h1>
          {section?.subtitle && <p>{section.subtitle}</p>}
        </div>

        {section?.body?.map((p) => (
          <div className="prose" key={p.slice(0, 32)}>
            <p>{p}</p>
          </div>
        ))}

        <FaqList />
      </div>
    </section>
  );
}

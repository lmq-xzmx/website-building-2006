import type { Metadata } from "next";

import { site } from "@/content/site";
import { getSection } from "../geo";

export const metadata: Metadata = {
  title: "关于我们",
  alternates: { canonical: "/about/" },
};

/**
 * 关于页 —— 信任与权威信号的主要来源。
 *
 * 实体信号：成立年份、员工规模、覆盖范围、累计数据量。
 * 这些都是 Organization Schema 之外的「可见文本证据」——
 * AI 会用可见文本佐证 Schema 声明，两者一致才可信。
 */
export default function AboutPage() {
  const section = getSection("about");
  const org = site.organization;

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h1>{section?.title ?? "关于我们"}</h1>
          {section?.subtitle && <p>{section.subtitle}</p>}
        </div>

        {section?.body?.map((p) => (
          <div className="prose" key={p.slice(0, 32)}>
            <p>{p}</p>
          </div>
        ))}

        {section?.bullets && section.bullets.length > 0 && (
          <ul className="bullets">
            {section.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}

        {/* 实体信息表 —— 结构化 + 可见文本双通道 */}
        <table className="spec-table" style={{ marginTop: 32 }}>
          <tbody>
            {org.legalName && (
              <tr>
                <th scope="row">企业全称</th>
                <td>{org.legalName}</td>
              </tr>
            )}
            {org.foundingDate && (
              <tr>
                <th scope="row">成立时间</th>
                <td>{org.foundingDate}</td>
              </tr>
            )}
            {org.numberOfEmployees && (
              <tr>
                <th scope="row">员工规模</th>
                <td>{org.numberOfEmployees} 人</td>
              </tr>
            )}
            {org.industry && (
              <tr>
                <th scope="row">所属行业</th>
                <td>{org.industry}</td>
              </tr>
            )}
            {org.taxID && (
              <tr>
                <th scope="row">统一社会信用代码</th>
                <td>{org.taxID}</td>
              </tr>
            )}
            {org.address && (
              <tr>
                <th scope="row">地址</th>
                <td>
                  {org.address.addressLocality}
                  {org.address.addressRegion && org.address.addressRegion !== org.address.addressLocality
                    ? org.address.addressRegion
                    : ""}
                  {org.address.streetAddress}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

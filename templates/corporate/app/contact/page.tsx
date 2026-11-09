import type { Metadata } from "next";

import { site } from "@/content/site";
import { getSection } from "../geo";
import InquiryForm from "./inquiry-form";

export const metadata: Metadata = {
  title: "联系我们",
  alternates: { canonical: "/contact/" },
};

/** 联系页 —— 含询盘表单 */
export default function ContactPage() {
  const section = getSection("contact");
  const org = site.organization;
  const contact = site.contact;

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h1>{section?.title ?? "联系我们"}</h1>
          {section?.subtitle && <p>{section.subtitle}</p>}
        </div>

        {section?.body?.map((p) => (
          <div className="prose" key={p.slice(0, 32)}>
            <p>{p}</p>
          </div>
        ))}

        <div className="grid grid-2" style={{ marginTop: 40, alignItems: "start" }}>
          <div>
            <h2>联系信息</h2>
            <table className="spec-table">
              <tbody>
                {contact?.telephone && (
                  <tr>
                    <th scope="row">电话</th>
                    <td>
                      <a href={`tel:${contact.telephone.replace(/[^+\d]/g, "")}`}>
                        {contact.telephone}
                      </a>
                    </td>
                  </tr>
                )}
                {contact?.email && (
                  <tr>
                    <th scope="row">邮箱</th>
                    <td>
                      <a href={`mailto:${contact.email}`}>{contact.email}</a>
                    </td>
                  </tr>
                )}
                {org?.address && (
                  <tr>
                    <th scope="row">地址</th>
                    <td>
                      {org.address.addressLocality}
                      {org.address.streetAddress}
                      {org.address.postalCode ? `（${org.address.postalCode}）` : ""}
                    </td>
                  </tr>
                )}
                {org?.contactPoint?.telephone && (
                  <tr>
                    <th scope="row">销售直线</th>
                    <td>{org.contactPoint.telephone}</td>
                  </tr>
                )}
                {org?.contactPoint?.email && (
                  <tr>
                    <th scope="row">销售邮箱</th>
                    <td>{org.contactPoint.email}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div id="inquiry">
            <h2>提交询盘</h2>
            <InquiryForm endpoint={contact?.inquiryEndpoint} />
          </div>
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { site } from "@/content/site";
import { generateThemeCss, themeHtmlAttrs } from "@geokit/geo-kit";
import { JsonLdScripts } from "./geo";
import "./globals.css";

/**
 * 站点布局 —— 页头/页脚 + 全局 GEO 注入。
 *
 * metadata 生成遵循 GEO 原则：
 *   - title 用「品牌 + 定位」结构（AI 用作实体识别）
 *   - description 70–170 字符（GEORank 的中文实践）
 *   - canonical 指向自身（避免重复内容）
 *   - og:image 供社交与 AI 摘要预览
 */
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} | ${site.organization.industry ?? "工业物联网"}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: site.locale,
    url: site.url,
    siteName: site.name,
    title: `${site.name} | ${site.organization.industry ?? "工业物联网"}`,
    description: site.description,
    images: site.assets?.ogImage ? [{ url: site.assets.ogImage }] : undefined,
  },
  robots: {
    // 显式放行 AI 检索型爬虫 —— 与 robots.txt 策略一致
    index: true,
    follow: true,
  },
  icons: site.assets?.favicon ? { icon: site.assets.favicon } : undefined,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nav = site.navigation ?? [];
  // 主题 + 布局的属性合成到 html 标签上
  const themeAttrs = themeHtmlAttrs(site.theme);
  const themeCss = generateThemeCss(site.theme);

  return (
    <html lang={site.language ?? site.locale} {...themeAttrs}>
      <head>
        <JsonLdScripts />
        {themeCss && (
          <style
            id="geo-theme"
            dangerouslySetInnerHTML={{ __html: themeCss }}
          />
        )}
      </head>
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              <img src={site.assets?.logo ?? "/assets/logo.svg"} alt={site.name} width={140} height={32} />
              <span className="brand-name">{site.name}</span>
            </Link>
            <nav className="site-nav" aria-label="主导航">
              {nav.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
            <Link href="/contact" className="btn btn-primary header-cta">
              获取报价
            </Link>
          </div>
        </header>

        <main>{children}</main>

        <footer className="site-footer">
          <div className="container footer-grid">
            <div className="footer-brand">
              <img src={site.assets?.logo ?? "/assets/logo.svg"} alt={site.name} width={140} height={32} />
              <p>{site.description}</p>
            </div>
            <div className="footer-col">
              <h3>导航</h3>
              <ul>
                {nav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="footer-col">
              <h3>联系方式</h3>
              <ul>
                {site.contact?.telephone && <li>{site.contact.telephone}</li>}
                {site.contact?.email && <li>{site.contact.email}</li>}
                {site.organization?.address && (
                  <li>
                    {site.organization.address.addressLocality}
                    {site.organization.address.streetAddress}
                  </li>
                )}
              </ul>
            </div>
            <div className="footer-col">
              <h3>AI 入口</h3>
              <ul>
                {/* GEO：把 AI 入口直接暴露给人看，也让爬虫更容易发现 */}
                <li>
                  <a href="/llms.txt">llms.txt</a>
                </li>
                <li>
                  <a href="/sitemap.xml">sitemap.xml</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="container footer-bottom">
            <span>© {new Date().getFullYear()} {site.organization.legalName ?? site.name}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

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

  // 搜索入口 —— **不改动 site.ts**。
  //
  // site.ts 是人写的内容包（分层铁律：机器永不触碰），往里加一个「搜索」
  // 会把「内容编排」与「骨架能力」混在一起 —— 换个骨架还得记得补。
  //
  // 搜索是**骨架自带的能力**（每个站都有 /search 页），入口挂在骨架层：
  //   客户自己的导航里已经有 /search 时不重复加。
  const hasSearchNav = nav.some((n) => n.href === "/search");

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
            {/* 搜索是**工具入口**，不是栏目 —— 放在 nav 外面。
                主导航项数是有上限的（5–7 项，多了信息架构就散了，
                ux 体检的 ux-nav-count 就是查这个）；
                搜索不占一个栏目位。 */}
            {!hasSearchNav && (
              <Link href="/search" className="header-search" aria-label="站内搜索">
                搜索
              </Link>
            )}
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

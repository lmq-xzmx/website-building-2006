import { site } from "@/content/site";
import {
  buildContentIndex,
  generateJsonLd,
  groupIndexByCategory,
  renderJsonLdScripts,
} from "@geokit/geo-kit";

/**
 * GEO 注入层 —— 把 geo-kit 的产物接到页面上。
 *
 * 这一层是**模板骨架唯一与 GEO 耦合的地方**：
 * 换行业只换内容包，不动这里；将来加 Astro 模板，逻辑照搬即可。
 */

const index = buildContentIndex(site);
const jsonLd = generateJsonLd(site);
const jsonLdHtml = renderJsonLdScripts(jsonLd);

/**
 * 页面级 JSON-LD（Organization / WebSite / 页面 Schema）。
 *
 * 必须用 dangerouslySetInnerHTML 注入 —— 直接把字符串当子节点渲染会被
 * React 转义成文本，导出 HTML 里就只剩转义后的 `self.__next_f.push` 载荷，
 * **爬虫看不到真正的 <script type="application/ld+json"> 标签**。
 * geo-kit 的 renderJsonLdScript 已做 </script> 转义，此处注入是安全的。
 */
export function JsonLdScripts() {
  return <script dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />;
}

/** 全站内容索引（供页脚、sitemap 等使用） */
export function getIndex() {
  return index;
}

/** 按分类取索引条目 */
export function getCategories() {
  return groupIndexByCategory(index);
}

/** 取指定区块 */
export function getSection(id: string) {
  return site.sections.find((s) => s.id === id);
}

/** 站点元信息 */
export const siteMeta = {
  name: site.name,
  description: site.description,
  url: site.url,
  locale: site.locale,
  logo: site.assets?.logo,
  ogImage: site.assets?.ogImage,
};

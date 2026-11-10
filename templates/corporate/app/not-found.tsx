import type { Metadata } from "next";
import Link from "next/link";

import { site } from "@/content/site";

/**
 * 404 页。
 *
 * 为什么单独写：
 *   Next 内置的 404 会继承根布局的 metadata ——
 *   于是 404 页和首页**共用同一份 description**。
 *   AI 引擎把 404 当成一个可索引页面抓走时，
 *   看到的就是「首页的描述」—— 实体识别直接串了。
 *   每页一份自己的 description 是 GEO 的硬要求，404 也不例外。
 */
export const metadata: Metadata = {
  title: `页面不存在 | ${site.name}`,
  description: `你访问的页面不存在或已下线。${site.name} —— ${site.description}`,
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <section className="section">
      <div className="container">
        <h1>页面不存在</h1>
        <p className="lead">
          你访问的页面可能已下线或地址有误。回到首页看看，或直接看下面的主要栏目。
        </p>
        <div className="cta-row">
          <Link href="/" className="btn btn-primary">
            回到首页
          </Link>
          <Link href="/contact" className="btn btn-outline">
            联系我们
          </Link>
        </div>
      </div>
    </section>
  );
}

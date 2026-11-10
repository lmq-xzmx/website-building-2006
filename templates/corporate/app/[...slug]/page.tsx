import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { site } from "@/content/site";
import { ModuleRenderer } from "../modules";

/**
 * 模块页面路由 —— 渲染后台编排出来的页面。
 *
 * 用 catch-all（`[...slug]`）承接**任意**路径：
 *   后台可以给页面起任何路由（/about、/solutions/xxx），
 *   骨架不需要为每个新页面改代码 —— 这正是「模块可自由组合」的意义。
 *
 * 与固定页型路由并存：Next.js 里更具体的路由优先
 * （`/insights/[id]` 比 `[...slug]` 具体），所以两者不会打架。
 *
 * 静态导出要求枚举全部路由 —— generateStaticParams 从内容包里取。
 */

/** 静态导出必需：枚举全部模块页面路由 */
export function generateStaticParams() {
  return (site.pages ?? [])
    .filter((p) => p.path && p.path !== "/")
    .map((p) => ({ slug: p.path.replace(/^\//, "").split("/") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const path = "/" + slug.join("/");
  const page = (site.pages ?? []).find((p) => p.path === path);
  if (!page) return {};

  return {
    title: page.title,
    // 每页必须有**自己的** description —— 多页共用一份会让 AI 无法区分页面实体
    description: page.description ?? page.title,
    alternates: { canonical: `${path}/` },
  };
}

/** 模块页面 */
export default async function ModulePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const path = "/" + slug.join("/");
  const page = (site.pages ?? []).find((p) => p.path === path);
  if (!page) notFound();

  // 一页只能有一个 H1。
  //
  // 英雄区模块本身就渲染 H1（它是页面的主标题）——
  // 这时再渲染一遍页面标题就成两个 H1 了，AI 摘标题会犯迷糊。
  const hasHero = (page.modules ?? []).some(
    (m) => m.type === "hero" && (m.items?.length ?? 0) > 0,
  );

  return (
    <>
      {!hasHero && page.description && (
        <section className="section-tight">
          <div className="container">
            <h1>{page.title}</h1>
            <p className="lead">{page.description}</p>
          </div>
        </section>
      )}
      <ModuleRenderer page={page} />
    </>
  );
}

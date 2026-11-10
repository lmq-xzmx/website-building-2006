/**
 * 模块编排的产物生成 —— 渲染成可被构建消费的 TS 模块。
 *
 * 与 plan/generate.ts 同思路：
 *   - 物化在**后台发布时**完成 —— 构建时不需要连数据库
 *   - 产出的文件是纯数据，diff 友好，能进 git
 *   - 构建脚本在**内存里**合并（不加载这个文件）——
 *     因为它 import 的 .ts 扩展名 Node 原生 ESM 解析不了
 *
 * 产出形如：
 *   export const modulePages: PageContent[] = [...];
 */

import type { PageContent, SiteContent } from "../types.js";
import type { ModulePlan } from "./types.js";

/**
 * 构建期合并 —— 把**已物化**的模块页面叠加到手写内容包上。
 *
 * 与 plan 的 mergePlanContent 同思路：
 *   - 手写内容永远完整保留（这是分层的核心收益）
 *   - 模块页面排在前面 —— 后台编排的「本期内容」优先
 */
export function mergeModuleContent(
  base: SiteContent,
  pages: PageContent[],
): SiteContent {
  return {
    ...base,
    pages: [...pages, ...(base.pages ?? [])],
  };
}

/**
 * 渲染模块编排的 TS 源码。
 *
 * 纯数据 + type-only import —— 不引入任何运行期依赖。
 */
export function renderModuleModule(
  plan: ModulePlan,
  pages: PageContent[],
  syncedAt: string,
): string {
  const moduleCount = pages.reduce((n, p) => n + p.modules.length, 0);
  const itemCount = pages.reduce(
    (n, p) => n + p.modules.reduce((m, mod) => m + mod.items.length, 0),
    0,
  );

  return `/**
 * 模块编排内容 —— **由后台发布自动生成，请勿手改**。
 *
 * 来源知识库：${plan.kbId}
 * 生成时间：${syncedAt}
 * 页面：${pages.length} 个 / 模块：${moduleCount} 个 / 条目：${itemCount} 条
 *
 * 手写内容在 content/site.ts 里，两者互不覆盖。
 */

import type { PageContent } from "@geokit/geo-kit";

export const modulePages: PageContent[] = ${JSON.stringify(pages, null, 2)};

export default modulePages;
`;
}

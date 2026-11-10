#!/usr/bin/env node
/**
 * 客户站构建脚本 —— **骨架复用**机制。
 *
 * 解决的问题（ADR-000 决策 2 的落地）：
 *   「一个骨架 × N 个行业包」如果靠「每个客户复制一份模板」实现，
 *   那 N 个客户就有 N 份骨架要同步维护 —— 矩阵化名存实亡。
 *
 * 做法：
 *   构建时把**骨架的页面层**与**客户的内容包**组合成一个临时构建目录，
 *   在其中跑 next build。骨架始终只有一份（templates/corporate），
 *   客户只持有 content/ 与 public/。
 *
 * 用法：
 *   node scripts/build-site.mjs <site-dir> [--skeleton templates/corporate]
 */

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 骨架里需要复制到构建目录的部分（内容与产物由客户站提供） */
const SKELETON_ITEMS = ["app", "next.config.ts", "tsconfig.json", "next-env.d.ts"];

async function run(cmd, args, cwd) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit", shell: false });
    p.on("error", rej);
    p.on("close", (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} ${args.join(" ")} 退出码 ${code}`)),
    );
  });
}

/**
 * 合并机器生成的内容 —— 在**构建目录**里做，源站不动。
 *
 * 做法：
 *   site.ts          → 改名 site.base.ts（手写内容，原封不动）
 *   site.ts          → 新生成，import base + 机器内容后合并
 *
 * 两份机器内容：
 *   plan.generated.ts     —— 编排台产物（知识条目 → 四个固定槽位）
 *   modules.generated.ts  —— 模块编排产物（页面 → 模块 → 条目）
 *
 * 为什么用改名而不是改写 site.ts 的内容：
 *   改写要解析 TS 再序列化，容易丢注释、丢格式；
 *   改名是文件级操作，零解析风险，手写内容的字节完全保留。
 */
async function mergePlanContent(contentDir) {
  const planPath = join(contentDir, "plan.generated.ts");
  const modulesPath = join(contentDir, "modules.generated.ts");
  const sitePath = join(contentDir, "site.ts");
  const basePath = join(contentDir, "site.base.ts");

  const hasPlan = existsSync(planPath);
  const hasModules = existsSync(modulesPath);
  if (!hasPlan && !hasModules) return; // 没有机器内容 → 什么都不做

  // 已经有 site.base.ts 说明合并过一次 —— 先还原，避免叠加叠加
  if (existsSync(basePath)) {
    await cp(basePath, sitePath);
    await rm(basePath, { force: true });
  } else {
    await cp(sitePath, basePath);
  }

  // 只有实际存在的那份才 import —— 否则构建会因为缺文件直接失败
  const imports = [];
  // 合并链：每一步接上一步的结果，不能都从 base 起算（否则后一步会覆盖前一步）
  let expr = "base";
  if (hasPlan) {
    imports.push(`import { planContent } from "./plan.generated";`);
    expr = "mergePlanContent(base, planContent)";
  }
  if (hasModules) {
    imports.push(`import { modulePages, appearance } from "./modules.generated";`);
    expr = `mergeModuleContent(${expr}, modulePages, appearance)`;
  }

  const merged = `/**
 * 合并后的内容包 —— **构建时自动生成**。
 *
 * = site.base.ts（手写内容）+ 机器生成的内容
 *   - plan.generated.ts    编排台产物（知识条目 → 固定槽位）
 *   - modules.generated.ts 模块编排产物（页面 → 模块 → 条目）
 *
 * 手写内容永远完整保留 —— 机器内容只做叠加。
 *
 * import 不带扩展名：这个文件只给 Next.js（webpack）读，
 * webpack 与 TypeScript 的 bundler 解析都能补全 .ts。
 * （Node 原生 ESM 不做扩展名补全 —— 所以构建脚本在内存里合并，
 *   不加载这个文件。）
 */

import type { SiteContent } from "@geokit/geo-kit";
import { mergePlanContent, mergeModuleContent } from "@geokit/geo-kit";

import * as baseMod from "./site.base";
${imports.join("\n")}

// 客户的内容包可能导出 site、default 或两者 —— 都兼容
const base = (baseMod.site ?? baseMod.default) as SiteContent;

export const site: SiteContent = ${expr};

export default site;
`;

  await writeFile(sitePath, merged, "utf8");
  const parts = [];
  if (hasPlan) parts.push("计划");
  if (hasModules) parts.push("模块");
  console.log(`▸ 已合并${parts.join(" + ")}内容（手写内容未改动）`);
}

async function main() {
  const args = process.argv.slice(2);
  const siteDir = args.find((a) => !a.startsWith("--"));
  if (!siteDir) {
    console.error("用法：node scripts/build-site.mjs <site-dir>");
    process.exit(1);
  }

  const sitePath = resolve(repoRoot, siteDir);
  const skeletonPath = resolve(repoRoot, "templates/corporate");
  const buildDir = join(sitePath, ".build");

  if (!existsSync(join(sitePath, "content", "site.ts"))) {
    console.error(`${siteDir} 缺少 content/site.ts`);
    process.exit(1);
  }

  console.log(`▸ 骨架：${skeletonPath}`);
  console.log(`▸ 客户站：${sitePath}`);

  // 1. 清理并创建构建目录
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });

  // 2. 复制骨架（页面层）—— 骨架只有这一份
  for (const item of SKELETON_ITEMS) {
    const src = join(skeletonPath, item);
    if (!existsSync(src)) continue;
    await cp(src, join(buildDir, item), { recursive: true });
  }

  // 3. 复制客户的内容包 —— 覆盖骨架的默认内容
  await cp(join(sitePath, "content"), join(buildDir, "content"), { recursive: true });

  // 3.5 合并计划内容（后台编排的知识库内容）
  //
  // 分层的关键一步：**手写内容不被改动**。
  //   content/site.ts          —— 手写（人维护），构建时改名为 site.base.ts
  //   content/plan.generated.ts —— 机器生成（后台发布），直接叠加
  // 合并后的 site.ts 是构建目录里的**临时文件**，源站一个字节都不动。
  //
  // 没有 plan.generated.ts → 不做合并，手写内容原样构建。
  await mergePlanContent(join(buildDir, "content"));

  // 4. 复制客户已生成的 GEO 产物（robots/llms/sitemap/jsonld/index）
  const publicSrc = join(sitePath, "public");
  if (existsSync(publicSrc)) {
    await cp(publicSrc, join(buildDir, "public"), { recursive: true });
  }

  // 5. 写构建目录的 package.json
  //
  // 依赖要**合并**三方：骨架的（next/react/@types）+ 客户站的（geo-kit）
  // + 骨架工作区里的 @geokit/geo-kit。
  // 构建目录在 workspace 之外，所以 workspace:* 协议无法解析 ——
  // 改为直接把 geo-kit 的相对路径写进 dependencies。
  const sitePkg = JSON.parse(await readFile(join(sitePath, "package.json"), "utf8"));
  const skeletonPkg = JSON.parse(
    await readFile(join(skeletonPath, "package.json"), "utf8"),
  );

  // geo-kit 在 packages/geo-kit —— 不是 templates/ 下。
  // 路径算错时 npm 会建一个指向不存在目录的符号链接：
  // 构建还能过（Node 逐级向上找到工作区根的链接），但构建目录里
  // 自己的 node_modules 是坏的 —— 直接调用它的 cli.js 就会 MODULE_NOT_FOUND。
  const geoKitLocal = `file:${resolve(repoRoot, "packages/geo-kit")}`;

  const buildPkg = {
    name: `${sitePkg.name}-build`,
    private: true,
    version: sitePkg.version ?? "0.1.0",
    scripts: {
      build: "next build --webpack",
    },
    dependencies: {
      ...(skeletonPkg.dependencies ?? {}),
      ...(sitePkg.dependencies ?? {}),
      "@geokit/geo-kit": geoKitLocal,
    },
    devDependencies: {
      ...(skeletonPkg.devDependencies ?? {}),
      ...(sitePkg.devDependencies ?? {}),
    },
  };
  await writeFile(
    join(buildDir, "package.json"),
    `${JSON.stringify(buildPkg, null, 2)}\n`,
    "utf8",
  );

  // 5.5 在构建目录安装依赖（构建目录是独立的 npm 项目）
  console.log("▸ 安装构建依赖…");
  await run("npm", ["install", "--no-audit", "--no-fund"], buildDir);

  // 5.8 从**合并后**的内容重新生成 GEO 产物
  //
  // 为什么必须重生成：public/ 里是上次手工 geo:generate 的产物，
  // 它反映的是**手写内容**。后台编排了知识库内容后，站点内容变了，
  // 但 llms.txt / JSON-LD / sitemap 还是旧的 —— AI 看到的和访客看到的不一致。
  //
  // 直接调 geo-kit 的 API，不在构建目录里跑 CLI ——
  // 构建目录的 node_modules 是独立安装的，模块解析容易出问题
  // （geo-kit 的 CLI 又用 Node 原生 ESM 加载 .ts 内容包，扩展名规则更严）。
  console.log("▸ 生成 GEO 产物（基于合并后的内容）…");
  await generateGeoArtifacts(buildDir);

  // 6. 构建
  //
  // 用 webpack 而非 turbopack：构建目录在 workspace 之外，
  // turbopack 会因 "Filesystem root used for resolution" 报错。
  // 静态站构建速度不敏感，webpack 更稳。
  console.log("▸ 构建中…");
  await run("npx", ["next", "build"], buildDir);

  // 7. 产物回写
  const outDir = join(sitePath, "out");
  await rm(outDir, { recursive: true, force: true });
  await cp(join(buildDir, "out"), outDir, { recursive: true });

  console.log(`\n✓ 构建完成 → ${outDir}`);
}

/**
 * 从构建目录里的内容生成 GEO 产物。
 *
 * **不加载合并后的 site.ts** —— 合并文件里的 import 用 .js 后缀
 * （给 Next.js 的 tsc 用），Node 原生 ESM 解析不了那个后缀。
 *
 * 改为在内存里合并：直接 import 两个 .ts 源文件
 * （Node 24 内置类型剥离，能直接跑 .ts；它们的 import 都是 type-only，
 *  运行时不需要解析），再用 geo-kit 的 mergePlanContent 合并。
 * 结果与 Next.js 构建时合并的完全一致 —— 同一个函数。
 */
async function generateGeoArtifacts(buildDir) {
  const geoKitDist = resolve(repoRoot, "packages/geo-kit/dist");
  const {
    generateArtifacts,
    artifactsToFiles,
    mergePlanContent,
    mergeModuleContent,
  } = await import(pathToFileURL(join(geoKitDist, "index.js")).href);

  const contentDir = join(buildDir, "content");
  const basePath = join(contentDir, "site.base.ts");
  const planPath = join(contentDir, "plan.generated.ts");
  const modulesPath = join(contentDir, "modules.generated.ts");
  const sourcePath = existsSync(basePath) ? basePath : join(contentDir, "site.ts");

  const baseMod = await import(pathToFileURL(sourcePath).href);
  const base = baseMod.site ?? baseMod.default;
  if (!base) throw new Error("内容包未导出 site");

  let content = base;
  if (existsSync(planPath)) {
    const planMod = await import(pathToFileURL(planPath).href);
    content = mergePlanContent(base, planMod.planContent ?? planMod.default);
  }
  if (existsSync(modulesPath)) {
    const modMod = await import(pathToFileURL(modulesPath).href);
    content = mergeModuleContent(
      content,
      modMod.modulePages ?? modMod.default ?? [],
      modMod.appearance,
    );
  }

  const artifacts = generateArtifacts(content, { includeLlmsFull: true });
  const files = artifactsToFiles(artifacts, content, { includeLlmsFull: true });

  const publicDir = join(buildDir, "public");
  await mkdir(publicDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const target = join(publicDir, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, "utf8");
  }

  // JSON-LD 与内容索引单独落文件 —— 模板从它 import
  await mkdir(join(publicDir, "_geo"), { recursive: true });
  await writeFile(
    join(publicDir, "_geo/jsonld.json"),
    JSON.stringify(artifacts.jsonLd, null, 2),
    "utf8",
  );
  await writeFile(
    join(publicDir, "_geo/index.json"),
    JSON.stringify(artifacts.index, null, 2),
    "utf8",
  );

  console.log(
    `  ${artifacts.jsonLd.length} 段 JSON-LD，${artifacts.index.entries.length} 条索引`,
  );

  // ── 没有模块页时，摘掉 catch-all 路由 ─────────────────
  //
  // 为什么必须这么做：
  //   `output: "export"` 下，Next 见到 catch-all 路由就要求
  //   generateStaticParams —— 而**返回空数组也会报错**
  //   （报 "missing generateStaticParams()"）。
  //
  //   「这个站点没有模块编排页」是完全正常的状态
  //   （刚建站、或客户还没在后台编排），不该让构建失败。
  //
  // 做法：构建目录是临时目录，删它不影响源骨架。
  //   只在**确实没有非根路径的模块页**时删 —— 根路径（/）由
  //   app/page.tsx 那个固定页型负责，catch-all 本来也不接它。
  const modulePages = content.pages ?? [];
  const hasCatchAllPages = modulePages.some(
    (p) => p.path && p.path !== "/" && p.path !== "",
  );

  const catchAllDir = join(buildDir, "app", "[...slug]");
  if (!hasCatchAllPages && existsSync(catchAllDir)) {
    await rm(catchAllDir, { recursive: true, force: true });
    console.log("  无模块编排页 —— 已摘掉 catch-all 路由（静态导出不允许空参数）");
  } else if (hasCatchAllPages) {
    console.log(`  模块编排页 ${modulePages.length} 个 —— catch-all 路由保留`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

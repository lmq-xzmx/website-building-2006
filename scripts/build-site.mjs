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
import { fileURLToPath } from "node:url";
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

  const geoKitLocal = `file:${join(skeletonPath, "..", "geo-kit")}`;

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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

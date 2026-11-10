#!/usr/bin/env node
/**
 * UX 体检入口 —— 薄壳，实际逻辑在 geo-kit CLI 里。
 *
 * 为什么留这个脚本：仓库里已有 scripts/ 系列的统一入口习惯
 * （build-site.mjs / check-admin-ui.mjs），照着来一个，
 * 免得大家记「到底是 node scripts/ux-audit.mjs 还是 node dist/cli.js ux-audit」。
 *
 * 用法：
 *   node scripts/ux-audit.mjs sites/demo-saas/out
 *   node scripts/ux-audit.mjs sites/demo-saas/out --json
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(repoRoot, "packages/geo-kit/dist/cli.js");

if (!existsSync(cli)) {
  console.error("geo-kit 还没构建 —— 先跑：pnpm --filter @geokit/geo-kit build");
  process.exit(1);
}

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [cli, "ux-audit", ...args], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);

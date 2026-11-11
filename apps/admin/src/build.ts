/**
 * 站点重建 —— 后台「发布」的第二步。
 *
 * ── 为什么后台要能重建 ────────────────────────────────
 * 后台的「发布」原本只做**物化**（写 modules.generated.ts），
 * 但静态站伺服的是 `out/` 里的 **HTML 文件** ——
 * 那些 HTML 是 next build 时生成的。物化完不重建，访客看到的还是旧内容。
 *
 * 「发布」这个词对用户意味着「我改的东西上线了」。
 * 只物化不重建 = 发布没做完。
 *
 * ── 为什么不能每次都在后台进程里构建 ────────────────
 * next build 需要 next/react 的完整依赖与一份独立的项目结构，
 * 后台进程（admin）只有 geo-kit 与 pg —— 跑不了。
 * 所以后台**调用构建脚本**，由脚本在构建目录里做完整构建。
 *
 * ── 生产环境的差异 ──────────────────────────────────
 * 生产上后台跑在容器里，容器里没有 next（运行时镜像不带构建依赖），
 * 也没有源码 —— 所以生产构建必须在 457 上跑（CI 或手工）。
 * 后台会检测「能不能构建」，不能就明确告诉用户「已物化，需在构建机重建」。
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface RebuildResult {
  ok: boolean;
  /** 构建耗时（毫秒） */
  ms: number;
  /** 构建脚本输出（末尾若干行） */
  output: string;
  /** 站点目录（相对仓库根） */
  siteDir: string;
  /** 产出页面数（从输出里数） */
  pages?: number;
  /** 不能重建时的原因 */
  reason?: string;
}

/** 仓库根目录 */
function repoRoot(): string {
  // admin/src/build.ts → 上溯三层到仓库根
  return resolve(new URL("../../..", import.meta.url).pathname);
}

/**
 * 重建站点。
 *
 * @param siteId  站点目录名（如 demo-saas）
 * @param timeout 超时（毫秒）
 */
export async function rebuildSite(
  siteId: string,
  timeout = 10 * 60_000,
): Promise<RebuildResult> {
  const root = repoRoot();
  const script = resolve(root, "scripts/build-site.mjs");
  const started = Date.now();

  if (!existsSync(script)) {
    return {
      ok: false,
      ms: 0,
      output: "",
      siteDir: siteId,
      reason: "找不到构建脚本（生产容器里没有源码，构建需在构建机上跑）",
    };
  }

  // 构建脚本在 sites/<siteId>/ 找内容包 —— 传相对路径
  const siteRel = `sites/${siteId}`;

  return new Promise<RebuildResult>((resolvePromise) => {
    // 用当前解释器的绝对路径，不要写死 "node"：
    // 后台常由 systemd / 容器 / nvm 启动，PATH 里未必有 node，
    // spawn("node") 会直接 ENOENT → 发布结果里只剩一句「重建失败」。
    const child = spawn(process.execPath, [script, siteRel], {
      cwd: root,
      env: { ...process.env, NODE_ENV: "production" },
    });

    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeout);

    const collect = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      // 只保留末尾 8KB —— 避免长输出撑爆内存与响应
      if (output.length > 8192) output = output.slice(-8192);
    };

    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({
        ok: false,
        ms: Date.now() - started,
        output: output + `\n启动失败：${err.message}`,
        siteDir: siteRel,
        reason: err.message,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      // 数一下产出了多少个页面（Next 的路由清单行）
      const pageMatches = output.match(/^[├└]\s+[○●]/gm) ?? [];
      if (code === 0) {
        resolvePromise({
          ok: true,
          ms,
          output,
          siteDir: siteRel,
          pages: pageMatches.length,
        });
      } else {
        resolvePromise({
          ok: false,
          ms,
          output,
          siteDir: siteRel,
          reason: `构建进程退出码 ${code}`,
        });
      }
    });
  });
}

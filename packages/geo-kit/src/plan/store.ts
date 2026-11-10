/**
 * 计划的读写 —— plan.json 落在站点目录里。
 *
 * 落盘位置：sites/<siteId>/plan.json
 *   - 与内容包同目录 —— 一眼能看出「这个站点的机器内容编排到哪了」
 *   - 可进 git —— 编排决策本身是要 review 的资产
 *   - 与手写内容物理隔离 —— 机器只写 plan.json，人只写 site.ts
 *
 * 格式用 JSON 而不是 TS —— 计划是**数据**，不是代码。
 * JSON 能被后台直接读写、被人直接读懂、不需要编译。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { emptyPlan, type ContentPlan } from "./plan.js";

/** 计划文件名（站点目录内） */
export const PLAN_FILENAME = "plan.json";

/** 计划文件路径 */
export function planPath(siteDir: string): string {
  return resolve(siteDir, PLAN_FILENAME);
}

/** 读计划 —— 不存在时返回空计划 */
export async function readPlan(siteDir: string, siteId: string): Promise<ContentPlan> {
  const path = planPath(siteDir);
  if (!existsSync(path)) return emptyPlan(siteId);

  const raw = await readFile(path, "utf8");
  try {
    const parsed = JSON.parse(raw) as ContentPlan;
    // 版本不符时不猜 —— 返回空计划，让后台提示重新编排
    if (parsed.version !== 1) return emptyPlan(siteId);
    return { ...emptyPlan(siteId), ...parsed };
  } catch {
    return emptyPlan(siteId);
  }
}

/** 写计划 */
export async function writePlan(siteDir: string, plan: ContentPlan): Promise<void> {
  const path = planPath(siteDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

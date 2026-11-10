/**
 * 模块编排的读写 —— modules.json 落在站点目录里。
 *
 * 与 plan.json 平级，但**职责不同**：
 *   plan.json     —— 「知识条目 → 四个固定槽位」的编排（旧模型）
 *   modules.json  —— 「页面 → 模块 → 条目」的编排（新模型，通用）
 *
 * 两者都只由后台（机器）写，人只读。site.ts 永远不被碰。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { emptyModulePlan, type ModulePlan } from "./types.js";

/** 模块编排文件名（站点目录内） */
export const MODULES_FILENAME = "modules.json";

/** 路径 */
export function modulesPath(siteDir: string): string {
  return resolve(siteDir, MODULES_FILENAME);
}

/** 读编排 —— 不存在时返回空编排 */
export async function readModulePlan(
  siteDir: string,
  siteId: string,
): Promise<ModulePlan> {
  const path = modulesPath(siteDir);
  if (!existsSync(path)) return emptyModulePlan(siteId);

  const raw = await readFile(path, "utf8");
  try {
    const parsed = JSON.parse(raw) as ModulePlan;
    if (parsed.version !== 1) return emptyModulePlan(siteId);
    return { ...emptyModulePlan(siteId), ...parsed, pages: parsed.pages ?? [] };
  } catch {
    return emptyModulePlan(siteId);
  }
}

/** 写编排 */
export async function writeModulePlan(
  siteDir: string,
  plan: ModulePlan,
): Promise<void> {
  const path = modulesPath(siteDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

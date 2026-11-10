/**
 * 片段库的读写 —— fragments.json 落在站点目录里。
 *
 * 与 plan.json / modules.json / media.json 同级：
 *   - 后台（机器）写，人只读
 *   - 可进 git、可 review、可 diff
 *   - 与手写内容包 site.ts 物理隔离
 *
 * 位置：sites/<id>/fragments.json —— 与站点平级，不进 content/，
 * 因为它不是「内容」，是**编排的素材**。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { emptyFragmentLibrary, type FragmentLibrary } from "./types.js";

/** 片段库文件名（站点目录内） */
export const FRAGMENTS_FILENAME = "fragments.json";

/** 路径 */
export function fragmentsPath(siteDir: string): string {
  return resolve(siteDir, FRAGMENTS_FILENAME);
}

/** 读片段库 —— 不存在时返回空库 */
export async function readFragmentLibrary(
  siteDir: string,
  siteId: string,
): Promise<FragmentLibrary> {
  const path = fragmentsPath(siteDir);
  if (!existsSync(path)) return emptyFragmentLibrary(siteId);

  const raw = await readFile(path, "utf8");
  try {
    const parsed = JSON.parse(raw) as FragmentLibrary;
    if (parsed.version !== 1) return emptyFragmentLibrary(siteId);
    return {
      ...emptyFragmentLibrary(siteId),
      ...parsed,
      fragments: parsed.fragments ?? [],
    };
  } catch {
    // 读坏了就当空库 —— 片段是素材，坏了不该挡住整个后台
    return emptyFragmentLibrary(siteId);
  }
}

/** 写片段库 */
export async function writeFragmentLibrary(
  siteDir: string,
  lib: FragmentLibrary,
): Promise<void> {
  const path = fragmentsPath(siteDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(lib, null, 2)}\n`, "utf8");
}

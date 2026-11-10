/**
 * 媒体库的读写 —— media.json 落在站点目录里。
 *
 * 与 plan.json / modules.json 同级：
 *   - 后台（机器）写，人只读
 *   - 可进 git、可 review、可 diff
 *   - 与手写内容包 site.ts 物理隔离
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { emptyMediaLibrary, type MediaLibrary } from "./types.js";

/** 媒体清单文件名（站点目录内） */
export const MEDIA_FILENAME = "media.json";

/** 媒体文件目录名（站点 public/ 下） */
export const MEDIA_DIR = "media";

/** 清单路径 */
export function mediaPath(siteDir: string): string {
  return resolve(siteDir, MEDIA_FILENAME);
}

/** 媒体文件目录路径 */
export function mediaDir(siteDir: string): string {
  return resolve(siteDir, "public", MEDIA_DIR);
}

/** 读媒体库 —— 不存在时返回空库 */
export async function readMediaLibrary(
  siteDir: string,
  siteId: string,
): Promise<MediaLibrary> {
  const path = mediaPath(siteDir);
  if (!existsSync(path)) return emptyMediaLibrary(siteId);

  const raw = await readFile(path, "utf8");
  try {
    const parsed = JSON.parse(raw) as MediaLibrary;
    if (parsed.version !== 1) return emptyMediaLibrary(siteId);
    return {
      ...emptyMediaLibrary(siteId),
      ...parsed,
      assets: parsed.assets ?? [],
    };
  } catch {
    return emptyMediaLibrary(siteId);
  }
}

/** 写媒体库 */
export async function writeMediaLibrary(
  siteDir: string,
  lib: MediaLibrary,
): Promise<void> {
  const path = mediaPath(siteDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(lib, null, 2)}\n`, "utf8");
}

/** 确保媒体目录存在 */
export async function ensureMediaDir(siteDir: string): Promise<string> {
  const dir = mediaDir(siteDir);
  await mkdir(dir, { recursive: true });
  return dir;
}

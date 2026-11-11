/**
 * 模版库的读写 —— 与 media.json / fragments.json 同一套 store 模式。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  emptyTemplateLibrary,
  type TemplateLibrary,
} from "./types.js";

export const TEMPLATES_FILENAME = "templates.json";

export function templatesPath(siteDir: string): string {
  return resolve(siteDir, TEMPLATES_FILENAME);
}

export async function readTemplateLibrary(
  siteDir: string,
  siteId: string,
): Promise<TemplateLibrary> {
  const path = templatesPath(siteDir);
  try {
    const raw = await readFile(path, "utf8");
    const lib = JSON.parse(raw) as TemplateLibrary;
    if (lib.version !== 1 || !Array.isArray(lib.templates)) {
      throw new Error("bad shape");
    }
    lib.instances ??= [];
    return lib;
  } catch {
    // 没有就给一份空库 —— 模版层是可选能力，不要让它阻塞站点
    return emptyTemplateLibrary(siteId);
  }
}

export async function writeTemplateLibrary(
  siteDir: string,
  lib: TemplateLibrary,
): Promise<void> {
  const path = templatesPath(siteDir);
  await mkdir(dirname(path), { recursive: true });
  lib.updatedAt = new Date().toISOString();
  await writeFile(path, JSON.stringify(lib, null, 2) + "\n", "utf8");
}

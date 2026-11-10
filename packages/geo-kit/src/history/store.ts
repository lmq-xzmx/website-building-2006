/**
 * 版本历史的读写 —— 快照、索引、保留策略、回滚。
 *
 * 版本号用**时间戳**：20261111-101530-042
 *   - 人读得懂（哪天的哪一次）
 *   - 字典序 = 时间序（列表排序不用再比时间）
 *   - 带毫秒 → 同一秒内两次发布也不会撞号
 */

import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { ModulePlan } from "../modules/types.js";
import { readModulePlan, writeModulePlan } from "../modules/store.js";
import {
  DEFAULT_KEEP_VERSIONS,
  emptyVersionIndex,
  type VersionEntry,
  type VersionIndex,
  type VersionStats,
} from "./types.js";

/** 历史目录名（站点目录下） */
export const HISTORY_DIRNAME = "history";
/** 索引文件名（历史目录下） */
export const HISTORY_INDEX_FILENAME = "index.json";

/** 历史目录路径 */
export function historyDir(siteDir: string): string {
  return resolve(siteDir, HISTORY_DIRNAME);
}

/** 索引路径 */
export function historyIndexPath(siteDir: string): string {
  return resolve(historyDir(siteDir), HISTORY_INDEX_FILENAME);
}

/** 某个版本的快照路径 */
export function versionPath(siteDir: string, versionId: string): string {
  return resolve(historyDir(siteDir), `${versionId}.json`);
}

// ── 版本号 ──────────────────────────────────────────────

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

/** 时间 → 版本号（本地时间，可读） */
export function formatVersionId(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` +
    `-${pad(d.getMilliseconds(), 3)}`
  );
}

/** 版本号 → 毫秒时间戳（解析不了返回 NaN） */
export function parseVersionId(id: string): number {
  const m = /^(\d{8})-(\d{2})(\d{2})(\d{2})-(\d{3})$/.exec(id ?? "");
  if (!m) return Number.NaN;
  return new Date(
    Number(m[1].slice(0, 4)),
    Number(m[1].slice(4, 6)) - 1,
    Number(m[1].slice(6, 8)),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  ).getTime();
}

/**
 * 下一个版本号 —— **单调递增**。
 *
 * 为什么要额外保证：同一毫秒里连发两次发布（脚本化批量发布），
 * 版本号必须仍然能排序，否则「回滚到上一个」会取错。
 */
export function nextVersionId(existingIds: string[], now: Date = new Date()): string {
  let candidate = now.getTime();
  for (const id of existingIds) {
    const t = parseVersionId(id);
    if (!Number.isNaN(t) && t >= candidate) candidate = t + 1;
  }
  return formatVersionId(new Date(candidate));
}

// ── 索引 ────────────────────────────────────────────────

/** 读版本索引 —— 不存在时返回空索引 */
export async function readVersionIndex(
  siteDir: string,
  siteId: string,
): Promise<VersionIndex> {
  const path = historyIndexPath(siteDir);
  if (!existsSync(path)) return emptyVersionIndex(siteId);

  const raw = await readFile(path, "utf8");
  try {
    const parsed = JSON.parse(raw) as VersionIndex;
    if (parsed.version !== 1) return emptyVersionIndex(siteId);
    return {
      ...emptyVersionIndex(siteId),
      ...parsed,
      versions: parsed.versions ?? [],
    };
  } catch {
    return emptyVersionIndex(siteId);
  }
}

/** 写版本索引 */
export async function writeVersionIndex(
  siteDir: string,
  index: VersionIndex,
): Promise<void> {
  const path = historyIndexPath(siteDir);
  await mkdir(historyDir(siteDir), { recursive: true });
  await writeFile(path, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

// ── 快照 ────────────────────────────────────────────────

/** 编排的摘要统计 —— 与 modules/validate 的 modulePlanStats 同口径（只算已发布的） */
export function planStatsForVersion(plan: ModulePlan): VersionStats {
  let pages = 0;
  let modules = 0;
  let items = 0;
  for (const page of plan.pages ?? []) {
    if (!page.published) continue;
    pages++;
    for (const m of page.modules ?? []) {
      if (!m.enabled) continue;
      modules++;
      items += (m.items ?? []).length;
    }
  }
  return { pages, modules, items };
}

/**
 * 保留最近 N 份 —— 超出删最旧的。
 *
 * 删的是**应用自己的历史目录**里的文件，
 * 不是 docker 数据卷，删是安全的（见 CLAUDE.md 的数据红线）。
 */
async function pruneVersions(
  siteDir: string,
  index: VersionIndex,
  keep: number,
): Promise<void> {
  if (index.versions.length <= keep) return;
  const dropped = index.versions.slice(keep);
  index.versions = index.versions.slice(0, keep);
  for (const v of dropped) {
    try {
      await rm(versionPath(siteDir, v.id), { force: true });
    } catch {
      // 删不掉不阻塞 —— 索引已经不再指向它
    }
  }
}

/**
 * 存一份快照 —— 返回新建的版本条目。
 *
 * 快照内容就是**当时的整份编排**，与 modules.json 同格式：
 * 回滚时把它写回 modules.json 即可，不需要任何转换。
 */
export async function snapshotPlan(
  siteDir: string,
  siteId: string,
  plan: ModulePlan,
  opts: { author?: string; reason?: string; keep?: number } = {},
): Promise<VersionEntry> {
  const index = await readVersionIndex(siteDir, siteId);
  const id = nextVersionId(
    index.versions.map((v) => v.id),
    new Date(),
  );

  await mkdir(historyDir(siteDir), { recursive: true });
  await writeFile(
    versionPath(siteDir, id),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );

  const entry: VersionEntry = {
    id,
    createdAt: new Date().toISOString(),
    author: opts.author?.trim() || "本地",
    reason: opts.reason?.trim() || "发布",
    stats: planStatsForVersion(plan),
  };

  index.versions.unshift(entry);
  index.updatedAt = new Date().toISOString();
  await pruneVersions(siteDir, index, opts.keep ?? DEFAULT_KEEP_VERSIONS);
  await writeVersionIndex(siteDir, index);
  return entry;
}

/** 读某个版本的快照 —— 不存在返回 null */
export async function readVersionPlan(
  siteDir: string,
  versionId: string,
): Promise<ModulePlan | null> {
  const path = versionPath(siteDir, versionId);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ModulePlan;
    if (!parsed || !Array.isArray(parsed.pages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 历史目录里多出来的、没有索引条目的孤儿快照文件名 */
export async function listOrphanVersions(siteDir: string): Promise<string[]> {
  const dir = historyDir(siteDir);
  if (!existsSync(dir)) return [];
  const index = await readVersionIndex(siteDir, "");
  const known = new Set(index.versions.map((v) => `${v.id}.json`));
  const files = await readdir(dir);
  return files.filter((f) => f.endsWith(".json") && f !== HISTORY_INDEX_FILENAME && !known.has(f));
}

/**
 * 回滚到某个版本 —— 把该版本写成当前编排。
 *
 * 两步留档，顺序不能反：
 *   1. 先给**回滚前的状态**留一份 —— 回滚不该丢历史
 *   2. 再给**回滚后的状态**留一份 —— 回滚本身也是一个新版本
 *
 * 这样历史里既能看到「改坏之前是什么样」，也能看到「回滚到了哪一版」。
 */
export async function rollbackToVersion(
  siteDir: string,
  siteId: string,
  versionId: string,
  opts: { author?: string } = {},
): Promise<{ restored: ModulePlan; version: VersionEntry } | null> {
  const index = await readVersionIndex(siteDir, siteId);
  const entry = index.versions.find((v) => v.id === versionId);
  if (!entry) return null;

  const plan = await readVersionPlan(siteDir, versionId);
  if (!plan) return null;

  const current = await readModulePlan(siteDir, siteId);
  await snapshotPlan(siteDir, siteId, current, {
    author: opts.author,
    reason: `回滚前状态（将回滚到 ${versionId}）`,
  });

  const restored: ModulePlan = {
    ...plan,
    siteId,
    updatedAt: new Date().toISOString(),
  };
  await writeModulePlan(siteDir, restored);

  const version = await snapshotPlan(siteDir, siteId, restored, {
    author: opts.author,
    reason: `回滚到 ${versionId}`,
  });

  return { restored, version };
}

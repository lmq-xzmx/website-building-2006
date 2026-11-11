/**
 * 后台配置 —— 从环境变量读，全部有默认值。
 *
 * 关键约束：
 *   - 数据库连接串**只读** —— 后台不写知识库
 *   - 站点根目录指向仓库的 sites/ —— 后台只操作本仓库内的站点
 *   - 端口在 5100 段（已登记给 website-building）
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

/** 仓库根目录 */
export const REPO_ROOT = resolve(here, "..", "..", "..");

/**
 * 站点根目录 —— 后台操作 sites/ 下的站点。
 *
 * 可用 SITES_DIR 覆盖（生产机上站点目录可能是挂载卷，不在源码目录里）。
 */
export const SITES_DIR = process.env.SITES_DIR
  ? resolve(process.env.SITES_DIR)
  : resolve(REPO_ROOT, "sites");

/** 后台端口 */
export const PORT = Number(process.env.ADMIN_PORT ?? 5105);

/** 绑定地址 —— 默认只绑本机 */
export const HOST = process.env.ADMIN_HOST ?? "127.0.0.1";

/**
 * 站点访问基址 —— 发布结果里「打开站点」用哪个域名。
 *
 * 开发机不配：跟随后台当前访问地址，如 http://127.0.0.1:5199/ ，
 *             端口换了也不用改代码。
 * 生产机：配 SITE_BASE_URL 指向正式站点域名（当前待定）。
 *
 * 注意：**不要**拿 content/site.ts 里的 url 当后台访问地址 ——
 * 那是内容包给搜索引擎看的 canonical，跟后台部署在哪没关系。
 */
export const SITE_BASE_URL = (process.env.SITE_BASE_URL ?? "").replace(/\/+$/, "");

/** 知识库连接串 —— 只读用途 */
export const DATABASE_URL =
  process.env.KNOWLEDGE_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

/** 是否配置了数据库 */
export const HAS_DB = DATABASE_URL.length > 0;

// ── Casdoor 鉴权 ────────────────────────────────────────
//
// 两个 endpoint 分开：
//   EXTERNAL —— 浏览器跳转用（授权页）。生产与开发都用能被浏览器打开的地址。
//   ENDPOINT —— 服务端调用用（换 token / 验签）。生产容器内走
//               host.docker.internal，避免公网回环 NAT 问题。
//
// ⚠️ 客户端密钥只从环境变量读，**不写进仓库**。

export const CASDOOR_EXTERNAL_ENDPOINT = (
  process.env.CASDOOR_EXTERNAL_ENDPOINT ?? ""
).replace(/\/+$/, "");

export const CASDOOR_ENDPOINT = (
  process.env.CASDOOR_ENDPOINT ?? CASDOOR_EXTERNAL_ENDPOINT
).replace(/\/+$/, "");

export const CASDOOR_CLIENT_ID = process.env.CASDOOR_CLIENT_ID ?? "";
export const CASDOOR_CLIENT_SECRET = process.env.CASDOOR_CLIENT_SECRET ?? "";
export const CASDOOR_ORGANIZATION = process.env.CASDOOR_ORGANIZATION ?? "";

/** 回调地址 —— 必须与 Casdoor 应用里登记的「重定向 URLs」逐字一致 */
export const CASDOOR_REDIRECT_URI = process.env.CASDOOR_REDIRECT_URI ?? "";

/**
 * 鉴权是否开启。
 *
 * 开启条件：配齐 client_id + client_secret + redirect_uri。
 * 没配齐就**不鉴权**（保持旧的开发体验），但配置了一半会在启动时告警 ——
 * 生产上必须三个都给，别让它悄悄以无鉴权状态跑到线上。
 */
export const AUTH_ENABLED =
  CASDOOR_CLIENT_ID.length > 0 &&
  CASDOOR_CLIENT_SECRET.length > 0 &&
  CASDOOR_REDIRECT_URI.length > 0;

if (
  !AUTH_ENABLED &&
  (CASDOOR_CLIENT_ID || CASDOOR_CLIENT_SECRET || CASDOOR_REDIRECT_URI)
) {
  console.warn(
    "⚠️ Casdoor 配置不完整（缺 client_id / client_secret / redirect_uri 之一）—— 鉴权未开启",
  );
}

/**
 * 站点列表 —— 扫描 sites/ 下每个含 content/site.ts 的目录。
 *
 * 不硬编码站点清单 —— 加一个站点目录就自动出现在后台里。
 */
export interface SiteInfo {
  id: string;
  name: string;
  dir: string;
  /** 是否有 plan.json */
  hasPlan: boolean;
  /** 内容包里的 canonical（SEO 用）—— 不是后台访问地址，别拿来当域名展示 */
  canonicalUrl: string;
  /** 后台内置预览地址 —— 伺服 out/ 里刚构建的静态站 */
  previewUrl: string;
  /** out/index.html 的构建时间（ISO）—— 没有产物时为空 */
  outBuiltAt: string;
  /** 内容包 modules.generated.ts 的物化时间（ISO） */
  contentBuiltAt: string;
  /** 本地预览落后于内容包：发布只物化、没重建时会变成 true */
  outStale: boolean;
}

export async function listSites(): Promise<SiteInfo[]> {
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const dirs = await readdir(SITES_DIR, { withFileTypes: true });
  const sites: SiteInfo[] = [];

  for (const d of dirs) {
    if (!d.isDirectory() || d.name.startsWith(".")) continue;
    const dir = join(SITES_DIR, d.name);
    const contentPath = join(dir, "content", "site.ts");
    try {
      await stat(contentPath);
    } catch {
      continue;
    }

    let name = d.name;
    let canonicalUrl = "";
    try {
      const raw = await readFile(contentPath, "utf8");
      const m = raw.match(/name:\s*"([^"]+)"/);
      if (m?.[1]) name = m[1];
      // 只认顶层（两空格缩进）的 url —— organization.url 是另一个字段
      const u = raw.match(/^ {2}url:\s*["']([^"']+)["']/m);
      if (u?.[1]) canonicalUrl = u[1];
    } catch {
      /* 读不到就用目录名 */
    }

    let hasPlan = false;
    try {
      await stat(join(dir, "plan.json"));
      hasPlan = true;
    } catch {
      /* 没有 plan */
    }

    // 「我在后台改了，为什么网络预览里没有？」—— 十次有九次是
    // 只物化了内容包、没重建 out/。把两个时间戳摆到台面上，
    // 界面就能直接告诉用户预览是新的还是旧的，不用靠猜。
    const outStat = await stat(join(dir, "out", "index.html")).catch(() => null);
    const contentStat = await stat(join(dir, "content", "modules.generated.ts")).catch(
      () => null,
    );
    const outBuiltAt = outStat?.mtime.toISOString() ?? "";
    const contentBuiltAt = contentStat?.mtime.toISOString() ?? "";
    const outStale = !!(
      outStat &&
      contentStat &&
      contentStat.mtime.getTime() - outStat.mtime.getTime() > 1000
    );

    sites.push({
      id: d.name,
      name,
      dir,
      hasPlan,
      canonicalUrl,
      previewUrl: `/preview/${encodeURIComponent(d.name)}/`,
      outBuiltAt,
      contentBuiltAt,
      outStale,
    });
  }

  return sites;
}

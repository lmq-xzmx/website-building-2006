/**
 * 媒体库 —— 图片等静态资源的统一管理。
 *
 * ── 为什么必须有 ──────────────────────────────────────
 * 没有媒体库时，案例卡片、产品图、团队照只能填**外链 URL**：
 *   - 客户改了图，要去别处改，然后回来改内容包
 *   - 外链挂了，页面就出现空图（AI 抓取时是坏信号）
 *   - 换域名/CDN 时要逐条改
 *
 * 媒体库把资源收进站点自己的 `public/media/`，
 * 引用变成「选一个资产」而不是「贴一个 URL」。
 *
 * ── 落在哪 ────────────────────────────────────────────
 *   站点目录 public/media/    文件本体（构建时随 public/ 进静态站）
 *   站点目录 media.json       资产清单（后台管的机器可写层）
 *
 * 选 public/ 的理由：构建脚本已经把它复制进构建目录并产出到 out/，
 * 所以**零额外配置**就能被静态站访问。
 *
 * ── 与 GEO 的关系 ─────────────────────────────────────
 * 每个资产带 alt 文本 —— 图片缺 alt 是可访问性与 SEO 的硬伤，
 * 而 AI 引擎读站时也会把 alt 当图片的语义说明。
 */

export interface MediaAsset {
  /** 资产 id（站点内唯一） */
  id: string;
  /** 站内路径，如 /media/hero-2026.png */
  url: string;
  /** 原始文件名 */
  filename: string;
  /** MIME 类型 */
  mime: string;
  /** 字节数 */
  size: number;
  /**
   * 替代文本 —— **必填**（缺了就是可访问性硬伤）。
   * 描述图片内容，不是文件名。
   */
  alt: string;
  /** 图注（可选） */
  caption?: string;
  /** 分类：产品图 / 案例图 / 团队 / 资质 / 其它 */
  category?: string;
  /** 上传时间 */
  uploadedAt: string;
}

/** 媒体库清单 —— 一个站点一份 */
export interface MediaLibrary {
  version: 1;
  siteId: string;
  updatedAt: string;
  assets: MediaAsset[];
}

/** 允许的 MIME 类型 —— 白名单 */
export const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

/** 允许的文件扩展名 —— 双保险（有些客户端会伪造 MIME） */
export const ALLOWED_EXT: string[] = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "avif",
];

/** 单文件大小上限（字节）—— 默认 8MB */
export const MAX_MEDIA_SIZE = 8 * 1024 * 1024;

/** 空媒体库 */
export function emptyMediaLibrary(siteId: string): MediaLibrary {
  return {
    version: 1,
    siteId,
    updatedAt: new Date().toISOString(),
    assets: [],
  };
}

/**
 * 校验上传请求 —— 返回问题清单（空数组 = 通过）。
 */
export function validateMediaUpload(input: {
  filename: string;
  mime: string;
  size: number;
  alt?: string;
}): string[] {
  const problems: string[] = [];

  if (!input.filename?.trim()) {
    problems.push("缺文件名");
  } else {
    const ext = input.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.includes(ext)) {
      problems.push(
        `不支持的文件类型 .${ext}（允许：${ALLOWED_EXT.join(" / ")}）`,
      );
    }
  }

  if (!ALLOWED_MIME[input.mime]) {
    problems.push(`不支持的 MIME 类型 ${input.mime}`);
  }

  if (input.size <= 0) {
    problems.push("文件为空");
  } else if (input.size > MAX_MEDIA_SIZE) {
    problems.push(
      `文件过大（${Math.round(input.size / 1024 / 1024)}MB，上限 ${MAX_MEDIA_SIZE / 1024 / 1024}MB）`,
    );
  }

  // alt 缺失不阻止上传（可以后补），但要提醒
  if (!input.alt?.trim()) {
    problems.push("缺替代文本（alt）—— 图片的 alt 是可访问性与 SEO 的硬伤，建议补上");
  }

  return problems;
}

/** 生成资产 id */
export function newMediaId(): string {
  return `md_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 生成安全的文件名 —— 防路径穿越、防覆盖。
 *
 * 保留扩展名，其余部分用时间戳 + 随机串，
 * 避免同名覆盖（客户的 logo.png 更新后不该把旧的顶掉）。
 */
export function safeMediaName(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin";
  const base = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base || "file"}-${stamp}-${rand}.${ext}`.toLowerCase();
}

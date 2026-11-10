/**
 * 角色与权限 —— 后台的操作分权。
 *
 * ── 为什么要有 ────────────────────────────────────────
 * 企业站的后台不是一个人用：销售要改文案、编辑要写文章、
 * 主管要审内容发版。以前是「谁登录谁全能」——
 * 编辑手滑就能把没写完的内容推上线。
 *
 * ── 角色从哪来 ────────────────────────────────────────
 * Casdoor 认证时会把用户的 role 放进会话（apps/admin/src/session.ts）。
 * 本文件只负责**把角色名映射成权限**，不碰认证 ——
 * 认证是「你是谁」，权限是「你能干什么」，两件事分开。
 *
 * ── 角色名可配 ────────────────────────────────────────
 * Casdoor 里的角色名是业务自定义的（可能有中文），
 * 所以用环境变量指定哪个角色对应哪组权限：
 *   WB_ROLE_ADMIN    默认 admin
 *   WB_ROLE_EDITOR   默认 editor
 *   WB_ROLE_REVIEWER 默认 reviewer
 *
 * 未被映射到的角色 = **内容全权限（改 / 审 / 发），但不含站点管理**。
 *
 * 为什么不是「只读」（2026-11-11 定的）：
 *   Casdoor 登录时已经校验过 organization —— 组织才是真正的边界。
 *   角色是组织**内部**的分工细化，生产环境往往根本没配角色名；
 *   若未识别就锁死，后台会变成「所有按钮都 403」，工具直接不可用
 *   （实测踩过：媒体上传 403）。
 *   真正的硬边界（建站点 / 删站点）仍然只给 admin 组。
 *
 * 想收紧就把 WB_ROLE_DEFAULT_GROUP 设成 guest（只读），
 * 或用 WB_ROLE_ADMIN / EDITOR / REVIEWER 指定角色名。
 *
 * ⚠️ 客户端密钥与角色名都不进仓库：密钥在环境变量，
 *    角色名在生产机的 /data/secrets/wb.env。
 */

import type { SessionUser } from "./session.js";

/** 权限项 —— 粒度按「会不会改变线上内容」划 */
export type Permission =
  /** 读后台（所有已登录用户都有） */
  | "site.read"
  /** 改内容：编排、条目、媒体、片段 */
  | "content.edit"
  /** 提交审核 / 通过 / 驳回 */
  | "content.review"
  /** 发布上线（物化 + 重建） */
  | "content.publish"
  /** 站点级管理：新建站点、删站点 */
  | "site.manage";

/** 权限组 —— 一组权限的别名 */
export type RoleKey = "admin" | "editor" | "reviewer" | "content" | "guest";

/** 每个角色组的权限 */
export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  // 管理员：什么都干
  admin: ["site.read", "content.edit", "content.review", "content.publish", "site.manage"],
  // 编辑：写内容、提交审核 —— **不能自己发布**
  editor: ["site.read", "content.edit"],
  // 审核员：改内容 + 审核 + 发布
  reviewer: ["site.read", "content.edit", "content.review", "content.publish"],
  // 未识别角色的默认档：内容全权限，但**不能建/删站点**
  content: ["site.read", "content.edit", "content.review", "content.publish"],
  // 只读：什么都不做
  guest: ["site.read"],
};

/** 未识别角色落到哪一档 —— 默认 content（可用环境变量收紧） */
function defaultGroup(): RoleKey {
  const v = (process.env.WB_ROLE_DEFAULT_GROUP ?? "").trim();
  if (
    v === "guest" ||
    v === "content" ||
    v === "admin" ||
    v === "editor" ||
    v === "reviewer"
  ) {
    return v;
  }
  return "content";
}

/** 角色名 → 权限组（可用环境变量覆盖） */
function roleMapping(): Record<string, RoleKey> {
  return {
    [process.env.WB_ROLE_ADMIN?.trim() || "admin"]: "admin",
    [process.env.WB_ROLE_EDITOR?.trim() || "editor"]: "editor",
    [process.env.WB_ROLE_REVIEWER?.trim() || "reviewer"]: "reviewer",
  };
}

/**
 * 算出某个用户的权限集合。
 *
 * 未登录 → 空集。
 * 角色识别不出来 → 落到默认档（默认 content：内容全权限，不含 site.manage）。
 */
export function permissionsOf(user: SessionUser | null): Set<Permission> {
  const out = new Set<Permission>();
  if (!user) return out;

  const mapping = roleMapping();
  const role = (user.role ?? "").trim();
  // 未识别的角色 → 默认档（内容全权限，不含 site.manage）
  const key = mapping[role] ?? defaultGroup();
  for (const p of ROLE_PERMISSIONS[key]) out.add(p);
  return out;
}

/** 有没有这个权限 */
export function can(
  user: SessionUser | null,
  permission: Permission,
): boolean {
  return permissionsOf(user).has(permission);
}

/** 权限不足时给用户看的说明 */
export function denyMessage(permission: Permission): string {
  const map: Record<Permission, string> = {
    "site.read": "没有查看权限",
    "content.edit": "没有内容编辑权限",
    "content.review": "没有审核权限",
    "content.publish": "没有发布权限",
    "site.manage": "没有站点管理权限",
  };
  return map[permission] ?? "没有该操作权限";
}

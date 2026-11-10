import { describe, expect, it } from "vitest";

import {
  can,
  denyMessage,
  permissionsOf,
  ROLE_PERMISSIONS,
} from "../rbac.js";
import type { SessionUser } from "../session.js";

const user = (role: string): SessionUser => ({
  id: "u1",
  name: "u1",
  displayName: "某人",
  email: "u@example.com",
  organization: "zhongkeju",
  role,
});

describe("RBAC：角色到权限", () => {
  it("管理员什么都能干", () => {
    const p = permissionsOf(user("admin"));
    expect(p.has("content.edit")).toBe(true);
    expect(p.has("content.review")).toBe(true);
    expect(p.has("content.publish")).toBe(true);
    expect(p.has("site.manage")).toBe(true);
  });

  it("编辑能改内容但不能发布", () => {
    const p = permissionsOf(user("editor"));
    expect(p.has("content.edit")).toBe(true);
    expect(p.has("content.publish")).toBe(false);
    expect(p.has("content.review")).toBe(false);
  });

  it("审核员能审核与发布", () => {
    const p = permissionsOf(user("reviewer"));
    expect(p.has("content.review")).toBe(true);
    expect(p.has("content.publish")).toBe(true);
  });

  it("认不出来的角色落默认档：内容全权限，但不含站点管理", () => {
    const p = permissionsOf(user("某个没配过的角色"));
    expect(p.has("site.read")).toBe(true);
    expect(p.has("content.edit")).toBe(true);
    expect(p.has("content.publish")).toBe(true);
    // 硬边界：建站删站仍然只给 admin 组
    expect(p.has("site.manage")).toBe(false);
  });

  it("显式配成 editor 的角色仍受限于 editor", () => {
    const p = permissionsOf(user("editor"));
    expect(p.has("content.edit")).toBe(true);
    expect(p.has("content.publish")).toBe(false);
  });

  it("未登录没有任何权限", () => {
    expect(permissionsOf(null).size).toBe(0);
    expect(can(null, "site.read")).toBe(false);
  });

  it("can 与 permissionsOf 一致", () => {
    expect(can(user("editor"), "content.edit")).toBe(true);
    expect(can(user("editor"), "content.publish")).toBe(false);
  });
});

describe("RBAC：提示语", () => {
  it("每种权限都有中文说明", () => {
    for (const key of Object.keys(ROLE_PERMISSIONS)) {
      for (const perm of ROLE_PERMISSIONS[key as keyof typeof ROLE_PERMISSIONS]) {
        expect(denyMessage(perm)).toContain("权限");
      }
    }
  });
});

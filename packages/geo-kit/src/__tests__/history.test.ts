import { describe, expect, it } from "vitest";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  diffPlans,
  formatVersionId,
  nextVersionId,
  parseVersionId,
  readModulePlan,
  readVersionIndex,
  readVersionPlan,
  renderPlanDiff,
  rollbackToVersion,
  snapshotPlan,
  writeModulePlan,
  DEFAULT_KEEP_VERSIONS,
  type ModulePlan,
  type PageModule,
} from "../index.js";

async function tmpSite(): Promise<string> {
  return mkdtemp(join(tmpdir(), "geo-hist-"));
}

/** 造一份编排 —— 标题可配，方便比 diff */
function plan(title: string, itemTitle = "条目"): ModulePlan {
  const mod: PageModule = {
    id: "mod1",
    type: "rich-text",
    title: "模块",
    items: [
      {
        id: "it1",
        source: "manual",
        title: itemTitle,
        order: 0,
        published: true,
        body: { type: "doc", content: [{ type: "paragraph" }] },
      },
    ],
    order: 0,
    enabled: true,
  };
  return {
    version: 1,
    siteId: "demo",
    kbId: "default",
    updatedAt: "2026-11-01T00:00:00Z",
    pages: [
      {
        id: "pg1",
        path: "/",
        title,
        description: "首页",
        modules: [mod],
        order: 0,
        published: true,
      },
    ],
  };
}

describe("版本历史：版本号", () => {
  it("时间戳版本号可读且能排序", () => {
    const a = formatVersionId(new Date(2026, 10, 11, 9, 5, 30, 42));
    const b = formatVersionId(new Date(2026, 10, 11, 9, 5, 31, 0));
    expect(a).toBe("20261111-090530-042");
    expect(a < b).toBe(true);
    expect(parseVersionId(a)).toBeGreaterThan(0);
  });

  it("同一毫秒连发两次 —— 版本号仍然递增", () => {
    const now = new Date(2026, 10, 11, 9, 5, 30, 42);
    const first = nextVersionId([], now);
    const second = nextVersionId([first], now);
    expect(second > first).toBe(true);
  });

  it("已有的版本号在后面时，新版本号排到它后面", () => {
    const existing = formatVersionId(new Date(2026, 10, 11, 9, 5, 30, 42));
    const next = nextVersionId([existing], new Date(2026, 10, 11, 9, 0, 0, 0));
    expect(next > existing).toBe(true);
  });
});

describe("版本历史：快照", () => {
  it("快照写入文件并记进索引", async () => {
    const dir = await tmpSite();
    try {
      const entry = await snapshotPlan(dir, "demo", plan("首页"), {
        author: "张三",
        reason: "发布",
      });
      expect(entry.id).toMatch(/^\d{8}-\d{6}-\d{3}$/);
      expect(entry.author).toBe("张三");
      expect(entry.stats.pages).toBe(1);
      expect(entry.stats.modules).toBe(1);
      expect(entry.stats.items).toBe(1);

      const index = await readVersionIndex(dir, "demo");
      expect(index.versions).toHaveLength(1);
      expect(index.versions[0].id).toBe(entry.id);

      const snap = await readVersionPlan(dir, entry.id);
      expect(snap?.pages[0].title).toBe("首页");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("版本号单调递增", async () => {
    const dir = await tmpSite();
    try {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const e = await snapshotPlan(dir, "demo", plan("首页 " + i));
        ids.push(e.id);
      }
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
      expect(new Set(ids).size).toBe(5);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("超出保留份数 —— 删最旧的（应用自己的历史目录，删是安全的）", async () => {
    const dir = await tmpSite();
    try {
      await snapshotPlan(dir, "demo", plan("v0"), { keep: 3 });
      const first = await readVersionIndex(dir, "demo");
      const oldestId = first.versions[first.versions.length - 1].id;

      for (let i = 1; i <= 5; i++) {
        await snapshotPlan(dir, "demo", plan("v" + i), { keep: 3 });
      }
      const index = await readVersionIndex(dir, "demo");
      expect(index.versions).toHaveLength(3);

      const files = await readdir(join(dir, "history"));
      const snaps = files.filter((f) => f.endsWith(".json") && f !== "index.json");
      expect(snaps).toHaveLength(3);
      // 最旧的那份快照文件已被删掉
      expect(files).not.toContain(`${oldestId}.json`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("默认保留份数是 30", () => {
    expect(DEFAULT_KEEP_VERSIONS).toBe(30);
  });
});

describe("版本历史：回滚", () => {
  it("回滚后编排内容正确", async () => {
    const dir = await tmpSite();
    try {
      const good = plan("好版本");
      const v = await snapshotPlan(dir, "demo", good);

      // 之后又改坏了
      await writeModulePlan(dir, plan("坏版本"));
      const cur = await readModulePlan(dir, "demo");
      expect(cur.pages[0].title).toBe("坏版本");

      const result = await rollbackToVersion(dir, "demo", v.id);
      expect(result).not.toBeNull();

      const after = await readModulePlan(dir, "demo");
      expect(after.pages[0].title).toBe("好版本");
      expect(after.pages[0].modules[0].items[0].id).toBe("it1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("回滚本身也产生新版本 —— 历史不丢", async () => {
    const dir = await tmpSite();
    try {
      const v = await snapshotPlan(dir, "demo", plan("v1"));
      await writeModulePlan(dir, plan("v2"));
      await rollbackToVersion(dir, "demo", v.id);

      const index = await readVersionIndex(dir, "demo");
      expect(index.versions.length).toBeGreaterThanOrEqual(3);
      // 最新的一条说明是回滚
      expect(index.versions[0].reason).toContain("回滚到");
      // 原来的版本还在
      expect(index.versions.some((x) => x.id === v.id)).toBe(true);
      // 回滚前的状态也留了档
      expect(index.versions.some((x) => x.reason.includes("回滚前状态"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("回滚到不存在的版本 —— 返回 null", async () => {
    const dir = await tmpSite();
    try {
      const result = await rollbackToVersion(dir, "demo", "20260101-000000-000");
      expect(result).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("版本历史：差异", () => {
  it("页面/模块/条目的增删改都能看出来", () => {
    const base = plan("旧标题", "旧条目");
    const target = plan("新标题", "新条目");

    const diff = diffPlans(base, target);
    expect(diff.summary.changed).toBeGreaterThan(0);
    const details = diff.entries.map((e) => e.detail).join("；");
    expect(details).toContain("标题");
    expect(details).toContain("新标题");

    // 条目改名也算改 —— 详情里点明是条目的标题
    const itemChange = diff.entries.find((e) => e.scope === "item");
    expect(itemChange?.detail).toContain("新条目");
  });

  it("新增页面算 added", () => {
    const base = plan("首页");
    const target = plan("首页");
    target.pages.push({
      id: "pg2",
      path: "/about",
      title: "关于我们",
      description: "关于",
      modules: [],
      order: 1,
      published: true,
    });

    const diff = diffPlans(base, target);
    expect(diff.summary.added).toBe(1);
    const added = diff.entries.find((e) => e.kind === "added");
    expect(added?.scope).toBe("page");
    expect(added?.path).toBe("关于我们");
  });

  it("删除模块算 removed", () => {
    const base = plan("首页");
    const target = plan("首页");
    target.pages[0].modules = [];

    const diff = diffPlans(base, target);
    expect(diff.summary.removed).toBe(1);
    expect(diff.entries[0].scope).toBe("module");
  });

  it("没改就报「一致」", () => {
    const diff = diffPlans(plan("首页"), plan("首页"));
    expect(diff.entries).toHaveLength(0);
    expect(renderPlanDiff(diff)).toContain("没有差异");
  });

  it("正文改了要说清楚 —— 富文本太长不进逐字段描述", () => {
    const base = plan("首页");
    const target = plan("首页");
    target.pages[0].modules[0].items[0].body = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "改了" }] }],
    };

    const diff = diffPlans(base, target);
    expect(diff.summary.changed).toBe(1);
    expect(diff.entries[0].detail).toContain("正文");
  });

  it("差异文本可读 —— 行级 diff", () => {
    const diff = diffPlans(plan("旧"), plan("新"));
    const text = renderPlanDiff(diff);
    expect(text).toContain("~");
    expect(text).toContain("旧");
    expect(text).toContain("新");
  });
});

describe("版本历史：与真实文件配合", () => {
  it("快照的是当时的整份编排 —— 回滚不需要任何转换", async () => {
    const dir = await tmpSite();
    try {
      const p = plan("首页");
      await writeModulePlan(dir, p);
      const onDisk = await readModulePlan(dir, "demo");
      const v = await snapshotPlan(dir, "demo", onDisk);

      const snap = await readVersionPlan(dir, v.id);
      expect(JSON.stringify(snap?.pages)).toBe(JSON.stringify(p.pages));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("索引文件坏了也不影响读快照", async () => {
    const dir = await tmpSite();
    try {
      const v = await snapshotPlan(dir, "demo", plan("首页"));
      await writeFile(join(dir, "history", "index.json"), "坏了", "utf8");
      const index = await readVersionIndex(dir, "demo");
      expect(index.versions).toEqual([]);
      // 快照文件本身还在
      const snap = await readVersionPlan(dir, v.id);
      expect(snap?.pages[0].title).toBe("首页");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

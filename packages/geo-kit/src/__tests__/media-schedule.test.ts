import { describe, expect, it } from "vitest";

import {
  emptyMediaLibrary,
  newMediaId,
  safeMediaName,
  validateMediaUpload,
  ALLOWED_MIME,
  ALLOWED_EXT,
  MAX_MEDIA_SIZE,
} from "../media/types.js";
import {
  isPublishDue,
  compareForDisplay,
} from "../modules/materialize.js";
import { normalizePath } from "../modules/validate.js";
import type { ModuleItem } from "../modules/types.js";

describe("媒体库：上传校验", () => {
  it("接受白名单内的类型", () => {
    for (const mime of Object.keys(ALLOWED_MIME)) {
      const ext = ALLOWED_MIME[mime];
      const problems = validateMediaUpload({
        filename: `a.${ext}`,
        mime,
        size: 1000,
        alt: "一张图",
      });
      expect(problems).toEqual([]);
    }
  });

  it("拒绝非图片类型", () => {
    const problems = validateMediaUpload({
      filename: "a.pdf",
      mime: "application/pdf",
      size: 1000,
      alt: "x",
    });
    expect(problems.join()).toContain("不支持");
  });

  it("伪装 MIME 也拦（按扩展名判）", () => {
    const problems = validateMediaUpload({
      filename: "evil.exe",
      mime: "image/png",
      size: 1000,
      alt: "x",
    });
    expect(problems.join()).toContain("不支持");
  });

  it("超限拦下", () => {
    const problems = validateMediaUpload({
      filename: "a.png",
      mime: "image/png",
      size: MAX_MEDIA_SIZE + 1,
      alt: "x",
    });
    expect(problems.join()).toContain("过大");
  });

  it("空文件拦下", () => {
    const problems = validateMediaUpload({
      filename: "a.png",
      mime: "image/png",
      size: 0,
      alt: "x",
    });
    expect(problems.join()).toContain("为空");
  });

  it("缺 alt 只提醒不拦（可后补）", () => {
    const problems = validateMediaUpload({
      filename: "a.png",
      mime: "image/png",
      size: 100,
    });
    expect(problems.join()).toContain("替代文本");
    // 只有一个问题，且是提醒
    expect(problems).toHaveLength(1);
  });
});

describe("媒体库：文件名安全化", () => {
  it("去掉路径分隔符与特殊字符", () => {
    const name = safeMediaName("../../etc/passwd.png");
    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
    expect(name.endsWith(".png")).toBe(true);
  });

  it("保留扩展名", () => {
    expect(safeMediaName("logo.svg").endsWith(".svg")).toBe(true);
    expect(safeMediaName("照片.JPEG").endsWith(".jpeg")).toBe(true);
  });

  it("同名不同名（避免覆盖）", () => {
    expect(safeMediaName("logo.png")).not.toBe(safeMediaName("logo.png"));
  });

  it("中文名也安全", () => {
    const name = safeMediaName("产品图 2026.png");
    expect(name).not.toContain(" ");
    expect(name.endsWith(".png")).toBe(true);
  });
});

describe("媒体库：资产 id 唯一", () => {
  it("两次生成不同", () => {
    expect(newMediaId()).not.toBe(newMediaId());
  });
});

describe("定时发布", () => {
  const now = new Date("2026-11-10T12:00:00Z");

  it("没设时间 = 立即生效", () => {
    expect(isPublishDue(undefined, now)).toBe(true);
  });

  it("已过时间 = 生效", () => {
    expect(isPublishDue("2026-11-10T11:00:00Z", now)).toBe(true);
  });

  it("未到时间 = 未生效", () => {
    expect(isPublishDue("2026-11-10T13:00:00Z", now)).toBe(false);
  });

  it("时间串坏了不卡发布", () => {
    expect(isPublishDue("不是时间", now)).toBe(true);
  });
});

describe("置顶排序", () => {
  const mk = (order: number, sticky?: boolean) => ({ order, sticky });

  it("置顶的排最前", () => {
    const list = [mk(1), mk(2, true), mk(3)];
    list.sort(compareForDisplay);
    expect(list[0].sticky).toBe(true);
  });

  it("置顶优先于 order", () => {
    const list = [mk(0, true), mk(9)];
    list.sort(compareForDisplay);
    expect(list[0].sticky).toBe(true);
  });

  it("其余按 order 升序", () => {
    const list = [mk(3), mk(1), mk(2)];
    list.sort(compareForDisplay);
    expect(list.map((x) => x.order)).toEqual([1, 2, 3]);
  });
});

describe("栏目树：路径", () => {
  it("子页面路径规范化", () => {
    expect(normalizePath("about/")).toBe("/about");
    expect(normalizePath("/about")).toBe("/about");
  });
});

describe("条目字段：图片与定时", () => {
  it("ModuleItem 支持 image / publishAt / sticky", () => {
    const item: ModuleItem = {
      id: "i1",
      source: "manual",
      order: 0,
      published: true,
      image: "/media/a.png",
      publishAt: "2026-11-10T13:00:00Z",
      sticky: true,
    };
    expect(item.image).toBe("/media/a.png");
    expect(item.sticky).toBe(true);
  });
});

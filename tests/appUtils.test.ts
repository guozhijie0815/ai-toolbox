import { describe, expect, it } from "vitest";
import {
  hasTauriRuntime,
  normalizeFsPath,
  formatTime,
  isInteractiveDragTarget,
} from "../src/utils/appUtils";

describe("hasTauriRuntime", () => {
  it("jsdom 环境下返回 false", () => {
    expect(hasTauriRuntime()).toBe(false);
  });
});

describe("normalizeFsPath", () => {
  const HOME = "/Users/test";

  it("将 ~ 替换为 home 目录", () => {
    expect(normalizeFsPath(HOME, "~/Documents")).toBe(
      "/Users/test/Documents",
    );
  });

  it("移除末尾斜杠", () => {
    expect(normalizeFsPath(HOME, "/foo/bar///")).toBe("/foo/bar");
  });

  it("home 为空时仅移除末尾斜杠", () => {
    expect(normalizeFsPath("", "~/foo/")).toBe("~/foo");
  });

  it("输入 undefined 返回 undefined", () => {
    expect(normalizeFsPath(HOME, undefined)).toBeUndefined();
  });
});

describe("formatTime", () => {
  it("undefined/0 返回未知时间", () => {
    expect(formatTime(undefined)).toBe("未知时间");
    expect(formatTime(0)).toBe("未知时间");
  });

  it("有效时间戳返回格式化字符串", () => {
    const result = formatTime(1700000000);
    expect(typeof result).toBe("string");
    expect(result).not.toBe("未知时间");
  });
});

describe("isInteractiveDragTarget", () => {
  it("null 返回 false", () => {
    expect(isInteractiveDragTarget(null)).toBe(false);
  });

  it("button 元素返回 true", () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    expect(isInteractiveDragTarget(btn)).toBe(true);
    document.body.removeChild(btn);
  });

  it("普通 div 返回 false", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    expect(isInteractiveDragTarget(div)).toBe(false);
    document.body.removeChild(div);
  });
});

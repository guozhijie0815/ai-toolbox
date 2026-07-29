import { describe, expect, it } from "vitest";
import { getErrorMessage } from "../src/utils/errorUtils";

describe("getErrorMessage", () => {
  it("从 Error 对象提取 message", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("直接返回 string 类型错误", () => {
    expect(getErrorMessage("网络异常")).toBe("网络异常");
  });

  it("未知类型返回默认 fallback", () => {
    expect(getErrorMessage(42)).toBe("操作失败");
    expect(getErrorMessage(null)).toBe("操作失败");
    expect(getErrorMessage(undefined)).toBe("操作失败");
  });

  it("模型不支持图片输入时返回友好提示", () => {
    expect(
      getErrorMessage(new Error('Cannot read "image.png" (this model does not support image input)')),
    ).toBe('该模型不支持图片输入，请更换支持视觉能力的模型')
  });

  it("支持自定义 fallback", () => {
    expect(getErrorMessage(42, "自定义错误")).toBe("自定义错误")
  });
});

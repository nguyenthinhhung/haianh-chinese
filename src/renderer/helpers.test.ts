import { describe, expect, it } from "vitest";
import { autoText, splitParts, stableShuffle, vi } from "./helpers";

describe("splitParts", () => {
  it("splits at slashes and drops empty parts", () => {
    expect(splitParts(" 我 / 是 /学生/ ")).toEqual(["我", "是", "学生"]);
    expect(splitParts("我是学生")).toEqual(["我是学生"]);
    expect(splitParts(" / ")).toEqual([]);
  });
});

describe("stableShuffle", () => {
  it("is a permutation that is the same for the same seed", () => {
    const a = stableShuffle(8, "s_abc123");
    expect([...a].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(stableShuffle(8, "s_abc123")).toEqual(a);
  });

  it("never returns the original order for two or more items", () => {
    for (let n = 2; n <= 6; n++) {
      for (let s = 0; s < 200; s++) {
        const order = stableShuffle(n, `s_${s}`);
        expect(order.some((v, i) => v !== i), `n=${n} seed=${s}`).toBe(true);
      }
    }
  });

  it("handles empty and single lists", () => {
    expect(stableShuffle(0, "x")).toEqual([]);
    expect(stableShuffle(1, "x")).toEqual([0]);
  });
});

describe("language tagging", () => {
  it("tags Chinese written inside Vietnamese text", () => {
    expect(vi("Cảm ơn: 谢谢 (xiè xie)")).toBe('<span lang="vi">Cảm ơn: <span lang="zh-CN">谢谢</span> (xiè xie)</span>');
    expect(vi("你好，再见 nhé")).toBe('<span lang="vi"><span lang="zh-CN">你好，再见</span> nhé</span>');
  });

  it("tags all-Chinese text as Chinese and mixed text as Vietnamese", () => {
    expect(autoText("苹果")).toBe('<span lang="zh-CN">苹果</span>');
    expect(autoText("水果 hoa quả")).toBe('<span lang="vi"><span lang="zh-CN">水果</span> hoa quả</span>');
    expect(autoText("con mèo")).toBe('<span lang="vi">con mèo</span>');
  });

  it("still escapes every part", () => {
    expect(vi("<b>你</b>")).toBe('<span lang="vi">&lt;b&gt;<span lang="zh-CN">你</span>&lt;/b&gt;</span>');
  });
});

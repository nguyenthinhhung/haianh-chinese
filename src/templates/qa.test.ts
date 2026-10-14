import { describe, expect, it } from "vitest";
import { parseBlanks } from "./fill-blank";
import { tonesOf } from "./tone-pick";

describe("tonesOf", () => {
  it("reads tone marks per syllable", () => {
    expect(tonesOf("mā má mǎ mà ma")).toEqual([1, 2, 3, 4, 0]);
    expect(tonesOf("nǚ lǜ")).toEqual([3, 4]);
    expect(tonesOf("Nǐ hǎo!")).toEqual([3, 3]);
  });

  it("reads tone numbers", () => {
    expect(tonesOf("ni3 hao3 ma5")).toEqual([3, 3, 0]);
  });

  it("handles decomposed marks and empty input", () => {
    expect(tonesOf("mǎ")).toEqual([3]);
    expect(tonesOf("  ")).toEqual([]);
  });
});

describe("parseBlanks", () => {
  it("splits text around bracketed blanks", () => {
    expect(parseBlanks("我[是]学生。")).toEqual([
      { text: "我", blank: false },
      { text: "是", blank: true },
      { text: "学生。", blank: false },
    ]);
  });

  it("keeps blanks at the edges and trims their answers", () => {
    expect(parseBlanks("[ 你 ]好[吗]")).toEqual([
      { text: "你", blank: true },
      { text: "好", blank: false },
      { text: "吗", blank: true },
    ]);
  });

  it("returns plain text when there is no blank", () => {
    expect(parseBlanks("你好")).toEqual([{ text: "你好", blank: false }]);
  });
});

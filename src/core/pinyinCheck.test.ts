import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { pinyinWarnings } from "./pinyinCheck";
import type { Slide } from "./schema";

const { templates } = testEnv();
const slide = (type: string, content: unknown): Slide => ({ id: "s_1", type, content });

describe("pinyinWarnings", () => {
  it("accepts one spaced syllable per character, across the templates' formats", () => {
    const slides = [
      slide("cover", { title: "动物", pinyin: "dòng wù" }),
      slide("vocabulary", { words: [{ hanzi: "苹果", pinyin: "píng guǒ" }, { hanzi: "哪儿", pinyin: "nǎr" }] }),
      slide("grammar", { examples: [{ hanzi: "我 / 是 / 学生", pinyin: "wǒ / shì / xué shēng" }] }),
      slide("fill-blank", { sentences: [{ text: "我[是]学生。", pinyin: "wǒ [shì] xué shēng." }] }),
      slide("matching", { pairs: [{ left: "猫", leftPinyin: "māo" }] }),
      slide("dialogue", { lines: [{ hanzi: "你好！", pinyin: "nǐ hǎo!" }] }),
    ];
    expect(pinyinWarnings(slides, templates)).toEqual([]);
  });

  it("flags joined syllables and wrong counts with the slide", () => {
    const slides = [slide("vocabulary", { words: [{ hanzi: "苹果", pinyin: "píngguǒ" }] }), slide("matching", { pairs: [{ left: "猫", leftPinyin: "xiǎo māo" }] })];
    const warnings = pinyinWarnings(slides, templates);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/^Slide 1 \(Từ vựng\): "苹果" có 2 chữ nhưng pinyin "píngguǒ" có 1 âm tiết/);
    expect(warnings[1]).toMatch(/^Slide 2 /);
  });

  it("skips text with Latin letters or digits and empty pinyin", () => {
    const slides = [slide("vocabulary", { words: [{ hanzi: "3个", pinyin: "sān gè x" }, { hanzi: "猫", pinyin: "" }] })];
    expect(pinyinWarnings(slides, templates)).toEqual([]);
  });
});

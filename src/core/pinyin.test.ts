import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { fillMissingPinyin, hanziToPinyin, misreadCharacters, pinyinFits, pinyinPairs } from "./pinyin";

const { templates } = testEnv();

describe("hanziToPinyin", () => {
  it("picks readings from the word around a character", () => {
    expect(hanziToPinyin("长城")).toBe("cháng chéng");
    expect(hanziToPinyin("长大")).toBe("zhǎng dà");
    expect(hanziToPinyin("银行")).toBe("yín háng");
  });

  it("writes neutral tones, 一/不 tone changes and 儿 the way textbooks do", () => {
    expect(hanziToPinyin("我们是好朋友")).toBe("wǒ men shì hǎo péng you");
    expect(hanziToPinyin("一个")).toBe("yí gè");
    expect(hanziToPinyin("不是")).toBe("bú shì");
    expect(hanziToPinyin("你去哪儿")).toBe("nǐ qù nǎr");
    expect(hanziToPinyin("我吃饺子和橙子")).toBe("wǒ chī jiǎo zi hé chéng zi");
    expect(hanziToPinyin("孔子")).toBe("kǒng zǐ");
    expect(hanziToPinyin("月亮和星星")).toBe("yuè liang hé xīng xing");
  });

  it("keeps the markers templates use, with punctuation in Latin form", () => {
    expect(hanziToPinyin("我[是]学生。")).toBe("wǒ [shì] xué sheng.");
    expect(hanziToPinyin("我 / 是 / 学生")).toBe("wǒ / shì / xué sheng");
    expect(hanziToPinyin("你好！这是什么？")).toBe("nǐ hǎo! zhè shì shén me?");
    expect(hanziToPinyin("我和丈夫___五年了。")).toBe("wǒ hé zhàng fu ___ wǔ nián le.");
    expect(hanziToPinyin("")).toBe("");
    // A Vietnamese question has no pinyin, rather than a copy of itself.
    expect(hanziToPinyin("Bạn tên là gì?")).toBe("");
  });
});

describe("misreadCharacters", () => {
  it("accepts any reading a character has, neutral tones and tone changes", () => {
    expect(misreadCharacters("还书", "huán shū")).toEqual([]);
    expect(misreadCharacters("朋友", "péng yǒu")).toEqual([]);
    expect(misreadCharacters("朋友", "péng you")).toEqual([]);
    expect(misreadCharacters("一个", "yí gè")).toEqual([]);
    expect(misreadCharacters("一个", "yī gè")).toEqual([]);
    expect(misreadCharacters("绿", "lv")).toEqual([]);
  });

  it("names the characters whose syllable cannot be right, with the likely reading", () => {
    expect(misreadCharacters("猫", "mǎo")).toEqual([{ char: "猫", wrote: "mǎo", expected: "māo" }]);
    expect(misreadCharacters("兔子", "tù zǐ / extra")).toEqual([]); // counts differ: not checked here
    expect(misreadCharacters("熊猫", "xióng gǒu")).toEqual([{ char: "猫", wrote: "gǒu", expected: "māo" }]);
  });
});

describe("pinyinFits", () => {
  it("accepts right pinyin written differently and rejects what cannot be right", () => {
    expect(pinyinFits("橙子", "chéng zi")).toBe(true);
    expect(pinyinFits("橙子", "chéng zǐ")).toBe(true);
    expect(pinyinFits("哪儿", "nǎr")).toBe(true);
    expect(pinyinFits("哪儿", "nǎ ér")).toBe(true);
    expect(pinyinFits("猫", "mǎo")).toBe(false);
    expect(pinyinFits("苹果", "píngguǒ")).toBe(false);
    expect(pinyinFits("", "abc")).toBe(true);
  });
});

describe("pinyinPairs / fillMissingPinyin", () => {
  it("pairs every template's pinyin field with the Chinese field before it", () => {
    const pairs = templates.require("matching").editor.find((f) => f.kind === "list");
    expect(pairs?.kind === "list" && pinyinPairs(pairs.fields)).toEqual([{ hanzi: "left", pinyin: "leftPinyin" }]);
    for (const t of templates.list()) {
      const walk = (fields: typeof t.editor) => {
        for (const f of fields) {
          if (f.kind === "list") walk(f.fields);
          if (f.kind === "text" && f.lang === "pinyin") expect(pinyinPairs(fields).some((p) => p.pinyin === f.key), `${t.type}.${f.key}`).toBe(true);
        }
      };
      walk(t.editor);
    }
  });

  it("fills only empty pinyin, through lists, and leaves complete content untouched", () => {
    const fields = templates.require("vocabulary").editor;
    const content = { words: [{ hanzi: "猫", pinyin: "" }, { hanzi: "狗", pinyin: "gǒu" }] };
    expect(fillMissingPinyin(content, fields)).toEqual({ words: [{ hanzi: "猫", pinyin: "māo" }, { hanzi: "狗", pinyin: "gǒu" }] });
    const complete = { words: [{ hanzi: "狗", pinyin: "gǒu" }] };
    expect(fillMissingPinyin(complete, fields)).toBe(complete);
  });
});

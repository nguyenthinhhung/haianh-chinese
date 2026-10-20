import { describe, expect, it } from "vitest";
import { newOption, QUESTION_KINDS } from "./exercise";
import { answerText, expectedText, questionLine } from "./exerciseText";
import type { Question } from "./exerciseSchema";

type Of<T extends Question["type"]> = Extract<Question, { type: T }>;
const blank = <T extends Question["type"]>(type: T) => QUESTION_KINDS[type].blank() as Of<T>;

describe("answers in words", () => {
  it("names options by their text, since each student saw another order", () => {
    const q: Of<"choice"> = { ...blank("choice"), options: [{ ...newOption(), text: "名字", correct: true }, { ...newOption(), text: "" }] };
    expect(answerText(q, q.options[0]!.id)).toBe("名字");
    expect(answerText(q, q.options[1]!.id)).toBe("(trống)");
    expect(expectedText(q)).toBe("名字");
    expect(answerText(q, "o_unknown1")).toBe("");
  });

  it("writes out matching, the word box and sorting item by item", () => {
    const m: Of<"matching"> = { ...blank("matching") };
    m.pairs = m.pairs.map((p, i) => ({ ...p, left: ["猫", "狗", "鱼"][i]!, right: ["mèo", "chó", "cá"][i]! }));
    expect(answerText(m, { [m.pairs[0]!.id]: m.pairs[1]!.rightId })).toBe("猫 → chó");
    expect(expectedText(m)).toBe("猫 → mèo; 狗 → chó; 鱼 → cá");

    const w: Of<"word-bank"> = { ...blank("word-bank") };
    w.bank = w.bank.map((b, i) => ({ ...b, text: ["一", "二", "三", "四"][i]! }));
    w.gaps = [{ ...w.gaps[0]!, text: "___个", answer: "二" }];
    expect(expectedText(w)).toBe("(1) 二");

    const s: Of<"sort-groups"> = { ...blank("sort-groups") };
    s.groups = s.groups.map((g, i) => ({ ...g, name: ["水果", "动物"][i]! }));
    s.cards = [{ ...s.cards[0]!, text: "猫", group: "2" }];
    expect(expectedText(s)).toBe("猫 → 动物");
  });

  it("covers the remaining kinds", () => {
    expect(answerText({ ...blank("true-false"), answer: true }, false)).toBe("Sai");
    expect(answerText(blank("tone-pick"), "3")).toBe("Thanh 3");
    expect(expectedText({ ...blank("sentence-order"), sentence: "我 / 是 / 学生" })).toBe("我 是 学生");
    expect(expectedText({ ...blank("fill-text"), accepted: [{ text: "你好" }, { text: "nǐ hǎo" }] })).toBe("你好 / nǐ hǎo");
    expect(expectedText({ ...blank("writing"), sample: "我喜欢汉语。" })).toBe("我喜欢汉语。");
    expect(answerText(blank("writing"), undefined)).toBe("");
  });

  it("sums a question up in one short line", () => {
    expect(questionLine({ ...blank("choice"), prompt: "  男的\n问什么？ " })).toBe("男的 问什么？");
    const m: Of<"matching"> = { ...blank("matching") };
    m.pairs = m.pairs.map((p, i) => ({ ...p, left: ["猫", "狗", "鱼"][i]! }));
    expect(questionLine(m)).toBe("猫, 狗, 鱼");
    expect(questionLine({ ...blank("choice"), prompt: "字".repeat(80) })).toHaveLength(60);
  });
});

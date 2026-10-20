import { describe, expect, it } from "vitest";
import { newOption, QUESTION_KINDS } from "../core/exercise";
import { studentQuestion, type StudentExercise } from "../core/exerciseGrade";
import type { Question } from "../core/exerciseSchema";
import { slipAnswer, slipFileName, slipText } from "./slip";

type Of<T extends Question["type"]> = Extract<Question, { type: T }>;
const blank = <T extends Question["type"]>(type: T) => QUESTION_KINDS[type].blank() as Of<T>;

describe("answer slip", () => {
  it("writes answers in words, from the copy the student saw", () => {
    const choice: Of<"choice"> = { ...blank("choice"), options: [{ ...newOption(), text: "con mèo", correct: true }, { ...newOption(), text: "con chó" }] };
    expect(slipAnswer(studentQuestion(choice, false), choice.options[1]!.id)).toBe("con chó");

    const m: Of<"matching"> = { ...blank("matching") };
    m.pairs = m.pairs.map((p, i) => ({ ...p, left: ["猫", "狗", "鱼"][i]!, right: ["mèo", "chó", "cá"][i]! }));
    expect(slipAnswer(studentQuestion(m, false), { [m.pairs[0]!.id]: m.pairs[1]!.rightId })).toBe("猫 → chó");

    const s: Of<"sort-groups"> = { ...blank("sort-groups") };
    s.groups = s.groups.map((g, i) => ({ ...g, name: ["水果", "动物"][i]! }));
    s.cards = [{ ...s.cards[0]!, text: "猫" }];
    expect(slipAnswer(studentQuestion(s, false), { [s.cards[0]!.id]: s.groups[1]!.id })).toBe("猫 → 动物");

    expect(slipAnswer(studentQuestion(blank("tone-pick"), false), "5")).toBe("Thanh nhẹ");
    expect(slipAnswer(studentQuestion(blank("true-false"), false), false)).toBe("Sai");
    expect(slipAnswer(studentQuestion(blank("writing"), false), undefined)).toBe("");
  });

  it("lists every question in order, then the answers as data", () => {
    const choice: Of<"choice"> = { ...blank("choice"), prompt: "猫\nlà gì?", options: [{ ...newOption(), text: "con mèo", correct: true }] };
    const writing: Of<"writing"> = { ...blank("writing"), prompt: "Viết một câu." };
    const exercise: StudentExercise = {
      id: "e_slip0001",
      title: "Bài 1",
      intro: "",
      settings: {} as StudentExercise["settings"],
      parts: [{ id: "p_slip0001", skill: "reading", title: "第一部分", instruction: "", passage: "", questions: [studentQuestion(choice, false), studentQuestion(writing, false)] }],
    };
    const answers = { [choice.id]: choice.options[0]!.id };
    const text = slipText(exercise, answers, { name: "An", attemptId: "t_slip0001", savedAt: "10:00 20/10/2026" });
    expect(text).toContain("Học viên: An\r\n");
    expect(text).toContain("— 第一部分 —\r\nCâu 1. 猫 là gì?\r\n   Trả lời: con mèo\r\nCâu 2. Viết một câu.\r\n   Trả lời: (bỏ trống)\r\n");
    expect(JSON.parse(text.trim().split("\r\n").at(-1)!)).toEqual({ attemptId: "t_slip0001", answers });
  });

  it("names the file in plain letters", () => {
    expect(slipFileName("Nguyễn Minh Đức")).toBe("phieu-tra-loi-nguyen-minh-duc.txt");
    expect(slipFileName("  An!! ")).toBe("phieu-tra-loi-an.txt");
    expect(slipFileName("王小明")).toBe("phieu-tra-loi.txt");
  });
});

import { describe, expect, it } from "vitest";
import { newExercise, newPart, QUESTION_KINDS } from "./exercise";
import { exerciseIssues } from "./exerciseCheck";
import { applyManualGrades, exerciseReview, gradeExercise, normalizeText, studentCopy, studentQuestion, toneOf } from "./exerciseGrade";
import type { Exercise, Question } from "./exerciseSchema";

type Of<T extends Question["type"]> = Extract<Question, { type: T }>;
const blank = <T extends Question["type"]>(type: T) => QUESTION_KINDS[type].blank() as Of<T>;

function exerciseWith(...questions: Question[]): Exercise {
  return { ...newExercise("Đề thử"), parts: [{ ...newPart("reading"), questions }] };
}

const grade = (q: Question, answer: unknown, manual: Record<string, number> = {}) => gradeExercise(exerciseWith(q), { [q.id]: answer }, manual).questions[0]!;

describe("toneOf and normalizeText", () => {
  it("reads the tone from the mark", () => {
    expect(["mā", "má", "mǎ", "mà", "ma", "lǜ", "nǚ", "Hǎo"].map(toneOf)).toEqual([1, 2, 3, 4, 5, 4, 3, 3]);
    expect(toneOf("妈")).toBeNull();
    expect(toneOf("")).toBeNull();
  });

  it("compares typed text without spaces, punctuation or case, and loosely without tone marks", () => {
    expect(normalizeText("你好！", false)).toBe(normalizeText("你 好", false));
    expect(normalizeText("Nǐ hǎo!", true)).toBe(normalizeText("ni hao", true));
    expect(normalizeText("nǚ", true)).toBe(normalizeText("nv", true));
    expect(normalizeText("Nǐ hǎo", false)).not.toBe(normalizeText("ni hao", false));
  });
});

describe("grading the new kinds of question", () => {
  it("fill-text: any accepted answer counts, loosely when asked", () => {
    const q: Question = { ...blank("fill-text"), prompt: "Hello?", accepted: [{ text: "你好" }, { text: "nǐ hǎo" }] };
    expect(grade(q, "你好。").status).toBe("correct");
    expect(grade(q, "Ni hao").status).toBe("correct");
    expect(grade(q, "再见").status).toBe("wrong");
    expect(grade(q, "  ").status).toBe("blank");
    expect(grade({ ...q, looseTones: false }, "ni hao").status).toBe("wrong");
  });

  it("tone-pick: the tone of the syllable", () => {
    const q: Question = { ...blank("tone-pick"), prompt: "妈", syllable: "mā" };
    expect(grade(q, "1").status).toBe("correct");
    expect(grade(q, "2").status).toBe("wrong");
    expect(grade(q, "9").status).toBe("blank");
  });

  it("sentence-order: the words in order, or another accepted order", () => {
    const q: Question = { ...blank("sentence-order"), sentence: "我 / 每天 / 都 / 喝 / 茶", alternatives: [{ text: "每天 / 我 / 都 / 喝 / 茶" }] };
    expect(grade(q, ["我", "每天", "都", "喝", "茶"]).status).toBe("correct");
    expect(grade(q, ["每天", "我", "都", "喝", "茶"]).status).toBe("correct");
    expect(grade(q, ["茶", "我", "每天", "都", "喝"]).status).toBe("wrong");
    expect(grade(q, []).status).toBe("blank");
  });

  it("matching, word box and sorting: a point for each item", () => {
    const m: Of<"matching"> = { ...blank("matching") };
    m.pairs = m.pairs.map((p, i) => ({ ...p, left: ["猫", "狗", "鱼"][i]!, right: ["mèo", "chó", "cá"][i]! }));
    const two = { [m.pairs[0]!.id]: m.pairs[0]!.rightId, [m.pairs[1]!.id]: m.pairs[1]!.rightId, [m.pairs[2]!.id]: m.pairs[0]!.rightId };
    expect(grade(m, two)).toMatchObject({ status: "partial", earned: 2, points: 3 });

    const w: Of<"word-bank"> = { ...blank("word-bank") };
    w.bank = w.bank.map((b, i) => ({ ...b, text: ["结婚", "离婚", "婚礼", "婚姻"][i]! }));
    w.gaps = [
      { ...w.gaps[0]!, text: "我们___了。", answer: "结婚" },
      { ...w.gaps[1]!, text: "他们___了。", answer: "离婚" },
    ];
    expect(grade(w, { [w.gaps[0]!.id]: w.bank[0]!.id, [w.gaps[1]!.id]: w.bank[0]!.id })).toMatchObject({ status: "partial", earned: 1, points: 2 });
    expect(grade(w, { [w.gaps[0]!.id]: w.bank[0]!.id, [w.gaps[1]!.id]: w.bank[1]!.id })).toMatchObject({ status: "correct", earned: 2 });

    const s: Of<"sort-groups"> = { ...blank("sort-groups") };
    s.groups = s.groups.map((g, i) => ({ ...g, name: ["水果", "动物"][i]! }));
    const [g1, g2] = s.groups;
    const cards = s.cards;
    expect(grade(s, Object.fromEntries(cards.map((c) => [c.id, c.group === "1" ? g1!.id : g2!.id])))).toMatchObject({ status: "correct", earned: 4 });
    expect(grade(s, { [cards[0]!.id]: g2!.id })).toMatchObject({ status: "wrong", earned: 0 });
  });

  it("writing: waits for the teacher, then counts the points given", () => {
    const q: Question = { ...blank("writing"), prompt: "写一句话", points: 4 };
    const ex = exerciseWith(q, { ...blank("true-false"), prompt: "对吗？", answer: true });
    const pending = gradeExercise(ex, { [q.id]: "我喜欢学习汉语。", [ex.parts[0]!.questions[1]!.id]: true });
    expect(pending).toMatchObject({ score: 1, max: 5, pending: 4 });
    expect(pending.questions[0]).toMatchObject({ status: "pending", earned: 0 });

    const graded = applyManualGrades(pending, { [q.id]: 3 }, 0);
    expect(graded).toMatchObject({ score: 4, max: 5, pending: 0, percent: 80 });
    expect(graded.questions[0]).toMatchObject({ status: "partial", earned: 3, manual: true });
    // Never more than the question is worth; blank answers are not graded.
    expect(applyManualGrades(pending, { [q.id]: 99 }, 0).score).toBe(5);
    expect(grade(q, "", { [q.id]: 4 }).status).toBe("blank");
  });
});

describe("the student's copy of the new kinds", () => {
  it("leaves out every answer, and shuffles what would give them away", () => {
    const order: Question = { ...blank("sentence-order"), sentence: "我 / 每天 / 都 / 喝 / 茶" };
    const tone: Question = { ...blank("tone-pick"), prompt: "妈", syllable: "mā" };
    const fill: Question = { ...blank("fill-text"), prompt: "?", accepted: [{ text: "secret-accepted" }] };
    const write: Question = { ...blank("writing"), prompt: "写", sample: "secret-sample" };
    const word: Of<"word-bank"> = { ...blank("word-bank") };
    word.gaps = word.gaps.map((g) => ({ ...g, answer: "secret-gap" }));
    const ex = exerciseWith(order, tone, fill, write, word);
    const copy = studentCopy(ex, "seed");
    const text = JSON.stringify(copy);
    for (const secret of ["secret-accepted", "secret-sample", "secret-gap", '"syllable"', "mā", '"sentence"', '"group"', '"correct"']) expect(text).not.toContain(secret);

    const tokens = copy.parts[0]!.questions[0]!.tokens!;
    expect([...tokens].sort()).toEqual(["我", "每天", "都", "喝", "茶"].sort());
    expect(tokens.join("")).not.toBe("我每天都喝茶");
  });

  it("puts the right column of a matching question out of order", () => {
    const m: Of<"matching"> = { ...blank("matching") };
    for (let i = 0; i < 10; i++) {
      const copy = studentQuestion(m, true, () => 0.999);
      expect(copy.rights!.map((r) => r.id)).not.toEqual(m.pairs.map((p) => p.rightId));
    }
  });

  it("shows the right answers in the review", () => {
    const order: Question = { ...blank("sentence-order"), sentence: "我 / 是 / 学生" };
    const fill: Question = { ...blank("fill-text"), prompt: "?", accepted: [{ text: "你好" }, { text: "" }, { text: "nǐ hǎo" }] };
    const review = exerciseReview(exerciseWith(order, fill));
    expect(review.questions[order.id]!.expected).toEqual(["我", "是", "学生"]);
    expect(review.questions[fill.id]!.expected).toEqual(["你好", "nǐ hǎo"]);
  });
});

describe("checking the new kinds", () => {
  const messages = (q: Question) => exerciseIssues(exerciseWith(q)).map((i) => i.message);

  it("finds what cannot be answered or graded", () => {
    expect(messages({ ...blank("tone-pick"), prompt: "妈", syllable: "ma" })).toContain("Âm tiết không có dấu thanh: thêm dấu, hoặc bật lựa chọn thanh nhẹ");
    expect(messages({ ...blank("tone-pick"), prompt: "妈", syllable: "ma", withNeutral: true })).toEqual([]);
    expect(messages({ ...blank("sentence-order"), sentence: "我是学生" })).toEqual(["Cần ít nhất 2 thẻ, ngăn nhau bằng /"]);
    expect(messages({ ...blank("fill-text"), prompt: "?" })).toEqual(["Chưa có đáp án"]);

    const w: Of<"word-bank"> = { ...blank("word-bank") };
    w.bank = w.bank.map((b, i) => ({ ...b, text: ["一", "二", "三", "四"][i]! }));
    w.gaps = [{ ...w.gaps[0]!, text: "我有___个。", answer: "五" }];
    expect(messages(w)).toEqual(["Từ này không có trong khung từ"]);

    const s: Of<"sort-groups"> = { ...blank("sort-groups") };
    s.groups = s.groups.map((g, i) => ({ ...g, name: `Nhóm ${i}` }));
    s.cards = s.cards.map((c, i) => ({ ...c, text: `thẻ ${i}`, group: i === 0 ? "3" : c.group }));
    expect(messages(s)).toEqual(["Chỉ có 2 nhóm"]);
  });
});

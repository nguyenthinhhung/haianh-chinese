import { describe, expect, it } from "vitest";
import { newExercise, newOption, newPart, QUESTION_KINDS } from "./exercise";
import { exerciseIssues, exerciseReady } from "./exerciseCheck";
import { exerciseReview, gradeExercise, studentCopy } from "./exerciseGrade";
import type { Exercise, Question } from "./exerciseSchema";

type Of<T extends Question["type"]> = Extract<Question, { type: T }>;

function choice(prompt: string, options: string[], correct: number, points = 1): Question {
  return {
    ...(QUESTION_KINDS.choice.blank() as Of<"choice">),
    prompt,
    points,
    options: options.map((text, i) => ({ ...newOption(), text, correct: i === correct })),
    explanation: `Vì ${options[correct]}`,
    transcript: "男：你好。",
  };
}

function trueFalse(prompt: string, answer: boolean): Question {
  return { ...(QUESTION_KINDS["true-false"].blank() as Of<"true-false">), prompt, answer };
}

/** Listening part with a recording (order fixed), reading part without (may shuffle). */
function sample(): Exercise {
  const ex = newExercise("Bài tập 1");
  const listening = { ...newPart("listening"), audio: "a_track00001", transcript: "听力原文", questions: [choice("", ["太累了", "和老婆吵架了", "太热了"], 1)] };
  const reading = {
    ...newPart("reading"),
    questions: [choice("猫", ["con chó", "con mèo", "con cá", "con chim"], 1, 2), trueFalse("我是学生。", false), choice("鱼", ["con cá", "con chó"], 0)],
  };
  return { ...ex, parts: [listening, reading] };
}

const ids = (ex: Exercise) => ex.parts.flatMap((p) => p.questions.map((q) => q.id));
const correctOf = (q: Question) => ("options" in q ? q.options.find((o) => o.correct)!.id : undefined);

describe("gradeExercise", () => {
  it("scores right, wrong and blank answers by points, per skill", () => {
    const ex = sample();
    const [l1, r1, r2] = ex.parts.flatMap((p) => p.questions);
    const wrongOption = "options" in r1! ? r1.options[0]!.id : "";
    const grade = gradeExercise(ex, { [l1!.id]: correctOf(l1!)!, [r1!.id]: wrongOption, [r2!.id]: false });
    expect(grade.questions.map((q) => q.status)).toEqual(["correct", "wrong", "correct", "blank"]);
    expect(grade).toMatchObject({ score: 2, max: 5, percent: 40, bySkill: { listening: { score: 1, max: 1 }, reading: { score: 1, max: 4 } } });
    expect(grade.passed).toBeUndefined();
  });

  it("counts answers the question cannot take as blank", () => {
    const ex = sample();
    const [l1, , r2] = ex.parts.flatMap((p) => p.questions);
    const grade = gradeExercise(ex, { [l1!.id]: "o_notanoption", [r2!.id]: "false", extra: true });
    expect(grade.questions.filter((q) => q.status === "blank")).toHaveLength(4);
  });

  it("rounds the percentage down against the pass mark", () => {
    const ex = { ...sample(), settings: { ...sample().settings, passPercent: 34 } };
    const [l1] = ex.parts.flatMap((p) => p.questions);
    // 1 of 5 points: 20%.
    expect(gradeExercise(ex, { [l1!.id]: correctOf(l1!)! })).toMatchObject({ percent: 20, passed: false });
    const all = Object.fromEntries(ex.parts.flatMap((p) => p.questions).map((q) => [q.id, q.type === "true-false" ? q.answer : correctOf(q)!]));
    expect(gradeExercise(ex, all)).toMatchObject({ score: 5, percent: 100, passed: true });
  });
});

describe("studentCopy", () => {
  it("leaves out right answers, explanations and recordings' words", () => {
    const copy = JSON.stringify(studentCopy(sample(), "seed"));
    for (const secret of ['"correct"', '"answer"', "explanation", "transcript", "Vì ", "听力原文", "男：你好"]) expect(copy).not.toContain(secret);
  });

  it("shuffles the same way for the same seed, and keeps parts with a recording in order", () => {
    const ex = { ...sample(), settings: { ...sample().settings, shuffleQuestions: true, shuffleOptions: true } };
    expect(studentCopy(ex, "a")).toEqual(studentCopy(ex, "a"));
    const orders = new Set(Array.from({ length: 20 }, (_, i) => studentCopy(ex, `s${i}`).parts[1]!.questions.map((q) => q.id).join()));
    expect(orders.size).toBeGreaterThan(1);
    for (let i = 0; i < 20; i++) {
      const copy = studentCopy(ex, `s${i}`);
      expect(copy.parts[0]!.questions.map((q) => q.id)).toEqual(ex.parts[0]!.questions.map((q) => q.id));
      // Every question and option is still there, only reordered.
      expect(copy.parts.flatMap((p) => p.questions.map((q) => q.id)).sort()).toEqual(ids(ex).sort());
    }
  });

  it("drops pinyin when the exercise hides it", () => {
    const ex = sample();
    ex.parts[1]!.questions[0]!.pinyin = "māo";
    expect(studentCopy(ex, "x").parts[1]!.questions[0]!.pinyin).toBe("māo");
    expect(studentCopy({ ...ex, settings: { ...ex.settings, pinyin: false } }, "x").parts[1]!.questions[0]!.pinyin).toBe("");
  });
});

describe("exerciseReview", () => {
  it("gives the right answer, explanation and words of each question", () => {
    const ex = sample();
    const l1 = ex.parts[0]!.questions[0]!;
    const review = exerciseReview(ex);
    expect(review.questions[l1.id]).toEqual({ expected: correctOf(l1), explanation: "Vì 和老婆吵架了", transcript: "男：你好。" });
    expect(review.parts[ex.parts[0]!.id]).toEqual({ transcript: "听力原文" });
  });
});

describe("exerciseIssues", () => {
  it("finds what stops a new exercise from being handed out", () => {
    const ex = newExercise("");
    const messages = exerciseIssues(ex).map((i) => `${i.level}: ${i.message}`);
    expect(messages).toEqual([
      "error: Đặt tên cho đề",
      "warning: Phần nghe chưa có file nghe",
      "error: Chưa có câu hỏi, ảnh hoặc âm thanh",
      "error: Lựa chọn còn trống",
      "error: Lựa chọn còn trống",
      "error: Lựa chọn còn trống",
      "error: Lựa chọn còn trống",
      "error: Chưa chọn đáp án đúng",
    ]);
    expect(exerciseReady(ex)).toBe(false);
  });

  it("accepts a finished exercise, where listening questions may have no text of their own", () => {
    expect(exerciseIssues(sample())).toEqual([]);
    expect(exerciseReady(sample())).toBe(true);
  });

  it("wants the gap marked in a fill-the-gap sentence, and one right answer", () => {
    const ex = sample();
    const q: Question = {
      ...(QUESTION_KINDS["blank-choice"].blank() as Of<"blank-choice">),
      prompt: "我和丈夫结婚五年了。",
      options: ["结婚", "离婚"].map((text) => ({ ...newOption(), text, correct: true })),
    };
    ex.parts[1]!.questions = [q];
    expect(exerciseIssues(ex).map((i) => i.message)).toEqual(["Đánh dấu chỗ trống bằng ___", "Chỉ được một đáp án đúng"]);
  });
});

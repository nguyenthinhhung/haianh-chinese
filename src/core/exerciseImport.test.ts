import { describe, expect, it } from "vitest";
import { gradeExercise } from "./exerciseGrade";
import { buildExercisePrompt, normalizeExerciseRequest, parseAiExercise } from "./exerciseImport";

const reply = (parts: unknown) => "Đây là đề:\n```json\n" + JSON.stringify({ title: "Bài 7", intro: "Làm trong 15 phút.", parts }) + "\n```";

const everyKind = [
  {
    skill: "listening",
    title: "第一部分",
    instruction: "听录音，选择正确答案。",
    transcript: "男：你好！",
    questions: [
      { type: "choice", prompt: "男的说什么？", options: ["你好", "再见", { text: "谢谢" }], answer: "a" },
      { type: "tone-pick", prompt: "妈" },
    ],
  },
  {
    skill: "đọc",
    questions: [
      { type: "true-false", prompt: "他是学生。", answer: "đúng" },
      { type: "blank-choice", prompt: "我___中国人。", options: ["是", "有"], answer: 1 },
      { type: "fill-text", prompt: "“你好”的拼音", accepted: ["nǐ hǎo", { text: "ni hao" }] },
      { type: "sentence-order", sentence: ["我", "是", "学生"] },
      { type: "matching", pairs: [{ left: "猫", right: "con mèo" }, ["狗", "con chó"]] },
      { type: "word-bank", bank: ["一", "二"], gaps: [{ text: "___个人", answer: "一" }] },
      { type: "sort-groups", groups: ["水果", "动物"], cards: [{ text: "苹果", group: 1 }, { text: "猫", group: "动物" }] },
      { type: "writing", prompt: "写一句话。", sample: "我喜欢汉语。", maxChars: 5000, points: 4 },
    ],
  },
];

describe("reading an AI reply", () => {
  it("turns every kind of question into a checked exercise with fresh IDs", () => {
    const result = parseAiExercise(reply(everyKind));
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const { exercise, issues } = result;
    expect(issues).toEqual([]);
    expect(exercise).toMatchObject({ title: "Bài 7", intro: "Làm trong 15 phút." });
    expect(exercise.parts.map((p) => p.skill)).toEqual(["listening", "reading"]);
    const [choice, tone, tf, blank, fill, order, matching, bank, sort, writing] = exercise.parts.flatMap((p) => p.questions);
    expect(choice).toMatchObject({ type: "choice", pinyin: "nán de shuō shén me?" });
    if (choice?.type !== "choice") throw new Error("choice");
    expect(choice.options.map((o) => [o.text, o.correct, o.pinyin])).toEqual([
      ["你好", true, "nǐ hǎo"],
      ["再见", false, "zài jiàn"],
      ["谢谢", false, "xiè xie"],
    ]);
    expect(tone).toMatchObject({ syllable: "mā" });
    expect(tf).toMatchObject({ answer: true });
    expect(blank?.type === "blank-choice" && blank.options.map((o) => o.correct)).toEqual([true, false]);
    expect(fill).toMatchObject({ accepted: [{ text: "nǐ hǎo" }, { text: "ni hao" }], looseTones: true });
    expect(order).toMatchObject({ sentence: "我 / 是 / 学生", alternatives: [] });
    expect(matching?.type === "matching" && matching.pairs.map((p) => [p.left, p.right])).toEqual([
      ["猫", "con mèo"],
      ["狗", "con chó"],
    ]);
    expect(bank?.type === "word-bank" && bank.gaps[0]).toMatchObject({ answer: "一" });
    expect(sort?.type === "sort-groups" && sort.cards.map((c) => c.group)).toEqual(["1", "2"]);
    expect(writing).toMatchObject({ points: 4, maxChars: 2000 });
    // IDs are fresh and the exercise grades like one made by hand.
    expect(new Set(exercise.parts.flatMap((p) => p.questions.map((q) => q.id))).size).toBe(10);
    expect(gradeExercise(exercise, { [choice.id]: choice.options[0]!.id }).score).toBe(1);
  });

  it("takes a bare list of questions too", () => {
    const result = parseAiExercise(JSON.stringify([{ type: "true-false", prompt: "对吗？", answer: false }]));
    expect(result.ok && result.exercise.parts[0]).toMatchObject({ skill: "reading", questions: [{ answer: false }] });
  });

  it("names each problem by question number", () => {
    const result = parseAiExercise(
      reply([
        {
          questions: [
            { type: "choice", options: ["A", "B"], answer: "D" },
            { type: "drawing" },
            { type: "true-false", prompt: "?", answer: "maybe" },
            { type: "sort-groups", groups: ["a", "b"], cards: [{ text: "x", group: 3 }] },
          ],
        },
      ]),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual([
      'Câu 1 (Trắc nghiệm): đáp án "D" không khớp lựa chọn nào (ghi chữ cái A, B, C…)',
      expect.stringMatching(/^Câu 2: dạng câu "drawing" không có/),
      "Câu 3 (Đúng / Sai): \"answer\" phải là true (đúng) hoặc false (sai)",
      'Câu 4 (Phân nhóm): thẻ "x": nhóm "3" không có (ghi số thứ tự nhóm, từ 1)',
    ]);
  });

  it("imports what can be fixed later, listing it", () => {
    const result = parseAiExercise(reply([{ questions: [{ type: "choice", prompt: "猫？", options: ["a", "b"] }] }]));
    expect(result.ok && result.issues).toEqual([expect.stringMatching(/^Câu 1: /)]);
  });

  it("says when there is nothing to read", () => {
    expect(parseAiExercise("Xin lỗi, tôi không làm được.")).toEqual({ ok: false, errors: ["Không tìm thấy JSON trong nội dung đã dán."] });
    expect(parseAiExercise('{"title": "x"}').ok).toBe(false);
  });
});

describe("the prompt", () => {
  it("asks for the textbook's own exercises, in the chosen kinds only", () => {
    const request = normalizeExerciseRequest({ source: "HSK 1, Bài 7", kinds: ["matching", "nonsense", "choice"], listening: false });
    expect(request.kinds).toEqual(["choice", "matching"]);
    const prompt = buildExercisePrompt(request);
    expect(prompt).toContain("Giáo trình: HSK 1, Bài 7");
    expect(prompt).toContain('- "matching" (Nối cặp)');
    expect(prompt).not.toContain('- "writing"');
    expect(prompt).toContain("Không có phần nghe.");
    // The example in the prompt reads back as a valid exercise.
    const example = prompt.slice(prompt.indexOf("{\n"));
    expect(parseAiExercise(example)).toMatchObject({ ok: true, issues: [] });
  });

  it("falls back to sensible choices", () => {
    expect(normalizeExerciseRequest(null)).toMatchObject({ count: 10, kinds: [], listening: true, age: "lower-primary" });
    expect(normalizeExerciseRequest({ count: 500 }).count).toBe(50);
  });
});

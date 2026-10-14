import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { buildAiPrompt, extractJson, parseAiLesson } from "./aiImport";
import { DEFAULT_REQUEST, planSlideCount, resolvePlan, type LessonRequest } from "./lessonPlan";

const { templates } = testEnv();

const lesson = {
  title: "Con vật",
  slides: [
    { type: "cover", content: { title: "动物", pinyin: "dòng wù", subtitle: "Con vật" } },
    { type: "vocabulary", content: { words: [{ hanzi: "猫", pinyin: "māo", meaning: "con mèo" }] }, notes: "Đọc to" },
  ],
};

describe("extractJson", () => {
  it("takes the JSON out of a fenced chat reply", () => {
    const reply = `Đây là bài học của bạn:\n\`\`\`json\n${JSON.stringify(lesson)}\n\`\`\`\nChúc bạn dạy vui!`;
    expect(JSON.parse(extractJson(reply)!)).toEqual(lesson);
  });

  it("finds the outermost object in plain text, ignoring braces inside strings", () => {
    const reply = `Kết quả: {"title": "a } b", "slides": [{"type": "cover"}]} xong.`;
    expect(JSON.parse(extractJson(reply)!).title).toBe("a } b");
  });

  it("returns null without JSON", () => {
    expect(extractJson("Xin lỗi, tôi không hiểu.")).toBeNull();
  });
});

describe("parseAiLesson", () => {
  it("builds slides with fresh IDs and template defaults", () => {
    const result = parseAiLesson(JSON.stringify(lesson), templates);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.title).toBe("Con vật");
    expect(result.slides.map((s) => s.type)).toEqual(["cover", "vocabulary"]);
    expect(new Set(result.slides.map((s) => s.id)).size).toBe(2);
    expect(result.slides[1]!.notes).toBe("Đọc to");
    expect((result.slides[1]!.content as { hideMeaning: boolean }).hideMeaning).toBe(false);
  });

  it("accepts a bare array of slides", () => {
    const result = parseAiLesson(JSON.stringify(lesson.slides), templates);
    expect(result.ok && result.slides).toHaveLength(2);
  });

  it("drops pictures and sounds the AI made up", () => {
    const withImage = { slides: [{ type: "cover", content: { title: "猫", image: "cat.png" } }] };
    const result = parseAiLesson(JSON.stringify(withImage), templates);
    expect(result.ok && (result.slides[0]!.content as object)).not.toHaveProperty("image");
  });

  it("reports every problem with its slide and field", () => {
    const bad = {
      slides: [
        { type: "cover", content: { title: "ok" } },
        { type: "vocabulary", content: { words: [{ hanzi: "猫" }, { hanzi: "" }] } },
        { type: "nope", content: {} },
      ],
    };
    const result = parseAiLesson(JSON.stringify(bad), templates);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Slide 2 (Từ vựng), từ 2, Chữ Hán: Không được để trống");
    expect(result.errors.some((e) => e.startsWith('Slide 3: loại slide "nope"'))).toBe(true);
  });

  it("explains broken or missing JSON", () => {
    expect(parseAiLesson("{oops", templates)).toMatchObject({ ok: false });
    expect(parseAiLesson('{"title": "x"}', templates)).toEqual({ ok: false, errors: ['JSON cần có danh sách "slides".'] });
  });
});

describe("buildAiPrompt", () => {
  const request: LessonRequest = { ...DEFAULT_REQUEST, topic: "Con vật", words: "猫, 狗\n兔子", patterns: "这是什么？" };

  it("includes a valid example", () => {
    const prompt = buildAiPrompt(templates, request);
    const parsed = parseAiLesson(prompt.slice(prompt.lastIndexOf("Ví dụ")), templates);
    expect(parsed.ok).toBe(true);
  });

  it("states the teacher's choices and the slide sequence", () => {
    const prompt = buildAiPrompt(templates, request);
    expect(prompt).toContain("- Chủ đề: Con vật");
    expect(prompt).toContain("猫, 狗, 兔子");
    expect(prompt).toContain("- Mẫu câu cần dạy: 这是什么？");
    expect(prompt).toContain(`tổng cộng ${planSlideCount(resolvePlan(request))} slide`);
    expect(prompt).toMatch(/^1\. Mở đầu: tên bài — 1 slide, "cover"$/m);
  });

  it("describes only the slide types the plan uses", () => {
    const plan = resolvePlan({ ...request, kind: "grammar" });
    const used = new Set(plan.flatMap((s) => s.types));
    const prompt = buildAiPrompt(templates, { ...request, kind: "grammar" });
    for (const t of templates.list()) {
      expect(prompt.includes(`- "${t.type}" (`), t.type).toBe(used.has(t.type));
    }
  });

  it("asks a review lesson not to add new words", () => {
    expect(buildAiPrompt(templates, { ...request, kind: "review" })).toContain("không thêm từ mới");
  });
});

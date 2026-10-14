import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { buildAiPrompt, extractJson, parseAiLesson } from "./aiImport";

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
  it("describes every slide type and includes a valid example", () => {
    const prompt = buildAiPrompt(templates);
    for (const t of templates.list()) expect(prompt).toContain(`"${t.type}"`);
    const example = prompt.slice(prompt.lastIndexOf("Ví dụ:"));
    const parsed = parseAiLesson(example, templates);
    expect(parsed.ok).toBe(true);
  });
});

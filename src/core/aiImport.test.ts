import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { buildAiPrompt, extractJson, lengthLimits, parseAiLesson } from "./aiImport";
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

  it("accepts list items written as bare strings", () => {
    // As ChatGPT wrote them: wheel segments and summary points without {"text": …}.
    const bare = {
      slides: [
        { type: "lucky-wheel", content: { segments: ["猫", "狗", "兔子"] } },
        { type: "summary", content: { points: ["Con mèo là 猫", "Con chó là 狗"], words: [{ hanzi: "猫", pinyin: "māo" }] } },
      ],
    };
    const result = parseAiLesson(JSON.stringify(bare), templates);
    if (!result.ok) throw new Error(result.errors.join("; "));
    expect((result.slides[0]!.content as { segments: unknown[] }).segments).toEqual([{ text: "猫" }, { text: "狗" }, { text: "兔子" }]);
    expect((result.slides[1]!.content as { points: unknown[] }).points[0]).toEqual({ text: "Con mèo là 猫" });
  });

  it("keeps the AI's picture keywords by slot, ignoring links and file names", () => {
    const withWords = {
      slides: [
        {
          type: "vocabulary",
          content: {
            words: [
              { hanzi: "猫", pinyin: "māo", meaning: "con mèo", image: "cat" },
              { hanzi: "狗", pinyin: "gǒu", meaning: "con chó", image: "https://x.com/dog.png" },
              { hanzi: "鱼", pinyin: "yú", meaning: "con cá", image: "fish.jpg" },
            ],
          },
        },
      ],
    };
    const result = parseAiLesson(JSON.stringify(withWords), templates);
    if (!result.ok) throw new Error(result.errors.join("; "));
    const id = result.slides[0]!.id;
    expect([...result.imageQueries]).toEqual([[`${id}:words.0.image`, "cat"]]);
    expect((result.slides[0]!.content as { words: object[] }).words[0]).not.toHaveProperty("image");
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

  it("asks for English picture keywords in the picture fields the plan uses", () => {
    const prompt = buildAiPrompt(templates, request);
    expect(prompt).toContain('"vocabulary": words[].image');
    expect(prompt).toContain("TIẾNG ANH");
    expect(prompt).not.toContain('"matching": ');
  });

  it("states the tight character limits, read from each template's schema", () => {
    // The wheel accepts 16 characters but only 8 read well on a wedge.
    expect(lengthLimits(templates.require("lucky-wheel"))).toEqual(["segments[].text ≤ 8"]);
    expect(lengthLimits(templates.require("picture-card"))).toEqual(["hanzi ≤ 4", "pinyin ≤ 24", "meaning ≤ 30"]);
    for (const t of templates.list()) expect(lengthLimits(t).some((l) => l.startsWith("heading ")), t.type).toBe(false);
    const prompt = buildAiPrompt(templates, { ...request, kind: "review", activities: ["lucky-wheel"] });
    expect(prompt).toContain("Tối đa ký tự: segments[].text ≤ 8.");
  });

  it("asks a review lesson not to add new words", () => {
    expect(buildAiPrompt(templates, { ...request, kind: "review" })).toContain("không thêm từ mới");
  });
});

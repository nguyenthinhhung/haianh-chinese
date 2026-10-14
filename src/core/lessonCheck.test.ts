import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { fillImageSlot, imageJobs } from "./autoImages";
import { createLesson } from "./document";
import { lessonIssues } from "./lessonCheck";
import type { LessonDocument, Slide } from "./schema";

const { templates } = testEnv();
const lesson = (...slides: Slide[]): LessonDocument => ({ ...createLesson({ title: "Thử", appVersion: "0" }), slides });

describe("lessonIssues", () => {
  it("finds nothing in a complete lesson", () => {
    const doc = lesson({ id: "s_cover0001", type: "cover", content: { title: "动物", pinyin: "dòng wù", subtitle: "Con vật" } });
    expect(lessonIssues(doc, templates)).toEqual([]);
  });

  it("names errors, long text, wrong pinyin and missing pictures, by slide", () => {
    const vocab: Slide = {
      id: "s_vocab0001",
      type: "vocabulary",
      content: {
        words: [
          { hanzi: "猫", pinyin: "mǎo", meaning: "con mèo" },
          { hanzi: "", pinyin: "", meaning: "" },
          { hanzi: "长颈鹿", pinyin: "cháng jǐng lù", meaning: "hươu cao cổ rất rất rất rất cao" },
        ],
        hideMeaning: false,
      },
    };
    const issues = lessonIssues(lesson({ id: "s_cover0001", type: "cover", content: { title: "动物" } }, vocab), templates);
    expect(issues.every((i) => i.slideIndex === 1 && i.slideId === "s_vocab0001")).toBe(true);
    const text = issues.map((i) => `${i.level}: ${i.message}`);
    expect(text).toContain("error: từ 2, Chữ Hán: Không được để trống");
    expect(text.some((t) => t.startsWith("warning: từ 3, Nghĩa: Dài hơn"))).toBe(true);
    expect(text.some((t) => t.startsWith('warning: Pinyin của "猫" có âm không khớp chữ'))).toBe(true);
    expect(text).toContain("warning: Chưa có ảnh: con mèo, hươu cao cổ rất rất rất rất cao.");
  });

  it("lists pictures picked automatically until they are reviewed", () => {
    const vocab: Slide = { id: "s_vocab0001", type: "vocabulary", content: { words: [{ hanzi: "猫", pinyin: "māo", meaning: "con mèo" }], hideMeaning: false } };
    const job = imageJobs([vocab], templates, { clipart: false })[0]!;
    const doc = fillImageSlot(lesson(vocab), job, { file: "assets/img-abc.webp", mime: "image/webp" });
    expect(lessonIssues(doc, templates).map((i) => i.message)).toEqual(["Ảnh tự chọn chưa duyệt: con mèo."]);
  });
});

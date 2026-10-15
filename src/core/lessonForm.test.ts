import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { buildAiPrompt } from "./aiImport";
import { formFromLesson, normalizeForm } from "./lessonForm";
import { DEFAULT_REQUEST, planSlideCount, resolvePlan, type LessonRequest } from "./lessonPlan";
import { createFromSample } from "../samples";
import type { LessonDocument, Slide } from "./schema";

const { templates } = testEnv();

let n = 0;
function slide(type: string, content: Record<string, unknown> = {}, notes?: string): Slide {
  n += 1;
  const id = `s_form${String(n).padStart(6, "0")}`;
  return { id, type, content: { ...(templates.require(type).defaults() as object), ...content }, ...(notes ? { notes } : {}) };
}

function lessonOf(slides: Slide[]): LessonDocument {
  return { ...createFromSample("blank", "Bài 11", "0.0.0"), slides };
}

describe("formFromLesson", () => {
  const doc = lessonOf([
    slide("cover", { title: "第十一课" }),
    slide("cover", { title: "课文" }),
    slide("dialogue", { heading: "课文 1" }, "Cho cả lớp nghe hai lần rồi đọc phân vai."),
    slide("dialogue", { heading: "课文 2" }),
    slide("listening"),
    slide("cover", { title: "生词" }),
    slide("vocabulary", { heading: "生词" }),
    slide("vocabulary", { heading: "生词" }),
  ]);
  const form = formFromLesson("Khung HSK1", doc, templates);

  it("keeps the order and merges runs of one slide type within a part", () => {
    expect(form.steps.map((s) => [s.type, s.count])).toEqual([
      ["cover", 1],
      ["cover", 1],
      ["dialogue", 2],
      ["listening", 1],
      ["cover", 1],
      ["vocabulary", 2],
    ]);
  });

  it("names steps after their part and shared heading, and keeps the teacher's notes", () => {
    expect(form.steps[0]!.role).toBe("Tên bài “第十一课”");
    expect(form.steps[1]!.role).toBe("Mở đầu phần “课文”");
    // The two dialogues have different headings, so the merged step keeps none.
    expect(form.steps[2]!.role).toBe("课文 — Hội thoại");
    expect(form.steps[2]!.note).toBe("Cho cả lớp nghe hai lần rồi đọc phân vai.");
    expect(form.steps[5]!.role).toBe("生词 — Từ vựng “生词”");
  });

  it("survives storage and drops what is unusable", () => {
    expect(normalizeForm(JSON.parse(JSON.stringify(form)), templates)).toEqual(form);
    expect(normalizeForm({ name: "x", steps: [{ role: "a", type: "no-such-type", count: 1 }] }, templates)).toBeNull();
    expect(normalizeForm({ name: "", steps: form.steps })).toBeNull();
    expect(normalizeForm({ name: "x", steps: [{ role: "a", type: "quiz", count: 99 }] })!.steps[0]!.count).toBe(6);
  });
});

describe("lessons made from a form", () => {
  const form = formFromLesson(
    "Khung",
    lessonOf([slide("cover"), slide("dialogue", {}, "Đọc phân vai"), slide("dialogue"), slide("quiz"), slide("summary")]),
    templates,
  );
  const request: LessonRequest = { ...DEFAULT_REQUEST, topic: "Bài 11", kind: "form", form };

  it("follow the form step for step, whatever the length", () => {
    const plan = resolvePlan(request);
    expect(plan.map((s) => s.types)).toEqual([["cover"], ["dialogue"], ["quiz"], ["summary"]]);
    expect(planSlideCount(plan)).toBe(5);
    expect(planSlideCount(resolvePlan({ ...request, duration: "short" }))).toBe(5);
  });

  it("let the teacher drop a step for one class", () => {
    const role = resolvePlan(request)[2]!.role;
    expect(resolvePlan({ ...request, outline: { [role]: 0 } }).map((s) => s.types[0])).toEqual(["cover", "dialogue", "summary"]);
  });

  it("tell the AI the form's name and pass on the teacher's notes", () => {
    const prompt = buildAiPrompt(templates, request);
    expect(prompt).toContain('theo khung bài "Khung"');
    expect(prompt).toContain("Đọc phân vai");
    expect(prompt).toContain("Tổng cộng 5 slide");
  });
});

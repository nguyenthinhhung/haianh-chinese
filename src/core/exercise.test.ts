import { describe, expect, it } from "vitest";
import { createFromSample } from "../samples";
import { testEnv } from "../test/env";
import { parseLessonHtml, serializeLessonHtml } from "./codec";
import { addAsset, removeUnusedAssets } from "./document";
import {
  addExercise,
  addPart,
  addQuestion,
  describeExercisePath,
  duplicateExercise,
  duplicateQuestion,
  exerciseAssetRefs,
  moveQuestion,
  questionNumbers,
  removeQuestion,
  setExerciseField,
} from "./exercise";
import type { LessonDocument } from "./schema";
import { formatIssue, validateLesson } from "./validate";

const env = testEnv();

function lessonWithExercise() {
  const added = addExercise(createFromSample("blank", "Bài 1", "0.0.0"));
  return { doc: added.doc, exerciseId: added.exerciseId };
}

const exerciseOf = (doc: LessonDocument, id: string) => doc.exercises.find((e) => e.id === id)!;

describe("exercises in a lesson", () => {
  it("starts with one part holding one empty choice question", () => {
    const { doc, exerciseId } = lessonWithExercise();
    const ex = exerciseOf(doc, exerciseId);
    expect(ex.title).toBe("Bài tập 1");
    expect(ex.parts).toHaveLength(1);
    expect(ex.parts[0]!.questions).toMatchObject([{ type: "choice", options: [{}, {}, {}, {}] }]);
    expect(validateLesson(doc, env.templates).ok).toBe(true);
  });

  it("saves and reopens, even with questions not filled in yet", () => {
    let { doc, exerciseId } = lessonWithExercise();
    const partId = exerciseOf(doc, exerciseId).parts[0]!.id;
    doc = addQuestion(doc, exerciseId, partId, "true-false").doc;
    doc = addQuestion(doc, exerciseId, partId, "blank-choice").doc;
    const parsed = parseLessonHtml(serializeLessonHtml(doc, env), env.templates);
    expect(parsed).toEqual({ ok: true, doc });
  });

  it("opens a version 1 lesson, which has no exercises", () => {
    const v1 = { ...createFromSample("blank", "Cũ", "0.0.0"), schemaVersion: 1 } as Record<string, unknown>;
    delete v1.exercises;
    const html = `<meta name="lesson-studio-schema" content="1"><script type="application/json" id="lesson-data">${JSON.stringify(v1)}</script>`;
    const parsed = parseLessonHtml(html, env.templates);
    expect(parsed.ok && parsed.migratedFrom).toBe(1);
    expect(parsed.ok && parsed.doc.exercises).toEqual([]);
  });

  it("numbers questions through every part", () => {
    let { doc, exerciseId } = lessonWithExercise();
    const first = exerciseOf(doc, exerciseId).parts[0]!;
    const second = addPart(doc, exerciseId);
    doc = addQuestion(second.doc, exerciseId, second.partId, "choice").doc;
    doc = addQuestion(doc, exerciseId, first.id, "true-false").doc;
    const ex = exerciseOf(doc, exerciseId);
    const ids = ex.parts.flatMap((p) => p.questions.map((q) => q.id));
    expect([...questionNumbers(ex)]).toEqual(ids.map((id, i) => [id, i + 1]));
    expect(describeExercisePath(ex, ["parts", 1, "questions", 0, "options", 1, "text"])).toEqual(["Phần 2", "Câu 3", "lựa chọn 2", "Chữ"]);
  });

  it("moves a question past the end of its part into the next part", () => {
    let { doc, exerciseId } = lessonWithExercise();
    const firstQuestion = exerciseOf(doc, exerciseId).parts[0]!.questions[0]!.id;
    const second = addPart(doc, exerciseId);
    doc = addQuestion(second.doc, exerciseId, second.partId, "choice").doc;
    doc = moveQuestion(doc, exerciseId, firstQuestion, 1);
    const ex = exerciseOf(doc, exerciseId);
    expect(ex.parts[0]!.questions).toHaveLength(0);
    expect(ex.parts[1]!.questions[0]!.id).toBe(firstQuestion);
    // And back.
    doc = moveQuestion(doc, exerciseId, firstQuestion, -1);
    expect(exerciseOf(doc, exerciseId).parts[0]!.questions[0]!.id).toBe(firstQuestion);
  });

  it("gives copies fresh IDs, so answers to one never count for the other", () => {
    let { doc, exerciseId } = lessonWithExercise();
    const q = exerciseOf(doc, exerciseId).parts[0]!.questions[0]!;
    const dupQ = duplicateQuestion(doc, exerciseId, q.id);
    const copyQ = exerciseOf(dupQ.doc, exerciseId).parts[0]!.questions[1]!;
    expect(copyQ.id).not.toBe(q.id);
    expect("options" in copyQ && "options" in q && copyQ.options[0]!.id !== q.options[0]!.id).toBe(true);

    const dupEx = duplicateExercise(dupQ.doc, exerciseId);
    const a = exerciseOf(dupEx.doc, exerciseId);
    const b = exerciseOf(dupEx.doc, dupEx.exerciseId);
    expect(b.title).toBe("Bài tập 1 (bản sao)");
    const ids = (e: typeof a) => e.parts.flatMap((p) => [p.id, ...p.questions.map((x) => x.id)]);
    expect(ids(b).some((id) => ids(a).includes(id))).toBe(false);
    expect(validateLesson(dupEx.doc, env.templates).ok).toBe(true);
  });

  it("keeps pictures and sounds that only an exercise uses when tidying assets", () => {
    let { doc, exerciseId } = lessonWithExercise();
    const sound = addAsset(doc, { file: "assets/audio-0123456789ab.mp3", kind: "audio", mime: "audio/mpeg" });
    const unused = addAsset(sound.doc, { file: "assets/img-0123456789ab.png", kind: "image", mime: "image/png" });
    doc = setExerciseField(unused.doc, exerciseId, ["parts", 0, "audio"], sound.assetId);
    expect(exerciseAssetRefs(exerciseOf(doc, exerciseId))).toEqual([{ assetId: sound.assetId, assetKind: "audio", path: ["parts", 0, "audio"] }]);
    expect(removeUnusedAssets(doc, env.templates).assets.map((a) => a.id)).toEqual([sound.assetId]);
  });

  it("locates broken references inside an exercise in the teacher's terms", () => {
    let { doc, exerciseId } = lessonWithExercise();
    doc = setExerciseField(doc, exerciseId, ["parts", 0, "questions", 0, "image"], "a_missing1");
    const result = validateLesson(doc, env.templates);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(formatIssue(result.issues[0]!, doc, env.templates)).toBe("Đề 1, Phần 1, Câu 1, Ảnh của câu: Tham chiếu tới tài nguyên không tồn tại");
    }
  });

  it("removes a question", () => {
    const { doc, exerciseId } = lessonWithExercise();
    const q = exerciseOf(doc, exerciseId).parts[0]!.questions[0]!.id;
    expect(exerciseOf(removeQuestion(doc, exerciseId, q), exerciseId).parts[0]!.questions).toEqual([]);
  });
});

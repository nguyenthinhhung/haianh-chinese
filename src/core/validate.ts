import type { z } from "zod";
import { describeExercisePath, exerciseAssetRefs } from "./exercise";
import type { Exercise } from "./exerciseSchema";
import { collectAssetRefs, describeContentPath, type AssetRefUse, type Path } from "./fields";
import { LessonSchema, type LessonDocument } from "./schema";
import type { TemplateRegistry } from "./templateRegistry";

export interface LessonIssue {
  /** Path from the document root, e.g. `["slides", 2, "content", "words", 1, "pinyin"]`. */
  path: Path;
  message: string;
}

export type ValidationResult =
  | { ok: true; doc: LessonDocument }
  | { ok: false; issues: LessonIssue[] };

function fromZod(error: z.ZodError, prefix: Path = []): LessonIssue[] {
  return error.issues.map((i) => ({
    path: [...prefix, ...i.path.map((p) => (typeof p === "symbol" ? String(p) : p))],
    message: i.message,
  }));
}

/**
 * Full validation of a (migrated) lesson: the document shape, each slide's
 * content against its template, and the references between slides and assets.
 * Returns the parsed document with safe defaults filled in.
 */
export function validateLesson(raw: unknown, registry: TemplateRegistry): ValidationResult {
  const base = LessonSchema.safeParse(raw);
  if (!base.success) return { ok: false, issues: fromZod(base.error) };

  const doc = base.data;
  const issues: LessonIssue[] = [];
  const assetsById = new Map(doc.assets.map((a) => [a.id, a]));

  if (assetsById.size !== doc.assets.length) issues.push({ path: ["assets"], message: "Trùng ID tài nguyên" });
  if (new Set(doc.slides.map((s) => s.id)).size !== doc.slides.length) {
    issues.push({ path: ["slides"], message: "Trùng ID slide" });
  }

  const checkRef = (ref: AssetRefUse) => {
    const asset = assetsById.get(ref.assetId);
    if (!asset) issues.push({ path: ref.path, message: "Tham chiếu tới tài nguyên không tồn tại" });
    else if (asset.kind !== ref.assetKind) {
      issues.push({ path: ref.path, message: `Cần ${ref.assetKind === "image" ? "ảnh" : "âm thanh"}` });
    }
  };

  if (new Set(doc.exercises.map((e) => e.id)).size !== doc.exercises.length) {
    issues.push({ path: ["exercises"], message: "Trùng ID đề" });
  }
  doc.exercises.forEach((exercise, e) => {
    // Answers are handed in by ID, so IDs must be unique where they are looked up.
    const parts = exercise.parts.map((p) => p.id);
    const questions = exercise.parts.flatMap((p) => p.questions);
    if (new Set(parts).size !== parts.length) issues.push({ path: ["exercises", e, "parts"], message: "Trùng ID phần" });
    if (new Set(questions.map((q) => q.id)).size !== questions.length) issues.push({ path: ["exercises", e], message: "Trùng ID câu hỏi" });
    for (const q of questions) {
      if ("options" in q && new Set(q.options.map((o) => o.id)).size !== q.options.length) {
        issues.push({ path: ["exercises", e], message: "Trùng ID lựa chọn" });
      }
    }
    exerciseAssetRefs(exercise, ["exercises", e]).forEach(checkRef);
  });

  const slides = doc.slides.map((slide, i) => {
    const template = registry.get(slide.type);
    if (!template) {
      issues.push({
        path: ["slides", i, "type"],
        message: `Loại slide "${slide.type}" không được hỗ trợ (có thể bài được tạo bằng phiên bản mới hơn của ứng dụng)`,
      });
      return slide;
    }
    const content = template.schema.safeParse(slide.content);
    if (!content.success) {
      issues.push(...fromZod(content.error, ["slides", i, "content"]));
      return slide;
    }
    collectAssetRefs(content.data, template.editor, ["slides", i, "content"]).forEach(checkRef);
    return { ...slide, content: content.data };
  });

  if (issues.length) return { ok: false, issues };
  return { ok: true, doc: { ...doc, slides } };
}

/** "Slide 3, từ 2, Pinyin: …" — locates an issue in terms the teacher recognises. */
export function formatIssue(issue: LessonIssue, raw: unknown, registry: TemplateRegistry): string {
  const [root, index, sub, ...rest] = issue.path;
  if (root === "slides" && typeof index === "number") {
    const parts = [`Slide ${index + 1}`];
    if (sub === "content") {
      const type = (raw as { slides?: { type?: unknown }[] } | undefined)?.slides?.[index]?.type;
      const template = typeof type === "string" ? registry.get(type) : undefined;
      parts.push(...(template ? describeContentPath(rest, template.editor) : rest.map(String)));
    } else if (sub !== undefined) {
      parts.push(String(sub));
    }
    return `${parts.join(", ")}: ${issue.message}`;
  }
  if (root === "exercises" && typeof index === "number") {
    const exercise = (raw as { exercises?: Exercise[] } | undefined)?.exercises?.[index];
    const rest = issue.path.slice(2);
    return `${[`Đề ${index + 1}`, ...describeExercisePath(exercise, rest)].join(", ")}: ${issue.message}`;
  }
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

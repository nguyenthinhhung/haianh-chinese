import { BLANK } from "./exercise";
import type { Exercise, ExercisePart, Question } from "./exerciseSchema";
import type { Path } from "./fields";

/**
 * Whether an exercise is ready to hand out. Errors stop it from being handed
 * out (a question students cannot answer, or one the app cannot grade);
 * warnings are worth a look. Neither ever stops the lesson from saving.
 */

export interface ExerciseIssue {
  level: "error" | "warning";
  /** Path inside the exercise, for the form field it is about. */
  path: Path;
  message: string;
  partId?: string;
  questionId?: string;
}

const hasText = (s: string) => s.trim().length > 0;

function questionIssues(part: ExercisePart, q: Question, at: Path): Omit<ExerciseIssue, "partId" | "questionId">[] {
  const out: Omit<ExerciseIssue, "partId" | "questionId">[] = [];
  const error = (path: Path, message: string) => out.push({ level: "error", path: [...at, ...path], message });
  const warning = (path: Path, message: string) => out.push({ level: "warning", path: [...at, ...path], message });
  // A listening question may be only "listen and choose": the part's recording asks it.
  const asked = hasText(q.prompt) || q.image || q.audio || part.audio || hasText(part.passage);

  if (q.type === "true-false") {
    if (!asked) error(["prompt"], "Chưa có câu nhận định");
  } else {
    if (q.type === "choice" && !asked) error(["prompt"], "Chưa có câu hỏi, ảnh hoặc âm thanh");
    if (q.type === "blank-choice" && !q.prompt.includes(BLANK)) error(["prompt"], `Đánh dấu chỗ trống bằng ${BLANK}`);
    q.options.forEach((o, i) => {
      if (!hasText(o.text) && !o.image) error(["options", i, "text"], "Lựa chọn còn trống");
    });
    if (q.options.length < 2) error(["options"], "Cần ít nhất 2 lựa chọn");
    const correct = q.options.filter((o) => o.correct).length;
    if (correct === 0) error(["options"], "Chưa chọn đáp án đúng");
    if (correct > 1) error(["options"], "Chỉ được một đáp án đúng");
    const texts = q.options.filter((o) => !o.image && hasText(o.text)).map((o) => o.text.trim());
    if (new Set(texts).size !== texts.length) warning(["options"], "Có hai lựa chọn giống nhau");
  }
  return out;
}

export function exerciseIssues(exercise: Exercise): ExerciseIssue[] {
  const out: ExerciseIssue[] = [];
  if (!hasText(exercise.title)) out.push({ level: "error", path: ["title"], message: "Đặt tên cho đề" });
  if (!exercise.parts.some((p) => p.questions.length)) out.push({ level: "error", path: ["parts"], message: "Đề chưa có câu hỏi nào" });

  exercise.parts.forEach((part, p) => {
    const at: Path = ["parts", p];
    if (!part.questions.length) out.push({ level: "warning", path: at, message: "Phần này chưa có câu hỏi", partId: part.id });
    if (part.skill === "listening" && !part.audio && part.questions.some((q) => !q.audio)) {
      out.push({ level: "warning", path: [...at, "audio"], message: "Phần nghe chưa có file nghe", partId: part.id });
    }
    part.questions.forEach((q, i) => {
      for (const issue of questionIssues(part, q, [...at, "questions", i])) out.push({ ...issue, partId: part.id, questionId: q.id });
    });
  });
  return out;
}

export const exerciseReady = (exercise: Exercise) => !exerciseIssues(exercise).some((i) => i.level === "error");

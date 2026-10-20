import { BLANK } from "./exercise";
import { tokensOf, toneOf } from "./exerciseGrade";
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

type Found = Omit<ExerciseIssue, "partId" | "questionId">;

const hasText = (s: string) => s.trim().length > 0;

/** Two or more items with the same text, where that makes a question ambiguous. */
const duplicates = (texts: string[]) => {
  const filled = texts.map((t) => t.trim()).filter(Boolean);
  return new Set(filled).size !== filled.length;
};

function questionIssues(part: ExercisePart, q: Question, at: Path): Found[] {
  const out: Found[] = [];
  const error = (path: Path, message: string) => out.push({ level: "error", path: [...at, ...path], message });
  const warning = (path: Path, message: string) => out.push({ level: "warning", path: [...at, ...path], message });
  // A listening question may be only "listen and answer": the part's recording asks it.
  const asked = hasText(q.prompt) || !!q.image || !!q.audio || !!part.audio || hasText(part.passage);

  switch (q.type) {
    case "choice":
    case "blank-choice": {
      if (q.type === "choice" && !asked) error(["prompt"], "Chưa có câu hỏi, ảnh hoặc âm thanh");
      if (q.type === "blank-choice" && !q.prompt.includes(BLANK)) error(["prompt"], `Đánh dấu chỗ trống bằng ${BLANK}`);
      q.options.forEach((o, i) => {
        if (!hasText(o.text) && !o.image) error(["options", i, "text"], "Lựa chọn còn trống");
      });
      if (q.options.length < 2) error(["options"], "Cần ít nhất 2 lựa chọn");
      const correct = q.options.filter((o) => o.correct).length;
      if (correct === 0) error(["options"], "Chưa chọn đáp án đúng");
      if (correct > 1) error(["options"], "Chỉ được một đáp án đúng");
      if (duplicates(q.options.filter((o) => !o.image).map((o) => o.text))) warning(["options"], "Có hai lựa chọn giống nhau");
      break;
    }
    case "true-false":
      if (!asked) error(["prompt"], "Chưa có câu nhận định");
      break;
    case "fill-text":
      if (!asked) error(["prompt"], "Chưa có câu hỏi, ảnh hoặc âm thanh");
      if (!q.accepted.some((a) => hasText(a.text))) error(["accepted"], "Chưa có đáp án");
      break;
    case "tone-pick": {
      if (!hasText(q.prompt) && !q.audio && !part.audio) error(["prompt"], "Cần chữ Hán hoặc âm thanh");
      const tone = toneOf(q.syllable);
      if (tone === null) error(["syllable"], "Gõ âm tiết pinyin có dấu thanh, ví dụ mā");
      else if (tone === 5 && !q.withNeutral) error(["syllable"], "Âm tiết không có dấu thanh: thêm dấu, hoặc bật lựa chọn thanh nhẹ");
      break;
    }
    case "sentence-order":
      if (tokensOf(q.sentence).length < 2) error(["sentence"], "Cần ít nhất 2 thẻ, ngăn nhau bằng /");
      break;
    case "matching":
      if (q.pairs.length < 2) error(["pairs"], "Cần ít nhất 2 cặp");
      q.pairs.forEach((p, i) => {
        if (!hasText(p.left) && !p.leftImage) error(["pairs", i, "left"], "Bên trái còn trống");
        if (!hasText(p.right) && !p.rightImage) error(["pairs", i, "right"], "Bên phải còn trống");
      });
      if (duplicates(q.pairs.filter((p) => !p.rightImage).map((p) => p.right))) warning(["pairs"], "Có hai mục bên phải giống nhau");
      break;
    case "word-bank": {
      q.bank.forEach((b, i) => {
        if (!hasText(b.text)) error(["bank", i, "text"], "Từ còn trống");
      });
      if (q.bank.length < 2) error(["bank"], "Khung từ cần ít nhất 2 từ");
      if (duplicates(q.bank.map((b) => b.text))) error(["bank"], "Khung từ có hai từ giống nhau");
      if (!q.gaps.length) error(["gaps"], "Chưa có câu nào");
      const words = new Set(q.bank.map((b) => b.text.trim()).filter(Boolean));
      q.gaps.forEach((g, i) => {
        if (!g.text.includes(BLANK)) error(["gaps", i, "text"], `Đánh dấu chỗ trống bằng ${BLANK}`);
        if (!hasText(g.answer)) error(["gaps", i, "answer"], "Chưa có từ đúng");
        else if (!words.has(g.answer.trim())) error(["gaps", i, "answer"], "Từ này không có trong khung từ");
      });
      break;
    }
    case "sort-groups":
      q.groups.forEach((g, i) => {
        if (!hasText(g.name)) error(["groups", i, "name"], "Nhóm chưa có tên");
      });
      if (q.groups.length < 2) error(["groups"], "Cần ít nhất 2 nhóm");
      if (q.cards.length < 2) error(["cards"], "Cần ít nhất 2 thẻ");
      q.cards.forEach((c, i) => {
        if (!hasText(c.text) && !c.image) error(["cards", i, "text"], "Thẻ còn trống");
        if (Number(c.group) > q.groups.length) error(["cards", i, "group"], `Chỉ có ${q.groups.length} nhóm`);
      });
      break;
    case "writing":
      if (!hasText(q.prompt) && !q.image) error(["prompt"], "Chưa có đề bài");
      break;
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

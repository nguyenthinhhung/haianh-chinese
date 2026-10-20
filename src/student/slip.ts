import type { Answers, AnswerValue, StudentExercise, StudentQuestion } from "../core/exerciseGrade";

/**
 * A student's answers as a text file to send the teacher when handing in
 * keeps failing: each question with what was answered, in the order this
 * student saw them, then the answers as data so they can still be entered.
 */

const isRecord = (v: unknown): v is Record<string, string> => !!v && typeof v === "object" && !Array.isArray(v);

const label = (item: { text: string; image?: string } | undefined) => (item ? item.text.trim() || (item.image ? "[ảnh]" : "(trống)") : "?");

/** One answer in words, or "" when there is none. */
export function slipAnswer(q: StudentQuestion, value: AnswerValue | undefined): string {
  if (value === undefined) return "";
  switch (q.type) {
    case "choice":
    case "blank-choice":
      return typeof value === "string" ? label(q.options?.find((o) => o.id === value)) : "";
    case "true-false":
      return typeof value === "boolean" ? (value ? "Đúng" : "Sai") : "";
    case "fill-text":
    case "writing":
      return typeof value === "string" ? value : "";
    case "tone-pick":
      return typeof value === "string" ? (value === "5" ? "Thanh nhẹ" : `Thanh ${value}`) : "";
    case "sentence-order":
      return Array.isArray(value) ? value.join(" ") : "";
    case "matching": {
      if (!isRecord(value)) return "";
      return (q.lefts ?? []).flatMap((l) => (value[l.id] ? [`${label(l)} → ${label(q.rights?.find((r) => r.id === value[l.id]))}`] : [])).join("; ");
    }
    case "word-bank": {
      if (!isRecord(value)) return "";
      return (q.gaps ?? []).flatMap((g, i) => (value[g.id] ? [`(${i + 1}) ${label(q.bank?.find((b) => b.id === value[g.id]))}`] : [])).join("; ");
    }
    case "sort-groups": {
      if (!isRecord(value)) return "";
      return (q.cards ?? []).flatMap((c) => (value[c.id] ? [`${label(c)} → ${label(q.groups?.find((g) => g.id === value[c.id]))}`] : [])).join("; ");
    }
  }
}

export function slipText(exercise: StudentExercise, answers: Answers, info: { name: string; attemptId: string; savedAt: string }): string {
  const lines = [
    `PHIẾU TRẢ LỜI — ${exercise.title}`,
    `Học viên: ${info.name}`,
    `Lưu lúc: ${info.savedAt}`,
    "",
    "Bài này CHƯA nộp được lên máy chủ. Em gửi file này cho giáo viên.",
  ];
  let n = 0;
  for (const part of exercise.parts) {
    lines.push("");
    if (part.title.trim()) lines.push(`— ${part.title.trim()} —`);
    for (const q of part.questions) {
      const prompt = q.prompt.replace(/\s+/g, " ").trim();
      lines.push(`Câu ${++n}.${prompt ? ` ${prompt}` : ""}`, `   Trả lời: ${slipAnswer(q, answers[q.id]) || "(bỏ trống)"}`);
    }
  }
  lines.push("", "Dữ liệu cho giáo viên (đừng sửa):", JSON.stringify({ attemptId: info.attemptId, answers }));
  return `${lines.join("\r\n")}\r\n`;
}

/** `phieu-tra-loi-nguyen-minh-an.txt`: plain letters, so every phone keeps the name. */
export function slipFileName(name: string): string {
  const plain = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `phieu-tra-loi${plain ? `-${plain}` : ""}.txt`;
}

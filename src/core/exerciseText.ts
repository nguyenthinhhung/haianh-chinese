import { expectedAnswer, tokensOf, type AnswerValue } from "./exerciseGrade";
import type { Question } from "./exerciseSchema";

/**
 * Answers in words, for the teacher's results (a student's answer next to the
 * right one) and the CSV export. Options are named by their text, not their
 * letter: each student saw them in a different order.
 */

const isRecord = (v: unknown): v is Record<string, string> => !!v && typeof v === "object" && !Array.isArray(v);

const label = (text: string, image?: string) => text.trim() || (image ? "[ảnh]" : "(trống)");

/** One answer, or "" when there is none. */
export function answerText(q: Question, value: AnswerValue | undefined): string {
  if (value === undefined) return "";
  switch (q.type) {
    case "choice":
    case "blank-choice": {
      const option = q.options.find((o) => o.id === value);
      return option ? label(option.text, option.image) : "";
    }
    case "true-false":
      return typeof value === "boolean" ? (value ? "Đúng" : "Sai") : "";
    case "fill-text":
      return Array.isArray(value) ? value.join(" / ") : typeof value === "string" ? value : "";
    case "writing":
      return typeof value === "string" ? value : "";
    case "tone-pick":
      return typeof value === "string" ? (value === "5" ? "Thanh nhẹ" : `Thanh ${value}`) : "";
    case "sentence-order":
      return Array.isArray(value) ? value.join(" ") : "";
    case "matching": {
      if (!isRecord(value)) return "";
      const rights = new Map(q.pairs.map((p) => [p.rightId, label(p.right, p.rightImage)]));
      return q.pairs.flatMap((p) => (value[p.id] ? [`${label(p.left, p.leftImage)} → ${rights.get(value[p.id]!) ?? "?"}`] : [])).join("; ");
    }
    case "word-bank": {
      if (!isRecord(value)) return "";
      const words = new Map(q.bank.map((b) => [b.id, b.text]));
      return q.gaps.flatMap((g, i) => (value[g.id] ? [`(${i + 1}) ${words.get(value[g.id]!) ?? "?"}`] : [])).join("; ");
    }
    case "sort-groups": {
      if (!isRecord(value)) return "";
      const groups = new Map(q.groups.map((g) => [g.id, g.name]));
      return q.cards.flatMap((c) => (value[c.id] ? [`${label(c.text, c.image)} → ${groups.get(value[c.id]!) ?? "?"}`] : [])).join("; ");
    }
  }
}

/** The right answer in words; for writing, the sample answer. */
export function expectedText(q: Question): string {
  if (q.type === "sentence-order") return tokensOf(q.sentence).join(" ");
  return answerText(q, expectedAnswer(q));
}

/** The question in one short line, for tables. */
export function questionLine(q: Question): string {
  const first =
    q.prompt.trim() ||
    (q.type === "matching" ? q.pairs.map((p) => p.left).join(", ") : "") ||
    (q.type === "word-bank" ? q.gaps.map((g) => g.text).join(" / ") : "") ||
    (q.type === "sort-groups" ? q.groups.map((g) => g.name).join(" / ") : "") ||
    (q.type === "sentence-order" ? tokensOf(q.sentence).join(" ") : "");
  const line = first.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

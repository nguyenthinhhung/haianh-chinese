import type { Exercise, ExercisePart, ExerciseSettings, Question, QuestionType, Skill } from "./exerciseSchema";

/**
 * Grading, and the copy of an exercise a student receives. Plain functions
 * with no browser or app dependency: the app's "try it" and the web server
 * grade with the same code.
 */

/**
 * An answer as handed in: an option's ID (choice), true/false (statement),
 * text (typed, a tone 1–5, writing), the words in order (sentence order), or
 * item → choice (matching: left → right; word box: gap → word; groups: card → group).
 */
export type AnswerValue = string | boolean | string[] | Record<string, string>;
export type Answers = Record<string, AnswerValue>;

export type QuestionStatus = "correct" | "partial" | "wrong" | "blank" | "pending";

export interface QuestionGrade {
  id: string;
  skill: Skill;
  points: number;
  earned: number;
  status: QuestionStatus;
  /** Points given by the teacher (writing). */
  manual?: true;
}

export interface ExerciseGrade {
  questions: QuestionGrade[];
  score: number;
  max: number;
  /** 0–100, rounded down so a pass mark is never reached by rounding. */
  percent: number;
  /** Only when the exercise sets a pass mark. */
  passed?: boolean;
  /** Points of answers waiting for the teacher to grade. */
  pending: number;
  bySkill: Partial<Record<Skill, { score: number; max: number }>>;
}

/** Tone of a pinyin syllable from its mark: 1–4, 5 without one (neutral); null when it is not a syllable. */
export function toneOf(syllable: string): number | null {
  const d = syllable.trim().normalize("NFD").toLowerCase();
  if (!d || !/^[a-z̀́̄̈̌]+$/.test(d) || !/[aeiou]/.test(d)) return null;
  if (d.includes("̄")) return 1;
  if (d.includes("́")) return 2;
  if (d.includes("̌")) return 3;
  if (d.includes("̀")) return 4;
  return 5;
}

/**
 * Text as compared when grading: no spaces, punctuation or symbols, lower
 * case. `loose` also drops tone marks (and reads v as ü), for typed pinyin.
 */
export function normalizeText(text: string, loose: boolean): string {
  let t = text.normalize("NFC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  if (loose) t = t.normalize("NFD").replace(/\p{M}/gu, "").replace(/v/g, "u");
  return t;
}

/** The cards of a sentence to put in order: its words between `/`. */
export const tokensOf = (sentence: string) =>
  sentence
    .split("/")
    .map((t) => t.trim())
    .filter(Boolean);

/** Points a question is worth: one per item where items are graded one by one. */
export function questionPoints(q: Question): number {
  switch (q.type) {
    case "matching":
      return q.pairs.length;
    case "word-bank":
      return q.gaps.length;
    case "sort-groups":
      return q.cards.length;
    default:
      return q.points;
  }
}

/** The word from the box that fills a gap, by its text. */
function bankIdFor(q: Extract<Question, { type: "word-bank" }>, answer: string): string | undefined {
  const text = answer.trim();
  return text ? q.bank.find((b) => b.text.trim() === text)?.id : undefined;
}

/** The right answer, in the shape an answer takes; for typed answers every accepted one, for writing the sample. */
export function expectedAnswer(q: Question): AnswerValue | undefined {
  switch (q.type) {
    case "choice":
    case "blank-choice":
      return q.options.find((o) => o.correct)?.id;
    case "true-false":
      return q.answer;
    case "fill-text": {
      const accepted = q.accepted.map((a) => a.text.trim()).filter(Boolean);
      return accepted.length ? accepted : undefined;
    }
    case "tone-pick": {
      const tone = toneOf(q.syllable);
      return tone === null ? undefined : String(tone);
    }
    case "sentence-order": {
      const tokens = tokensOf(q.sentence);
      return tokens.length ? tokens : undefined;
    }
    case "matching":
      return Object.fromEntries(q.pairs.map((p) => [p.id, p.rightId]));
    case "word-bank":
      return Object.fromEntries(q.gaps.flatMap((g) => {
        const id = bankIdFor(q, g.answer);
        return id ? [[g.id, id]] : [];
      }));
    case "sort-groups":
      return Object.fromEntries(q.cards.flatMap((c) => {
        const group = q.groups[Number(c.group) - 1];
        return group ? [[c.id, group.id]] : [];
      }));
    case "writing":
      return q.sample.trim() || undefined;
  }
}

const BLANK = { status: "blank", earned: 0 } as const;

/** One point per item answered right: item → expected choice. */
function byItems(expected: [string, string | undefined][], raw: unknown): { status: QuestionStatus; earned: number } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return BLANK;
  const given = raw as Record<string, unknown>;
  if (!expected.some(([item]) => typeof given[item] === "string")) return BLANK;
  const right = expected.filter(([item, choice]) => choice !== undefined && given[item] === choice).length;
  return { status: right === expected.length ? "correct" : right > 0 ? "partial" : "wrong", earned: right };
}

function scoreQuestion(q: Question, raw: unknown, manual: number | undefined): { status: QuestionStatus; earned: number } {
  const points = questionPoints(q);
  const all = (right: boolean) => (right ? { status: "correct" as const, earned: points } : { status: "wrong" as const, earned: 0 });
  switch (q.type) {
    case "choice":
    case "blank-choice":
      return typeof raw === "string" && q.options.some((o) => o.id === raw) ? all(q.options.find((o) => o.correct)?.id === raw) : BLANK;
    case "true-false":
      return typeof raw === "boolean" ? all(raw === q.answer) : BLANK;
    case "fill-text": {
      if (typeof raw !== "string" || !raw.trim()) return BLANK;
      const given = normalizeText(raw, q.looseTones);
      return all(q.accepted.some((a) => a.text.trim() && normalizeText(a.text, q.looseTones) === given));
    }
    case "tone-pick":
      return typeof raw === "string" && /^[1-5]$/.test(raw) ? all(Number(raw) === toneOf(q.syllable)) : BLANK;
    case "sentence-order": {
      if (!Array.isArray(raw) || !raw.length || !raw.every((t) => typeof t === "string")) return BLANK;
      const given = normalizeText(raw.join(""), false);
      const right = [q.sentence, ...q.alternatives.map((a) => a.text)].filter((s) => s.trim()).map((s) => normalizeText(tokensOf(s).join(""), false));
      return all(right.includes(given));
    }
    case "matching":
      return byItems(q.pairs.map((p) => [p.id, p.rightId]), raw);
    case "word-bank":
      return byItems(q.gaps.map((g) => [g.id, bankIdFor(q, g.answer)]), raw);
    case "sort-groups":
      return byItems(q.cards.map((c) => [c.id, q.groups[Number(c.group) - 1]?.id]), raw);
    case "writing": {
      if (typeof raw !== "string" || !raw.trim()) return BLANK;
      if (manual === undefined) return { status: "pending", earned: 0 };
      const earned = Math.max(0, Math.min(points, Math.round(manual)));
      return { status: earned >= points ? "correct" : earned > 0 ? "partial" : "wrong", earned };
    }
  }
}

function totals(questions: QuestionGrade[], passPercent: number): ExerciseGrade {
  const bySkill: ExerciseGrade["bySkill"] = {};
  for (const q of questions) {
    const skill = (bySkill[q.skill] ??= { score: 0, max: 0 });
    skill.score += q.earned;
    skill.max += q.points;
  }
  const score = questions.reduce((n, q) => n + q.earned, 0);
  const max = questions.reduce((n, q) => n + q.points, 0);
  const pending = questions.reduce((n, q) => n + (q.status === "pending" ? q.points : 0), 0);
  const percent = max ? Math.floor((score * 100) / max) : 0;
  return { questions, score, max, percent, ...(passPercent > 0 ? { passed: percent >= passPercent } : {}), pending, bySkill };
}

/** Grades every question; `manual` holds the points the teacher gave to written answers. */
export function gradeExercise(exercise: Exercise, answers: Readonly<Record<string, unknown>>, manual: Readonly<Record<string, number>> = {}): ExerciseGrade {
  const questions: QuestionGrade[] = [];
  for (const part of exercise.parts) {
    for (const q of part.questions) {
      const { status, earned } = scoreQuestion(q, answers[q.id], manual[q.id]);
      const graded = q.type === "writing" && manual[q.id] !== undefined && status !== "blank";
      questions.push({ id: q.id, skill: part.skill, points: questionPoints(q), earned, status, ...(graded ? { manual: true as const } : {}) });
    }
  }
  return totals(questions, exercise.settings.passPercent);
}

/**
 * The teacher's points for written answers, applied to a grade already kept
 * (the exercise may have changed since it was handed in, so nothing else is
 * graded again).
 */
export function applyManualGrades(grade: ExerciseGrade, manual: Readonly<Record<string, number>>, passPercent: number): ExerciseGrade {
  const questions = grade.questions.map((q): QuestionGrade => {
    const given = manual[q.id];
    if (given === undefined || !(q.status === "pending" || q.manual)) return q;
    const earned = Math.max(0, Math.min(q.points, Math.round(given)));
    return { ...q, earned, status: earned >= q.points ? "correct" : earned > 0 ? "partial" : "wrong", manual: true };
  });
  return totals(questions, passPercent);
}

/** What students may see after handing in: right answers, explanations and recordings' words. */
export interface ExerciseReview {
  questions: Record<string, { expected?: AnswerValue; explanation: string; transcript: string }>;
  parts: Record<string, { transcript: string }>;
}

export function exerciseReview(exercise: Exercise): ExerciseReview {
  const review: ExerciseReview = { questions: {}, parts: {} };
  for (const part of exercise.parts) {
    review.parts[part.id] = { transcript: part.transcript };
    for (const q of part.questions) {
      const expected = expectedAnswer(q);
      review.questions[q.id] = { ...(expected === undefined ? {} : { expected }), explanation: q.explanation, transcript: q.transcript };
    }
  }
  return review;
}

// The student's copy --------------------------------------------------------

export interface StudentOption {
  id: string;
  text: string;
  pinyin: string;
  image?: string;
}

export interface StudentItem {
  id: string;
  text: string;
  image?: string;
}

export interface StudentQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  pinyin: string;
  image?: string;
  audio?: string;
  points: number;
  /** Choice questions, in the order this student sees them. */
  options?: StudentOption[];
  /** Sentence order: the words, shuffled. */
  tokens?: string[];
  /** Matching: the left column in order, the right one shuffled. */
  lefts?: StudentItem[];
  rights?: StudentItem[];
  /** Word box: the words, and the sentences with a gap each. */
  bank?: StudentItem[];
  gaps?: StudentItem[];
  /** Sorting: the groups, and the cards shuffled. */
  groups?: StudentItem[];
  cards?: StudentItem[];
  /** Tone: whether the neutral tone is a choice. */
  withNeutral?: boolean;
  /** Writing: longest answer allowed. */
  maxChars?: number;
}

export interface StudentPart {
  id: string;
  skill: Skill;
  title: string;
  instruction: string;
  audio?: string;
  image?: string;
  passage: string;
  questions: StudentQuestion[];
}

/** The exercise without answers, explanations or recordings' words. */
export interface StudentExercise {
  id: string;
  title: string;
  intro: string;
  settings: Omit<ExerciseSettings, "showAnswers" | "passPercent"> & { showAnswers: boolean; passPercent: number };
  parts: StudentPart[];
}

/** mulberry32, seeded from a string: the same seed always gives the same order. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Shuffled, and never left in the given order when that order is the answer. */
function shuffledAway<T>(items: readonly T[], random: () => number, same: (a: T[], b: readonly T[]) => boolean): T[] {
  const out = shuffled(items, random);
  if (items.length > 1 && same(out, items)) out.push(out.shift()!);
  return out;
}

const withAsset = (key: "image" | "audio", id: string | undefined) => (id ? { [key]: id } : {});
const item = (id: string, text: string, image?: string): StudentItem => ({ id, text, ...withAsset("image", image) });

/**
 * A question as students see it: everything but the answer, explanation and
 * words. Orders that would give the answer away (words to put in order, the
 * right column, the cards) are shuffled with `random`.
 */
export function studentQuestion(q: Question, pinyin: boolean, random: () => number = seededRandom(q.id)): StudentQuestion {
  const base: StudentQuestion = {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    pinyin: pinyin ? q.pinyin : "",
    ...withAsset("image", q.image),
    ...withAsset("audio", q.audio),
    points: questionPoints(q),
  };
  switch (q.type) {
    case "choice":
    case "blank-choice":
      return { ...base, options: q.options.map((o) => ({ id: o.id, text: o.text, pinyin: pinyin ? o.pinyin : "", ...withAsset("image", o.image) })) };
    case "sentence-order": {
      const tokens = tokensOf(q.sentence);
      return { ...base, tokens: shuffledAway(tokens, random, (a, b) => a.join("") === b.join("")) };
    }
    case "matching":
      return {
        ...base,
        lefts: q.pairs.map((p) => item(p.id, p.left, p.leftImage)),
        rights: shuffledAway(q.pairs.map((p) => item(p.rightId, p.right, p.rightImage)), random, (a, b) => a.every((x, i) => x.id === b[i]!.id)),
      };
    case "word-bank":
      return { ...base, bank: q.bank.map((b) => item(b.id, b.text)), gaps: q.gaps.map((g) => item(g.id, g.text)) };
    case "sort-groups":
      return { ...base, groups: q.groups.map((g) => item(g.id, g.name)), cards: shuffled(q.cards.map((c) => item(c.id, c.text, c.image)), random) };
    case "tone-pick":
      return { ...base, withNeutral: q.withNeutral };
    case "writing":
      return { ...base, maxChars: q.maxChars };
    default:
      return base;
  }
}

/** A part as students see it, with `questions` in the order given. */
export function studentPart(part: ExercisePart, questions: StudentQuestion[]): StudentPart {
  return {
    id: part.id,
    skill: part.skill,
    title: part.title,
    instruction: part.instruction,
    ...withAsset("audio", part.audio),
    ...withAsset("image", part.image),
    passage: part.passage,
    questions,
  };
}

/**
 * The copy a student works on: no right answers, explanations or recordings'
 * words, shuffled as the settings ask with `seed` (one per attempt). Questions
 * tied to a part's recording or passage keep their order, since they follow it.
 */
export function studentCopy(exercise: Exercise, seed: string): StudentExercise {
  const random = seededRandom(seed);
  const { settings } = exercise;
  return {
    id: exercise.id,
    title: exercise.title,
    intro: exercise.intro,
    settings: { ...settings, showAnswers: settings.showAnswers === "after-submit" },
    parts: exercise.parts.map((part) => {
      const fixed = !!part.audio || part.passage.trim().length > 0;
      const order = settings.shuffleQuestions && !fixed ? shuffled(part.questions, random) : part.questions;
      return studentPart(
        part,
        order.map((q) => {
          const copy = studentQuestion(q, settings.pinyin, random);
          if (!settings.shuffleOptions) return copy;
          if (copy.options) return { ...copy, options: shuffled(copy.options, random) };
          if (copy.bank) return { ...copy, bank: shuffled(copy.bank, random) };
          return copy;
        }),
      );
    }),
  };
}

import type { Exercise, ExercisePart, ExerciseSettings, Question, QuestionType, Skill } from "./exerciseSchema";

/**
 * Grading, and the copy of an exercise a student receives. Plain functions
 * with no browser or app dependency: the app's "try it" and the web server
 * grade with the same code.
 */

/** An option's ID for choice questions, true/false for a statement. */
export type AnswerValue = string | boolean;
export type Answers = Record<string, AnswerValue>;

export interface QuestionGrade {
  id: string;
  points: number;
  earned: number;
  status: "correct" | "wrong" | "blank";
}

export interface ExerciseGrade {
  questions: QuestionGrade[];
  score: number;
  max: number;
  /** 0–100, rounded down so a pass mark is never reached by rounding. */
  percent: number;
  /** Only when the exercise sets a pass mark. */
  passed?: boolean;
  bySkill: Partial<Record<Skill, { score: number; max: number }>>;
}

export function expectedAnswer(q: Question): AnswerValue | undefined {
  if (q.type === "true-false") return q.answer;
  return q.options.find((o) => o.correct)?.id;
}

/** The answer as handed in, if it is one this question can take; anything else counts as blank. */
function acceptedAnswer(q: Question, given: unknown): AnswerValue | undefined {
  if (q.type === "true-false") return typeof given === "boolean" ? given : undefined;
  return typeof given === "string" && q.options.some((o) => o.id === given) ? given : undefined;
}

export function gradeExercise(exercise: Exercise, answers: Readonly<Record<string, unknown>>): ExerciseGrade {
  const questions: QuestionGrade[] = [];
  const bySkill: ExerciseGrade["bySkill"] = {};
  for (const part of exercise.parts) {
    for (const q of part.questions) {
      const given = acceptedAnswer(q, answers[q.id]);
      const status = given === undefined ? "blank" : given === expectedAnswer(q) ? "correct" : "wrong";
      const earned = status === "correct" ? q.points : 0;
      questions.push({ id: q.id, points: q.points, earned, status });
      const skill = (bySkill[part.skill] ??= { score: 0, max: 0 });
      skill.score += earned;
      skill.max += q.points;
    }
  }
  const score = questions.reduce((n, q) => n + q.earned, 0);
  const max = questions.reduce((n, q) => n + q.points, 0);
  const percent = max ? Math.floor((score * 100) / max) : 0;
  const pass = exercise.settings.passPercent;
  return { questions, score, max, percent, ...(pass > 0 ? { passed: percent >= pass } : {}), bySkill };
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

export interface StudentQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  pinyin: string;
  image?: string;
  audio?: string;
  points: number;
  /** For choice questions, in the order this student sees them. */
  options?: StudentOption[];
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
function seededRandom(seed: string): () => number {
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

const withAsset = (key: "image" | "audio", id: string | undefined) => (id ? { [key]: id } : {});

/** A question as students see it: everything but the answer, explanation and words. */
export function studentQuestion(q: Question, pinyin: boolean): StudentQuestion {
  const base: StudentQuestion = {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    pinyin: pinyin ? q.pinyin : "",
    ...withAsset("image", q.image),
    ...withAsset("audio", q.audio),
    points: q.points,
  };
  if (q.type === "true-false") return base;
  return { ...base, options: q.options.map((o) => ({ id: o.id, text: o.text, pinyin: pinyin ? o.pinyin : "", ...withAsset("image", o.image) })) };
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
          const copy = studentQuestion(q, settings.pinyin);
          return copy.options && settings.shuffleOptions ? { ...copy, options: shuffled(copy.options, random) } : copy;
        }),
      );
    }),
  };
}

import { z } from "zod";
import { ID_PATTERNS } from "./ids";

/**
 * Exercises a lesson hands out for students to do on their own, graded by
 * the app. The schema holds only structure and hard limits, so a half-written
 * exercise never stops the lesson from saving; whether it is ready to hand
 * out (answers chosen, options filled) is `exerciseIssues`' job.
 */

// Same rule as `AssetIdRef` in schema.ts, which imports this file.
const AssetRef = z.string().regex(ID_PATTERNS.asset, "ID tài nguyên không hợp lệ");

export const SKILLS = ["listening", "reading", "writing", "other"] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_LABELS: Record<Skill, string> = {
  listening: "Nghe",
  reading: "Đọc",
  writing: "Viết",
  other: "Khác",
};

export const MAX_OPTIONS = 6;

const OptionSchema = z.object({
  id: z.string().regex(ID_PATTERNS.option, "ID lựa chọn không hợp lệ"),
  text: z.string().max(200).default(""),
  pinyin: z.string().max(400).default(""),
  image: AssetRef.optional(),
  correct: z.boolean().default(false),
});

const questionBase = {
  id: z.string().regex(ID_PATTERNS.question, "ID câu hỏi không hợp lệ"),
  prompt: z.string().max(1000).default(""),
  pinyin: z.string().max(2000).default(""),
  image: AssetRef.optional(),
  /** Sound of this question alone, e.g. one short dialogue of a listening part. */
  audio: AssetRef.optional(),
  points: z.number().int().min(1).max(20).default(1),
  /** Shown after submitting, when the exercise lets students see answers. */
  explanation: z.string().max(2000).default(""),
  /** Words of the question's recording, shown with the answers. */
  transcript: z.string().max(3000).default(""),
};

const ChoiceQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("choice"),
  options: z.array(OptionSchema).max(MAX_OPTIONS),
});

const TrueFalseQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("true-false"),
  /** Whether the statement is true. */
  answer: z.boolean().default(true),
});

/** A sentence with a gap marked `___`, and words to choose from for it. */
const BlankChoiceQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("blank-choice"),
  options: z.array(OptionSchema).max(MAX_OPTIONS),
});

export const QuestionSchema = z.discriminatedUnion("type", [ChoiceQuestionSchema, TrueFalseQuestionSchema, BlankChoiceQuestionSchema]);

export const PartSchema = z.object({
  id: z.string().regex(ID_PATTERNS.part, "ID phần không hợp lệ"),
  skill: z.enum(SKILLS).default("listening"),
  title: z.string().max(200).default(""),
  instruction: z.string().max(1000).default(""),
  /** Recording the whole part listens to (a textbook track). */
  audio: AssetRef.optional(),
  image: AssetRef.optional(),
  /** Text the whole part reads: a reading passage, or a word bank. */
  passage: z.string().max(6000).default(""),
  /** Words of the part's recording, shown with the answers. */
  transcript: z.string().max(6000).default(""),
  questions: z.array(QuestionSchema).max(200),
});

export const ExerciseSettingsSchema = z.object({
  /** Minutes; 0 means no time limit. */
  timeLimit: z.number().int().min(0).max(600).default(0),
  /** When the clock starts: on "Bắt đầu", or with the first answer. */
  timerStart: z.enum(["start", "first-answer"]).default("start"),
  attempts: z.enum(["one", "many"]).default("many"),
  /** Questions tied to a recording or a passage always keep their order. */
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  /** Plays allowed per recording; 0 means no limit. */
  maxListens: z.number().int().min(0).max(5).default(0),
  showAnswers: z.enum(["after-submit", "never"]).default("after-submit"),
  pinyin: z.boolean().default(true),
  /** Percent of the points needed to pass; 0 means no pass mark. */
  passPercent: z.number().int().min(0).max(100).default(0),
});

export const ExerciseSchema = z.object({
  id: z.string().regex(ID_PATTERNS.exercise, "ID đề không hợp lệ"),
  title: z.string().max(200).default(""),
  /** Note shown before starting. */
  intro: z.string().max(3000).default(""),
  settings: ExerciseSettingsSchema.prefault({}),
  parts: z.array(PartSchema).max(40),
});

export type ExerciseOption = z.output<typeof OptionSchema>;
export type Question = z.output<typeof QuestionSchema>;
export type QuestionType = Question["type"];
export type ExercisePart = z.output<typeof PartSchema>;
export type ExerciseSettings = z.output<typeof ExerciseSettingsSchema>;
export type Exercise = z.output<typeof ExerciseSchema>;

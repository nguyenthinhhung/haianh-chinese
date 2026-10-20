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

const ItemId = z.string().regex(ID_PATTERNS.option, "ID không hợp lệ");

/** Typed in by the student; any of the accepted answers counts. */
const FillTextQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("fill-text"),
  accepted: z.array(z.object({ text: z.string().max(200).default("") })).max(10),
  /** Ignore tone marks, letter case, spaces and punctuation when comparing. */
  looseTones: z.boolean().default(true),
});

/** Hear or read a syllable, pick its tone. */
const TonePickQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("tone-pick"),
  /** The syllable in pinyin with its tone mark, e.g. `mā`; the answer comes from the mark. */
  syllable: z.string().max(20).default(""),
  /** Offer the neutral tone as a fifth choice. */
  withNeutral: z.boolean().default(false),
});

/** Words to put in order; tokens are separated by `/` in the correct sentence. */
const SentenceOrderQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("sentence-order"),
  sentence: z.string().max(300).default(""),
  /** Other orders that are also right. */
  alternatives: z.array(z.object({ text: z.string().max(300).default("") })).max(5),
});

/** Pairs to match: one point each. `rightId` names the right-hand side, so the copy students get does not give pairs away. */
const MatchingQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("matching"),
  pairs: z
    .array(
      z.object({
        id: ItemId,
        rightId: ItemId,
        left: z.string().max(200).default(""),
        leftImage: AssetRef.optional(),
        right: z.string().max(200).default(""),
        rightImage: AssetRef.optional(),
      }),
    )
    .max(8),
});

/** A box of words shared by several sentences with a gap each (HSK reading, part 1): one point per gap. */
const WordBankQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("word-bank"),
  bank: z.array(z.object({ id: ItemId, text: z.string().max(40).default("") })).max(10),
  gaps: z
    .array(
      z.object({
        id: ItemId,
        /** The sentence, with `___` at the gap. */
        text: z.string().max(300).default(""),
        /** The word from the box that fills it. */
        answer: z.string().max(40).default(""),
      }),
    )
    .max(10),
});

/** Cards to put into groups: one point per card. `group` is the group's number. */
const SortGroupsQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("sort-groups"),
  groups: z.array(z.object({ id: ItemId, name: z.string().max(60).default("") })).max(4),
  cards: z
    .array(
      z.object({
        id: ItemId,
        text: z.string().max(60).default(""),
        image: AssetRef.optional(),
        group: z.enum(["1", "2", "3", "4"]).default("1"),
      }),
    )
    .max(12),
});

/** Written freely and graded by the teacher; `sample` is shown with the answers. */
const WritingQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("writing"),
  sample: z.string().max(2000).default(""),
  maxChars: z.number().int().min(10).max(2000).default(200),
});

export const QuestionSchema = z.discriminatedUnion("type", [
  ChoiceQuestionSchema,
  TrueFalseQuestionSchema,
  BlankChoiceQuestionSchema,
  FillTextQuestionSchema,
  TonePickQuestionSchema,
  SentenceOrderQuestionSchema,
  MatchingQuestionSchema,
  WordBankQuestionSchema,
  SortGroupsQuestionSchema,
  WritingQuestionSchema,
]);

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

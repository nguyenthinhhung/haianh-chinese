import { produce, type Draft } from "immer";
import { collectAssetRefs, describeContentPath, type AssetRefUse, type Path } from "./fields";
import { newId } from "./ids";
import type { LessonDocument } from "./schema";
import type { EditorField, EditorFieldSpec } from "./template";
import {
  SKILL_LABELS,
  SKILLS,
  MAX_OPTIONS,
  type Exercise,
  type ExerciseOption,
  type ExercisePart,
  type Question,
  type QuestionType,
  type Skill,
} from "./exerciseSchema";

/**
 * Exercises inside a lesson: the kinds of question, their forms, and the
 * commands that edit them. Like slide commands, every edit is a pure
 * function of the lesson document.
 */

/** Marks the gap in a "choose the word" sentence. */
export const BLANK = "___";

export const newOption = (): ExerciseOption => ({ id: newId("o"), text: "", pinyin: "", correct: false });

/** A matching pair: the right side has its own ID, so students' copies do not show which side goes with which. */
const newPair = () => ({ id: newId("o"), rightId: newId("o"), left: "", right: "" });

const optionsField = (min: number, withImage: boolean): EditorField => ({
  kind: "list",
  key: "options",
  label: "Các lựa chọn",
  itemLabel: "lựa chọn",
  min,
  max: MAX_OPTIONS,
  newItem: newOption,
  fields: [
    { kind: "toggle", key: "correct", label: "Đáp án đúng", exclusive: true },
    { kind: "text", key: "text", label: "Chữ", lang: "zh" },
    { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
    ...(withImage ? [{ kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["text"] } satisfies EditorField] : []),
  ],
});

const pointsField = { kind: "number", key: "points", label: "Điểm", min: 1, max: 20 } satisfies EditorField;
const explanationField = { kind: "text", key: "explanation", label: "Giải thích (hiện sau khi nộp)", multiline: true } satisfies EditorField;
const transcriptField = { kind: "text", key: "transcript", label: "Lời đoạn nghe của câu (hiện sau khi nộp)", lang: "zh", multiline: true } satisfies EditorField;
const imageField = { kind: "asset", key: "image", label: "Ảnh của câu", assetKind: "image", searchFrom: ["prompt"] } satisfies EditorField;
// Reading the transcript aloud makes a listening question without a textbook file.
const audioField = { kind: "asset", key: "audio", label: "Âm thanh riêng của câu", assetKind: "audio", speakFrom: "transcript" } satisfies EditorField;

export interface QuestionKind {
  type: QuestionType;
  /** Name shown to the teacher. */
  label: string;
  description: string;
  editor: EditorFieldSpec;
  /** A new question, empty for the teacher to fill in. */
  blank(): Question;
}

const base = () => ({ id: newId("q"), prompt: "", pinyin: "", points: 1, explanation: "", transcript: "" });

export const QUESTION_KINDS: Record<QuestionType, QuestionKind> = {
  choice: {
    type: "choice",
    label: "Trắc nghiệm",
    description: "Chọn một đáp án đúng trong 2–6 lựa chọn (chữ hoặc ảnh)",
    editor: [
      { kind: "text", key: "prompt", label: "Câu hỏi (để trống nếu chỉ nghe rồi chọn)", lang: "zh", multiline: true },
      { kind: "text", key: "pinyin", label: "Pinyin của câu hỏi", lang: "pinyin" },
      imageField,
      audioField,
      optionsField(2, true),
      pointsField,
      explanationField,
      transcriptField,
    ],
    blank: () => ({ ...base(), type: "choice", options: Array.from({ length: 4 }, newOption) }),
  },
  "true-false": {
    type: "true-false",
    label: "Đúng / Sai",
    description: "Một câu nhận định; học viên chọn Đúng hoặc Sai",
    editor: [
      { kind: "text", key: "prompt", label: "Câu nhận định", lang: "zh", multiline: true },
      { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
      { kind: "toggle", key: "answer", label: "Câu này ĐÚNG (bỏ chọn nếu đáp án là Sai)" },
      imageField,
      audioField,
      pointsField,
      explanationField,
      transcriptField,
    ],
    blank: () => ({ ...base(), type: "true-false", answer: true }),
  },
  "blank-choice": {
    type: "blank-choice",
    label: "Chọn từ điền chỗ trống",
    description: `Một câu có chỗ trống (${BLANK}); chọn từ đúng để điền`,
    editor: [
      { kind: "text", key: "prompt", label: `Câu có chỗ trống — gõ ${BLANK} ở chỗ cần điền`, lang: "zh", multiline: true },
      { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
      optionsField(2, false),
      pointsField,
      explanationField,
    ],
    blank: () => ({ ...base(), type: "blank-choice", prompt: BLANK, options: Array.from({ length: 4 }, newOption) }),
  },
  "fill-text": {
    type: "fill-text",
    label: "Điền chữ",
    description: "Học viên gõ câu trả lời (chữ Hán, pinyin hoặc tiếng Việt); chấm theo các đáp án được chấp nhận",
    editor: [
      { kind: "text", key: "prompt", label: `Câu hỏi (có thể gõ ${BLANK} ở chỗ cần điền)`, lang: "zh", multiline: true },
      { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
      {
        kind: "list",
        key: "accepted",
        label: "Đáp án được chấp nhận",
        itemLabel: "đáp án",
        min: 1,
        max: 10,
        newItem: () => ({ text: "" }),
        fields: [{ kind: "text", key: "text", label: "Đáp án" }],
      },
      { kind: "toggle", key: "looseTones", label: "Không phân biệt dấu thanh, chữ hoa/thường, dấu cách và dấu câu" },
      imageField,
      audioField,
      pointsField,
      explanationField,
      transcriptField,
    ],
    blank: () => ({ ...base(), type: "fill-text", accepted: [{ text: "" }], looseTones: true }),
  },
  "tone-pick": {
    type: "tone-pick",
    label: "Chọn thanh điệu",
    description: "Nghe hoặc nhìn một âm tiết, chọn thanh 1–4 (có thể thêm thanh nhẹ)",
    editor: [
      { kind: "text", key: "prompt", label: "Chữ Hán (để trống nếu chỉ nghe)", lang: "zh" },
      // Right after the characters, so it fills in from them like any pinyin field.
      { kind: "text", key: "syllable", label: "Âm tiết có dấu thanh (đáp án), ví dụ mā", lang: "pinyin" },
      { kind: "asset", key: "audio", label: "Âm thanh", assetKind: "audio", speakFrom: "prompt" },
      { kind: "toggle", key: "withNeutral", label: "Có thêm lựa chọn thanh nhẹ" },
      imageField,
      pointsField,
      explanationField,
    ],
    blank: () => ({ ...base(), type: "tone-pick", syllable: "", withNeutral: false }),
  },
  "sentence-order": {
    type: "sentence-order",
    label: "Sắp xếp câu",
    description: "Bấm các thẻ từ theo đúng thứ tự để thành câu",
    editor: [
      { kind: "text", key: "prompt", label: "Hướng dẫn hoặc câu hỏi (tuỳ chọn)", lang: "zh" },
      { kind: "text", key: "sentence", label: "Câu đúng, ngăn các thẻ bằng /", lang: "zh", placeholder: "我 / 每天 / 都 / 喝 / 茶" },
      {
        kind: "list",
        key: "alternatives",
        label: "Thứ tự khác cũng đúng",
        itemLabel: "câu",
        min: 0,
        max: 5,
        newItem: () => ({ text: "" }),
        fields: [{ kind: "text", key: "text", label: "Câu", lang: "zh" }],
      },
      imageField,
      audioField,
      pointsField,
      explanationField,
      transcriptField,
    ],
    blank: () => ({ ...base(), type: "sentence-order", sentence: "", alternatives: [] }),
  },
  matching: {
    type: "matching",
    label: "Nối cặp",
    description: "Nối mỗi mục bên trái với một mục bên phải (chữ hoặc ảnh); mỗi cặp 1 điểm",
    editor: [
      { kind: "text", key: "prompt", label: "Hướng dẫn (tuỳ chọn)", lang: "zh" },
      {
        kind: "list",
        key: "pairs",
        label: "Các cặp",
        itemLabel: "cặp",
        min: 2,
        max: 8,
        newItem: newPair,
        fields: [
          { kind: "text", key: "left", label: "Bên trái", lang: "zh" },
          { kind: "asset", key: "leftImage", label: "Ảnh bên trái", assetKind: "image", searchFrom: ["left"] },
          { kind: "text", key: "right", label: "Bên phải" },
          { kind: "asset", key: "rightImage", label: "Ảnh bên phải", assetKind: "image", searchFrom: ["right", "left"] },
        ],
      },
      imageField,
      audioField,
      explanationField,
      transcriptField,
    ],
    blank: () => ({ ...base(), type: "matching", pairs: Array.from({ length: 3 }, newPair) }),
  },
  "word-bank": {
    type: "word-bank",
    label: "Chọn từ trong khung",
    description: "Một khung từ dùng chung cho nhiều câu có chỗ trống; mỗi chỗ trống 1 điểm",
    editor: [
      { kind: "text", key: "prompt", label: "Hướng dẫn (tuỳ chọn)", lang: "zh" },
      {
        kind: "list",
        key: "bank",
        label: "Khung từ",
        itemLabel: "từ",
        min: 2,
        max: 10,
        newItem: () => ({ id: newId("o"), text: "" }),
        fields: [{ kind: "text", key: "text", label: "Từ", lang: "zh" }],
      },
      {
        kind: "list",
        key: "gaps",
        label: "Các câu",
        itemLabel: "câu",
        min: 1,
        max: 10,
        newItem: () => ({ id: newId("o"), text: BLANK, answer: "" }),
        fields: [
          { kind: "text", key: "text", label: `Câu có ${BLANK} ở chỗ trống`, lang: "zh" },
          { kind: "text", key: "answer", label: "Từ đúng (có trong khung)", lang: "zh" },
        ],
      },
      explanationField,
    ],
    blank: () => ({
      ...base(),
      type: "word-bank",
      bank: Array.from({ length: 4 }, () => ({ id: newId("o"), text: "" })),
      gaps: Array.from({ length: 3 }, () => ({ id: newId("o"), text: BLANK, answer: "" })),
    }),
  },
  "sort-groups": {
    type: "sort-groups",
    label: "Phân nhóm",
    description: "Đưa mỗi thẻ vào đúng nhóm (2–4 nhóm); mỗi thẻ 1 điểm",
    editor: [
      { kind: "text", key: "prompt", label: "Hướng dẫn (tuỳ chọn)", lang: "zh" },
      {
        kind: "list",
        key: "groups",
        label: "Các nhóm",
        itemLabel: "nhóm",
        min: 2,
        max: 4,
        newItem: () => ({ id: newId("o"), name: "" }),
        fields: [{ kind: "text", key: "name", label: "Tên nhóm" }],
      },
      {
        kind: "list",
        key: "cards",
        label: "Các thẻ",
        itemLabel: "thẻ",
        min: 2,
        max: 12,
        newItem: () => ({ id: newId("o"), text: "", group: "1" }),
        fields: [
          { kind: "text", key: "text", label: "Chữ", lang: "zh" },
          { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["text"] },
          { kind: "select", key: "group", label: "Thuộc nhóm", options: ["1", "2", "3", "4"].map((n) => ({ value: n, label: `Nhóm ${n}` })) },
        ],
      },
      explanationField,
    ],
    blank: () => ({
      ...base(),
      type: "sort-groups",
      groups: Array.from({ length: 2 }, () => ({ id: newId("o"), name: "" })),
      cards: Array.from({ length: 4 }, (_, i) => ({ id: newId("o"), text: "", group: i % 2 ? ("2" as const) : ("1" as const) })),
    }),
  },
  writing: {
    type: "writing",
    label: "Viết / tự luận",
    description: "Học viên viết câu trả lời; giáo viên chấm tay trên bảng điểm",
    editor: [
      { kind: "text", key: "prompt", label: "Đề bài", lang: "zh", multiline: true },
      { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
      imageField,
      audioField,
      { kind: "number", key: "maxChars", label: "Số chữ tối đa", min: 10, max: 2000 },
      pointsField,
      { kind: "text", key: "sample", label: "Bài mẫu (hiện sau khi nộp)", lang: "zh", multiline: true },
      explanationField,
    ],
    blank: () => ({ ...base(), type: "writing", sample: "", maxChars: 200 }),
  },
};

export const QUESTION_TYPES = Object.keys(QUESTION_KINDS) as QuestionType[];

export const PART_EDITOR: EditorFieldSpec = [
  {
    kind: "select",
    key: "skill",
    label: "Kỹ năng",
    options: SKILLS.map((s) => ({ value: s, label: SKILL_LABELS[s] })),
  },
  { kind: "text", key: "title", label: "Tên phần", lang: "zh", placeholder: "第一部分" },
  { kind: "text", key: "instruction", label: "Hướng dẫn làm bài", lang: "zh", multiline: true, placeholder: "请选出正确答案。" },
  { kind: "asset", key: "audio", label: "File nghe của cả phần", assetKind: "audio", speakFrom: "transcript" },
  { kind: "asset", key: "image", label: "Ảnh của cả phần", assetKind: "image", searchFrom: ["title"] },
  { kind: "text", key: "passage", label: "Đoạn văn cho cả phần (bài đọc, bảng từ…)", lang: "zh", multiline: true },
  { kind: "text", key: "transcript", label: "Lời của file nghe (hiện sau khi nộp)", lang: "zh", multiline: true },
];

export const EXERCISE_EDITOR: EditorFieldSpec = [
  { kind: "text", key: "title", label: "Tên đề", placeholder: "Bài tập bài 1" },
  { kind: "text", key: "intro", label: "Lời dặn trước khi làm bài", multiline: true },
];

/** Shown under the exercise's `settings`. */
export const SETTINGS_EDITOR: EditorFieldSpec = [
  { kind: "number", key: "timeLimit", label: "Thời gian làm bài (phút, 0 = không giới hạn)", min: 0, max: 600 },
  {
    kind: "select",
    key: "timerStart",
    label: "Đồng hồ bắt đầu chạy",
    options: [
      { value: "start", label: "Khi bấm Bắt đầu" },
      { value: "first-answer", label: "Khi trả lời câu đầu tiên" },
    ],
    when: (s) => s.timeLimit > 0,
  },
  {
    kind: "select",
    key: "attempts",
    label: "Số lần nộp",
    options: [
      { value: "many", label: "Được làm lại nhiều lần (luyện tập)" },
      { value: "one", label: "Chỉ nộp một lần (kiểm tra)" },
    ],
  },
  { kind: "toggle", key: "shuffleQuestions", label: "Xáo thứ tự câu (câu theo file nghe hoặc đoạn văn giữ nguyên)" },
  { kind: "toggle", key: "shuffleOptions", label: "Xáo thứ tự lựa chọn" },
  { kind: "number", key: "maxListens", label: "Số lần nghe tối đa mỗi file (0 = không giới hạn)", min: 0, max: 5 },
  {
    kind: "select",
    key: "showAnswers",
    label: "Sau khi nộp",
    options: [
      { value: "after-submit", label: "Cho xem đáp án, giải thích và lời đoạn nghe" },
      { value: "never", label: "Chỉ cho xem điểm" },
      { value: "hidden", label: "Không cho xem điểm hay đáp án (chỉ báo đã nộp)" },
    ],
  },
  { kind: "toggle", key: "pinyin", label: "Hiện pinyin" },
  { kind: "number", key: "passPercent", label: "Điểm đạt (% tổng điểm, 0 = không đặt)", min: 0, max: 100 },
];

export function newPart(skill: Skill = "listening"): ExercisePart {
  return { id: newId("p"), skill, title: "", instruction: "", passage: "", transcript: "", questions: [] };
}

export function newExercise(title: string, pinyin = true): Exercise {
  const part = newPart();
  part.questions.push(QUESTION_KINDS.choice.blank());
  return {
    id: newId("e"),
    title,
    intro: "",
    settings: {
      timeLimit: 0,
      timerStart: "start",
      attempts: "many",
      shuffleQuestions: false,
      shuffleOptions: false,
      maxListens: 0,
      // Hidden until the teacher chooses to show them, so answers cannot spread between students
      // and nobody hands in again and again just to push the score up.
      showAnswers: "hidden",
      pinyin,
      passPercent: 0,
    },
    parts: [part],
  };
}

/** Question numbers as students see them: 1, 2, 3… through every part. */
export function questionNumbers(exercise: Exercise): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of exercise.parts) for (const q of part.questions) out.set(q.id, out.size + 1);
  return out;
}

export const questionCount = (exercise: Exercise) => exercise.parts.reduce((n, p) => n + p.questions.length, 0);

export function findQuestion(exercise: Exercise, questionId: string) {
  for (const [partIndex, part] of exercise.parts.entries()) {
    const index = part.questions.findIndex((q) => q.id === questionId);
    if (index >= 0) return { part, partIndex, question: part.questions[index]!, index };
  }
  return undefined;
}

/** Path of a question inside its exercise, for forms and messages. */
export function questionPath(exercise: Exercise, questionId: string): Path | undefined {
  const at = findQuestion(exercise, questionId);
  return at && ["parts", at.partIndex, "questions", at.index];
}

/**
 * "Phần 2, Câu 5, lựa chọn 1, Chữ": where a path inside an exercise points,
 * numbering questions the way students see them.
 */
export function describeExercisePath(exercise: Exercise | undefined, path: Path): string[] {
  const [root, p, sub, q, ...rest] = path;
  if (root !== "parts" || typeof p !== "number") return path.length ? [path.map(String).join(".")] : [];
  const out = [`Phần ${p + 1}`];
  const part = exercise?.parts[p];
  if (sub === "questions" && typeof q === "number") {
    const question = part?.questions[q];
    const number = question && exercise ? questionNumbers(exercise).get(question.id) : undefined;
    out.push(number ? `Câu ${number}` : `câu ${q + 1} của phần`);
    const kind = question && QUESTION_KINDS[question.type];
    out.push(...(kind ? describeContentPath(rest, kind.editor) : rest.map(String)));
  } else if (sub !== undefined) {
    out.push(...describeContentPath([sub, ...(q === undefined ? [] : [q]), ...rest], PART_EDITOR));
  }
  return out;
}

/** Every picture and sound an exercise refers to, with paths inside the exercise. */
export function exerciseAssetRefs(exercise: Exercise, base: Path = []): AssetRefUse[] {
  return exercise.parts.flatMap((part, p) => [
    ...collectAssetRefs(part, PART_EDITOR, [...base, "parts", p]),
    ...part.questions.flatMap((q, i) => collectAssetRefs(q, QUESTION_KINDS[q.type].editor, [...base, "parts", p, "questions", i])),
  ]);
}

// Commands ------------------------------------------------------------------

function exerciseIndex(doc: LessonDocument | Draft<LessonDocument>, exerciseId: string): number {
  const i = doc.exercises.findIndex((e) => e.id === exerciseId);
  if (i < 0) throw new Error(`Exercise ${exerciseId} not found`);
  return i;
}

function draftExercise(d: Draft<LessonDocument>, exerciseId: string): Draft<Exercise> {
  return d.exercises[exerciseIndex(d, exerciseId)]!;
}

export function addExercise(doc: LessonDocument, exercise: Exercise = newExercise(`Bài tập ${doc.exercises.length + 1}`, doc.settings.pinyin)) {
  return {
    doc: produce(doc, (d) => {
      d.exercises.push(structuredClone(exercise));
    }),
    exerciseId: exercise.id,
  };
}

export function removeExercise(doc: LessonDocument, exerciseId: string): LessonDocument {
  return produce(doc, (d) => {
    d.exercises.splice(exerciseIndex(d, exerciseId), 1);
  });
}

/** A copy right after the original, with fresh IDs so answers handed in for one never mix with the other. */
export function duplicateExercise(doc: LessonDocument, exerciseId: string): { doc: LessonDocument; exerciseId: string } {
  const source = doc.exercises[exerciseIndex(doc, exerciseId)]!;
  const copy: Exercise = {
    ...structuredClone(source),
    id: newId("e"),
    title: `${source.title} (bản sao)`.slice(0, 200),
    parts: source.parts.map((p) => ({ ...structuredClone(p), id: newId("p"), questions: p.questions.map(copyQuestion) })),
  };
  return {
    doc: produce(doc, (d) => {
      d.exercises.splice(exerciseIndex(d, exerciseId) + 1, 0, copy);
    }),
    exerciseId: copy.id,
  };
}

function copyQuestion(q: Question): Question {
  const copy = { ...structuredClone(q), id: newId("q") };
  if ("options" in copy) copy.options = copy.options.map((o) => ({ ...o, id: newId("o") }));
  return copy;
}

/** Sets one value inside an exercise; `undefined` removes the key (a cleared picture). */
export function setExerciseField(doc: LessonDocument, exerciseId: string, path: Path, value: unknown): LessonDocument {
  if (path.length === 0) throw new Error("Empty path");
  return produce(doc, (d) => {
    let target = draftExercise(d, exerciseId) as unknown as Record<string | number, unknown>;
    for (const seg of path.slice(0, -1)) {
      const child = target[seg];
      if (child === null || typeof child !== "object") throw new Error(`Invalid exercise path ${path.join(".")}`);
      target = child as Record<string | number, unknown>;
    }
    const last = path[path.length - 1]!;
    if (value === undefined && !Array.isArray(target)) delete target[last];
    else target[last] = value;
  });
}

export function addPart(doc: LessonDocument, exerciseId: string, afterPartId?: string, skill?: Skill): { doc: LessonDocument; partId: string } {
  const ex = doc.exercises[exerciseIndex(doc, exerciseId)]!;
  // A new part usually continues with the same skill as the one before it.
  const after = afterPartId ? ex.parts.find((p) => p.id === afterPartId) : ex.parts[ex.parts.length - 1];
  const part = newPart(skill ?? after?.skill ?? "listening");
  return {
    doc: produce(doc, (d) => {
      const parts = draftExercise(d, exerciseId).parts;
      const after = afterPartId ? parts.findIndex((p) => p.id === afterPartId) : -1;
      parts.splice(after >= 0 ? after + 1 : parts.length, 0, part);
    }),
    partId: part.id,
  };
}

export function removePart(doc: LessonDocument, exerciseId: string, partId: string): LessonDocument {
  return produce(doc, (d) => {
    const parts = draftExercise(d, exerciseId).parts;
    parts.splice(
      parts.findIndex((p) => p.id === partId),
      1,
    );
  });
}

export function movePart(doc: LessonDocument, exerciseId: string, partId: string, toIndex: number): LessonDocument {
  return produce(doc, (d) => {
    const parts = draftExercise(d, exerciseId).parts;
    const from = parts.findIndex((p) => p.id === partId);
    const to = Math.max(0, Math.min(parts.length - 1, toIndex));
    if (from < 0 || from === to) return;
    const [part] = parts.splice(from, 1);
    parts.splice(to, 0, part!);
  });
}

/** Adds a question of `type` after `afterQuestionId`, or at the end of the part. */
export function addQuestion(
  doc: LessonDocument,
  exerciseId: string,
  partId: string,
  type: QuestionType,
  afterQuestionId?: string,
): { doc: LessonDocument; questionId: string } {
  const question = QUESTION_KINDS[type].blank();
  return {
    doc: produce(doc, (d) => {
      const part = draftExercise(d, exerciseId).parts.find((p) => p.id === partId);
      if (!part) throw new Error(`Part ${partId} not found`);
      const after = afterQuestionId ? part.questions.findIndex((q) => q.id === afterQuestionId) : -1;
      part.questions.splice(after >= 0 ? after + 1 : part.questions.length, 0, question);
    }),
    questionId: question.id,
  };
}

export function removeQuestion(doc: LessonDocument, exerciseId: string, questionId: string): LessonDocument {
  return produce(doc, (d) => {
    for (const part of draftExercise(d, exerciseId).parts) {
      const i = part.questions.findIndex((q) => q.id === questionId);
      if (i >= 0) part.questions.splice(i, 1);
    }
  });
}

export function duplicateQuestion(doc: LessonDocument, exerciseId: string, questionId: string): { doc: LessonDocument; questionId: string } {
  const at = findQuestion(doc.exercises[exerciseIndex(doc, exerciseId)]!, questionId);
  if (!at) throw new Error(`Question ${questionId} not found`);
  const copy = copyQuestion(at.question);
  return {
    doc: produce(doc, (d) => {
      draftExercise(d, exerciseId).parts[at.partIndex]!.questions.splice(at.index + 1, 0, copy);
    }),
    questionId: copy.id,
  };
}

/**
 * Moves a question one place up or down; past the start or end of its part
 * it moves into the neighbouring part, so questions can change parts.
 */
export function moveQuestion(doc: LessonDocument, exerciseId: string, questionId: string, direction: -1 | 1): LessonDocument {
  return produce(doc, (d) => {
    const parts = draftExercise(d, exerciseId).parts;
    const p = parts.findIndex((part) => part.questions.some((q) => q.id === questionId));
    if (p < 0) return;
    const list = parts[p]!.questions;
    const i = list.findIndex((q) => q.id === questionId);
    const target = i + direction;
    if (target >= 0 && target < list.length) {
      [list[i], list[target]] = [list[target]!, list[i]!];
      return;
    }
    const next = parts[p + direction];
    if (!next) return;
    const [q] = list.splice(i, 1);
    if (direction < 0) next.questions.push(q!);
    else next.questions.unshift(q!);
  });
}

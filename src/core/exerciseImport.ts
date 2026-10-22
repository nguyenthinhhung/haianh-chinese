import { AGE_PROFILES, ageProfile, type AgeBand } from "./ages";
import { extractJson } from "./aiImport";
import { describeExercisePath, newExercise, QUESTION_KINDS, QUESTION_TYPES, questionNumbers } from "./exercise";
import { exerciseIssues } from "./exerciseCheck";
import { ExerciseSchema, SKILLS, type Exercise, type ExercisePart, type Question, type QuestionType, type Skill } from "./exerciseSchema";
import { newId } from "./ids";
import { parseWordList } from "./lessonPlan";
import { fillMissingPinyin } from "./pinyin";

/**
 * Exercises written by an AI chat tool, usually copied from the teacher's
 * textbook. The teacher copies a prompt and pastes the reply back; nothing
 * here talks to an AI service. The reply has a simpler shape than a stored
 * exercise (no IDs, the right answer named by its letter), turned here into
 * an exercise with fresh IDs.
 */

export interface ExerciseRequest {
  /** Textbook and lesson, e.g. "HSK 1, Bài 7"; the teacher attaches its pages. */
  source: string;
  topic: string;
  words: string;
  age: AgeBand;
  /** About how many questions, when the AI writes them itself. */
  count: number;
  /** Kinds of question to use; none lets the AI choose. */
  kinds: QuestionType[];
  /** Listening parts, read aloud from their words by the app. */
  listening: boolean;
  notes: string;
}

export function normalizeExerciseRequest(raw: unknown): ExerciseRequest {
  const r = isObj(raw) ? raw : {};
  const str = (key: string, max: number) => (typeof r[key] === "string" ? (r[key] as string).slice(0, max) : "");
  const count = Number(r.count);
  return {
    source: str("source", 200),
    topic: str("topic", 200),
    words: str("words", 2000),
    age: AGE_PROFILES.some((a) => a.id === r.age) ? (r.age as AgeBand) : "lower-primary",
    count: Number.isInteger(count) ? Math.min(50, Math.max(3, count)) : 10,
    kinds: Array.isArray(r.kinds) ? QUESTION_TYPES.filter((t) => (r.kinds as unknown[]).includes(t)) : [],
    listening: typeof r.listening === "boolean" ? r.listening : true,
    notes: str("notes", 2000),
  };
}

// Reading the reply -----------------------------------------------------------

type Raw = Record<string, unknown>;

function isObj(value: unknown): value is Raw {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

/** A list as written: a lone value counts as a list of one. */
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value]);

/** An item written either as a bare string or as an object with its text under `key`. */
const itemText = (value: unknown, key: string) => (isObj(value) ? text(value[key]) : text(value));

const SKILL_WORDS: Record<string, Skill> = { nghe: "listening", "đọc": "reading", "viết": "writing", "khác": "other" };

const TYPE_ALIASES: Record<string, QuestionType> = {
  "multiple-choice": "choice",
  "true-or-false": "true-false",
  truefalse: "true-false",
  "fill-in": "fill-text",
  "fill-in-the-blank": "fill-text",
  "word-order": "sentence-order",
  match: "matching",
  wordbank: "word-bank",
  sort: "sort-groups",
  essay: "writing",
};

function questionType(value: unknown): QuestionType | null {
  const name = text(value).toLowerCase().replace(/[\s_]+/g, "-");
  return (QUESTION_TYPES as string[]).includes(name) ? (name as QuestionType) : (TYPE_ALIASES[name] ?? null);
}

const points = (value: unknown) => (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 20 ? (value as number) : 1);

/** The right option: its letter ("B", "(b)", "B."), its number counting from 1, or its text. */
function answerIndex(answer: unknown, options: string[]): number | null {
  if (typeof answer === "number") return Number.isInteger(answer) && answer >= 1 && answer <= options.length ? answer - 1 : null;
  const written = text(answer);
  const letter = /^\(?([A-Fa-f])\)?[.)]?$/.exec(written);
  const index = letter ? letter[1]!.toUpperCase().charCodeAt(0) - 65 : options.indexOf(written);
  return index >= 0 && index < options.length ? index : null;
}

const TRUE_WORDS = ["true", "đúng", "đ", "t", "对", "正确", "yes"];
const FALSE_WORDS = ["false", "sai", "s", "f", "错", "错误", "no"];

function truth(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const word = text(value).toLowerCase();
  return TRUE_WORDS.includes(word) ? true : FALSE_WORDS.includes(word) ? false : null;
}

/** "1".."4": a card's group by its number (counting from 1) or its name. */
function groupNumber(value: unknown, names: string[]): "1" | "2" | "3" | "4" | null {
  const written = text(value);
  const byName = names.indexOf(written);
  const n = /^\d+$/.test(written) ? Number(written) : byName >= 0 ? byName + 1 : 0;
  return n >= 1 && n <= Math.min(4, names.length) ? (String(n) as "1" | "2" | "3" | "4") : null;
}

/** One question of the reply; `fail` records what cannot be read. */
function readQuestion(raw: Raw, fail: (message: string) => void): Question | null {
  const type = questionType(raw.type);
  if (!type) {
    fail(`dạng câu "${text(raw.type) || "(trống)"}" không có; dùng một trong: ${QUESTION_TYPES.join(", ")}`);
    return null;
  }
  const base = {
    id: newId("q"),
    prompt: text(raw.prompt ?? raw.question),
    pinyin: text(raw.pinyin),
    points: points(raw.points),
    explanation: text(raw.explanation),
    transcript: text(raw.transcript),
  };
  switch (type) {
    case "choice":
    case "blank-choice": {
      const options = list(raw.options).map((o) => ({
        id: newId("o"),
        text: itemText(o, "text"),
        pinyin: isObj(o) ? text(o.pinyin) : "",
        correct: isObj(o) && o.correct === true,
      }));
      if (raw.answer !== undefined) {
        const right = answerIndex(raw.answer, options.map((o) => o.text));
        if (right === null) fail(`đáp án "${text(raw.answer)}" không khớp lựa chọn nào (ghi chữ cái A, B, C…)`);
        else options.forEach((o, i) => (o.correct = i === right));
      }
      return { ...base, type, options };
    }
    case "true-false": {
      const answer = truth(raw.answer);
      if (answer === null) fail('"answer" phải là true (đúng) hoặc false (sai)');
      return { ...base, type, answer: answer ?? true };
    }
    case "fill-text":
      return {
        ...base,
        type,
        accepted: list(raw.accepted ?? raw.answer)
          .map((a) => ({ text: itemText(a, "text") }))
          .filter((a) => a.text),
        looseTones: typeof raw.looseTones === "boolean" ? raw.looseTones : true,
      };
    case "tone-pick":
      return { ...base, type, syllable: text(raw.syllable), withNeutral: raw.withNeutral === true };
    case "sentence-order": {
      const order = (value: unknown) => (Array.isArray(value) ? value.map(text).join(" / ") : itemText(value, "text"));
      return {
        ...base,
        type,
        sentence: order(raw.sentence ?? raw.answer),
        alternatives: list(raw.alternatives)
          .map((a) => ({ text: order(a) }))
          .filter((a) => a.text),
      };
    }
    case "matching": {
      const pairs = list(raw.pairs).map((p) => {
        const [left, right] = Array.isArray(p) ? [p[0], p[1]] : isObj(p) ? [p.left, p.right] : [undefined, undefined];
        if (left === undefined || right === undefined) fail('mỗi cặp cần "left" và "right"');
        return { id: newId("o"), rightId: newId("o"), left: text(left), right: text(right) };
      });
      return { ...base, type, pairs };
    }
    case "word-bank": {
      const gaps = list(raw.gaps).map((g) => {
        if (!isObj(g)) fail('mỗi câu trong "gaps" cần "text" và "answer"');
        return { id: newId("o"), text: isObj(g) ? text(g.text) : "", answer: isObj(g) ? text(g.answer) : "" };
      });
      return { ...base, type, bank: list(raw.bank).map((b) => ({ id: newId("o"), text: itemText(b, "text") })), gaps };
    }
    case "sort-groups": {
      const groups = list(raw.groups).map((g) => ({ id: newId("o"), name: itemText(g, "name") }));
      const cards = list(raw.cards).map((c) => {
        const card = isObj(c) ? c : {};
        const group = groupNumber(card.group, groups.map((g) => g.name));
        if (!group) fail(`thẻ "${text(card.text)}": nhóm "${text(card.group)}" không có (ghi số thứ tự nhóm, từ 1)`);
        return { id: newId("o"), text: text(card.text), group: group ?? "1" };
      });
      return { ...base, type, groups, cards };
    }
    case "writing": {
      const max = Number(raw.maxChars);
      return { ...base, type, sample: text(raw.sample), maxChars: Number.isInteger(max) ? Math.min(2000, Math.max(10, max)) : 200 };
    }
  }
}

function readPart(raw: Raw, number: () => number, errors: string[]): ExercisePart {
  const transcript = text(raw.transcript);
  const skillName = text(raw.skill).toLowerCase();
  const skill: Skill = (SKILLS as readonly string[]).includes(skillName) ? (skillName as Skill) : (SKILL_WORDS[skillName] ?? (transcript ? "listening" : "reading"));
  const questions = list(raw.questions).flatMap((q) => {
    const n = number();
    const kind = isObj(q) ? questionType(q.type) : null;
    const fail = (message: string) => errors.push(`Câu ${n}${kind ? ` (${QUESTION_KINDS[kind].label})` : ""}: ${message}`);
    if (!isObj(q)) {
      fail("cần là một object có \"type\"");
      return [];
    }
    const question = readQuestion(q, fail);
    return question ? [fillMissingPinyin(question, QUESTION_KINDS[question.type].editor) as Question] : [];
  });
  return {
    id: newId("p"),
    skill,
    title: text(raw.title),
    instruction: text(raw.instruction),
    passage: text(raw.passage),
    transcript,
    questions,
  };
}

export type ExerciseImportResult =
  | {
      ok: true;
      exercise: Exercise;
      /** What still needs fixing before the exercise can be handed out, in words. */
      issues: string[];
    }
  | { ok: false; errors: string[] };

/**
 * Reads `{ "title", "intro", "parts": [{ "skill", …, "questions": [...] }] }`
 * (or just the questions) from an AI reply. Problems are reported by question
 * number, as students will see them.
 */
export function parseAiExercise(reply: string, pinyin = true): ExerciseImportResult {
  const json = extractJson(reply);
  if (!json) return { ok: false, errors: ["Không tìm thấy JSON trong nội dung đã dán."] };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { ok: false, errors: [`JSON bị lỗi: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const envelope: Raw = Array.isArray(raw) ? { questions: raw } : isObj(raw) ? raw : {};
  const rawParts = Array.isArray(envelope.parts) ? envelope.parts : Array.isArray(envelope.questions) ? [{ questions: envelope.questions }] : [];
  if (!rawParts.some((p) => isObj(p) && list(p.questions).length)) return { ok: false, errors: ['JSON cần có "parts", mỗi phần có danh sách "questions".'] };

  const errors: string[] = [];
  let counted = 0;
  const parts = rawParts.filter(isObj).map((p) => readPart(p, () => ++counted, errors));
  const settings = newExercise("", pinyin).settings;
  const exercise: Exercise = { id: newId("e"), title: text(envelope.title) || "Bài tập", intro: text(envelope.intro), settings, parts };
  if (errors.length) return { ok: false, errors };

  const checked = ExerciseSchema.safeParse(exercise);
  if (!checked.success) {
    return {
      ok: false,
      errors: checked.error.issues.map((issue) => {
        const where = describeExercisePath(exercise, issue.path as (string | number)[]);
        return `${where.length ? `${where.join(", ")}: ` : ""}${issue.message}`;
      }),
    };
  }
  const numbers = questionNumbers(checked.data);
  const issues = exerciseIssues(checked.data)
    .filter((i) => i.level === "error")
    .map((i) => {
      const part = checked.data.parts.findIndex((p) => p.id === i.partId);
      return `${i.questionId ? `Câu ${numbers.get(i.questionId)}: ` : part >= 0 ? `Phần ${part + 1}: ` : ""}${i.message}`;
    });
  return { ok: true, exercise: checked.data, issues };
}

// The prompt ------------------------------------------------------------------

const KIND_FORMATS: Record<QuestionType, string> = {
  choice: '"options": ["…", "…", "…"] (2–6 lựa chọn), "answer": "B" (chữ cái của lựa chọn đúng)',
  "true-false": '"prompt" là câu nhận định, "answer": true (đúng) hoặc false (sai)',
  "blank-choice": '"prompt" có ___ ở chỗ trống, "options" và "answer" như "choice"',
  "fill-text": '"accepted": ["你好", "nǐ hǎo"] (mọi cách viết được chấp nhận; khi chấm không phân biệt dấu thanh, hoa/thường, dấu câu)',
  "tone-pick": '"prompt": một chữ Hán, "syllable": âm tiết có dấu thanh (ví dụ "mā"); thêm "withNeutral": true nếu có lựa chọn thanh nhẹ',
  "sentence-order": '"sentence": câu đúng, các thẻ ngăn nhau bằng " / " (ví dụ "我 / 是 / 学生"); "alternatives": các thứ tự khác cũng đúng, nếu có',
  matching: '"pairs": [{"left": "猫", "right": "con mèo"}] (2–8 cặp; mỗi cặp 1 điểm)',
  "word-bank": '"bank": ["一", "二", "三"] (các từ trong khung, 2–10 từ), "gaps": [{"text": "câu có ___", "answer": "từ trong khung"}] (mỗi chỗ trống 1 điểm)',
  "sort-groups": '"groups": ["水果", "动物"] (2–4 nhóm), "cards": [{"text": "苹果", "group": 1}] ("group" là số thứ tự nhóm, từ 1; mỗi thẻ 1 điểm)',
  writing: '"prompt": đề bài, "sample": bài mẫu, "maxChars": số chữ tối đa; giáo viên chấm tay',
};

/** The prompt the teacher pastes into an AI chat, together with the textbook pages if any. */
export function buildExercisePrompt(request: ExerciseRequest): string {
  const age = ageProfile(request.age);
  const source = request.source.trim();
  const topic = request.topic.trim();
  const words = parseWordList(request.words);
  const kinds = request.kinds.length ? request.kinds : QUESTION_TYPES;
  const wanted = [
    ...(source
      ? [
          `- Giáo trình: ${source}. Giáo viên đính kèm các trang bài tập của bài này. Chép đúng các bài tập trong tài liệu (đề, lựa chọn, đáp án, lời bài nghe nếu có), giữ thứ tự và cách chia phần như sách. Bài nào không chuyển được sang các dạng câu dưới đây thì bỏ qua.`,
        ]
      : []),
    ...(topic ? [`- Chủ đề: ${topic}`] : []),
    ...(words.length ? [`- Từ vựng trọng tâm: ${words.join(", ")}`] : []),
    `- Học viên: ${age.label}; độ khó, câu chữ và lời dặn hợp với lứa tuổi này.`,
    source ? `- Số câu: theo tài liệu.` : `- Khoảng ${request.count} câu, chia thành vài phần theo kỹ năng.`,
    request.listening
      ? `- Có phần nghe ("skill": "listening"): ghi lời bài nghe vào "transcript"; ứng dụng tự đọc lời đó thành file nghe.`
      : `- Không có phần nghe.`,
    ...(request.notes.trim() ? [`- Yêu cầu thêm của giáo viên: ${request.notes.trim()}`] : []),
  ].join("\n");

  const formats = kinds.map((t) => `- "${t}" (${QUESTION_KINDS[t].label}): ${KIND_FORMATS[t]}`).join("\n");

  const example = {
    title: "Bài tập HSK 1 – Bài 7",
    intro: "Làm bài trong 15 phút.",
    parts: [
      {
        skill: "listening",
        title: "第一部分",
        instruction: "听录音，选择正确答案。",
        questions: [
          { type: "choice", prompt: "男的叫什么名字？", transcript: "女：你叫什么名字？\n男：我叫王明。", options: ["王明", "李明", "张明"], answer: "A", explanation: "Người nam nói: 我叫王明." },
        ],
      },
      {
        skill: "reading",
        title: "第二部分",
        instruction: "判断对错。",
        passage: "我叫李月，我是中国人。",
        questions: [{ type: "true-false", prompt: "李月是中国人。", answer: true }],
      },
    ],
  };

  return `Bạn là trợ lý soạn bài tập tiếng Trung cho học viên Việt Nam. Học viên tự làm bài trên điện thoại hoặc máy tính; ứng dụng chấm điểm tự động.

Đề cần soạn:
${wanted}

Chỉ trả lời bằng MỘT khối JSON (không giải thích thêm) theo dạng:
{"title": "tên đề", "intro": "lời dặn trước khi làm (không bắt buộc)", "parts": [{"skill": "listening | reading | writing | other", "title": "第一部分", "instruction": "hướng dẫn làm bài", "transcript": "lời bài nghe chung của cả phần (nếu có)", "passage": "đoạn văn chung của cả phần (nếu có)", "questions": [...]}]}

Mỗi câu hỏi có "type" và các trường chung (đều không bắt buộc): "prompt" (đề), "pinyin" (pinyin của đề), "points" (điểm, mặc định 1), "explanation" (giải thích bằng tiếng Việt, hiện sau khi nộp), "transcript" (lời bài nghe riêng của câu). Các dạng câu được dùng:
${formats}

Quy tắc:
- Chữ Hán giản thể; pinyin có dấu thanh, các âm tiết cách nhau bằng dấu cách (nǐ hǎo).
- "instruction" viết như trong sách (tiếng Trung, ngắn gọn); giải thích bằng tiếng Việt.
- Mỗi câu chỉ có một đáp án đúng; lựa chọn sai phải hợp lý nhưng chắc chắn sai.
- Lời bài nghe: mỗi lượt nói một dòng, mở đầu bằng người nói ("男：", "女："); không ghi pinyin. Bài nghe có nhiều câu hỏi thì ghi lời vào "transcript" của phần; mỗi câu một đoạn nghe riêng thì ghi vào "transcript" của câu.
- Không đưa ảnh, file âm thanh hay link.

Ví dụ về định dạng (nội dung chỉ để minh hoạ):
${JSON.stringify(example, null, 2)}`;
}

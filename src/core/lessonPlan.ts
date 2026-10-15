import { AGE_PROFILES, ageProfile, type AgeBand } from "./ages";
import { normalizeForm, type LessonForm } from "./lessonForm";
import type { Slide } from "./schema";
import type { TemplateRegistry } from "./templateRegistry";

/**
 * Lesson blueprints: the app decides the order and kinds of slides for each
 * kind of lesson; the AI only writes the language content into them.
 */

export type LessonKind = "hsk1" | "hsk2" | "hsk3" | "hsk4" | "vocabulary" | "dialogue" | "grammar" | "review" | "mixed" | "word-focus" | "form";
export type Duration = "short" | "medium" | "long" | "double";

/** What the teacher fills in before copying the prompt. */
export interface LessonRequest {
  topic: string;
  age: AgeBand;
  kind: LessonKind;
  duration: Duration;
  /** Words that must be taught, separated by commas or new lines. */
  words: string;
  /** Sentence patterns to teach, e.g. "这是什么？这是……". */
  patterns: string;
  /** Words the class already knows: used again in sentences and games, not taught as new. */
  known: string;
  /** Words or content to leave out of the lesson. */
  exclude: string;
  /**
   * Textbook and unit the lesson follows, e.g. "HSK 1, Bài 7". The teacher
   * attaches those pages to the AI chat; the prompt says to keep to them.
   */
  source: string;
  /** Activity slide types the teacher prefers; empty lets the AI choose. */
  activities: string[];
  notes: string;
  /**
   * Slides per outline step set by the teacher, by step role; steps not
   * listed keep the blueprint's count. Cleared when the kind, age, length or
   * activities change, since the steps and their counts change with them.
   */
  outline: Record<string, number>;
  /** With kind "form": the teacher's own lesson form, followed slide for slide. */
  form: LessonForm | null;
}

export const DEFAULT_REQUEST: LessonRequest = {
  topic: "",
  age: "lower-primary",
  kind: "vocabulary",
  duration: "medium",
  words: "",
  patterns: "",
  known: "",
  exclude: "",
  source: "",
  activities: [],
  notes: "",
  outline: {},
  form: null,
};

/** Request fields that describe a way of teaching rather than one lesson's content; a preset keeps these. */
export const PRESET_FIELDS = ["age", "kind", "duration", "activities", "outline", "notes", "form"] as const;
export type LessonPreset = { name: string; settings: Pick<LessonRequest, (typeof PRESET_FIELDS)[number]> };

export function presetOf(name: string, request: LessonRequest): LessonPreset {
  const settings = Object.fromEntries(PRESET_FIELDS.map((k) => [k, request[k]])) as LessonPreset["settings"];
  return { name: name.trim().slice(0, 60), settings };
}

/** The request with a preset's way of teaching; topic and words stay. */
export function applyPreset(request: LessonRequest, preset: LessonPreset): LessonRequest {
  return normalizeRequest({ ...request, ...preset.settings });
}

export const DURATIONS: { id: Duration; label: string }[] = [
  { id: "short", label: "Ngắn (khoảng 20 phút)" },
  { id: "medium", label: "Vừa (khoảng 35 phút)" },
  { id: "long", label: "Dài (khoảng 45 phút)" },
  { id: "double", label: "2 tiết (khoảng 90 phút)" },
];

interface BlueprintStep {
  role: string;
  types: string[];
  /** Slides for a short, medium and long lesson; 0 leaves the step out. */
  count: [number, number, number];
  /** Practice or game step: narrowed to the activities the teacher picked. */
  activity?: boolean;
  /** Opens or closes a whole lesson (cover, summary); left out when slides are inserted into one. */
  frame?: boolean;
}

interface Blueprint {
  id: LessonKind;
  label: string;
  /** Told to the AI along with the steps. */
  description: string;
  steps: BlueprintStep[];
}

const TEACH_WORDS = ["vocabulary", "picture-card", "flashcard"];
const PRACTICE = ["quiz", "qa-list", "listening", "matching", "fill-blank", "sentence-order", "tone-pick", "sort-groups"];
const GAMES = ["whats-missing", "guess-picture", "box-pick", "lucky-wheel", "memory"];

const COVER: BlueprintStep = { role: "Mở đầu: tên bài", types: ["cover"], count: [1, 1, 1], frame: true };
const SUMMARY: BlueprintStep = { role: "Tổng kết: ý cần nhớ và từ vựng chính", types: ["summary"], count: [1, 1, 1], frame: true };

const TEXTBOOK_NOTE =
  "Giữ đúng các phần theo thứ tự trong sách; tiêu đề slide ghi tên phần như sách (ví dụ \"课文 1\", \"注释 2\", \"练一练\") để các bài giống nhau. Lấy nội dung từ các trang giáo trình giáo viên đính kèm.";

const REVIEW_STEP: BlueprintStep = {
  role: "Kiểm tra bài cũ: đọc nhanh từ của bài trước (từ lớp đã học)",
  types: ["flashcard", "vocabulary"],
  count: [0, 1, 1],
};
const USE_STEP: BlueprintStep = {
  role: "运用 Vận dụng: câu hỏi cho hoạt động nói theo cặp (双人活动) hoặc nhóm (小组活动)",
  types: ["qa-list"],
  count: [1, 1, 1],
};
const GAME_STEP: BlueprintStep = { role: "Trò chơi cả lớp", types: GAMES, count: [0, 1, 1], activity: true };

/**
 * One blueprint per level of HSK Standard Course, whose units keep the same
 * parts in the same order within a level but change between levels: HSK 1–2
 * teach pronunciation and characters with short dialogues; HSK 3 adds a
 * paragraph text and 练一练; HSK 4 has long texts, 比一比 and 扩展.
 */
const HSK_BLUEPRINTS: Blueprint[] = [
  {
    id: "hsk1",
    label: "Theo giáo trình HSK 1",
    description: `Một bài của giáo trình HSK chuẩn 1: 热身 → 课文 (3 cảnh hội thoại ngắn, mỗi cảnh ghi nơi diễn ra) → 生词 → 注释 → 练习 → 语音 → 运用. ${TEXTBOOK_NOTE}`,
    steps: [
      COVER,
      REVIEW_STEP,
      { role: "热身 Khởi động: ghép từ mới với hình", types: ["matching", "quiz"], count: [1, 1, 1] },
      { role: "课文 Bài khoá: mỗi cảnh một slide hội thoại, ghi nơi diễn ra", types: ["dialogue"], count: [2, 3, 3] },
      { role: "生词 Từ mới của bài", types: ["vocabulary", "picture-card"], count: [1, 2, 3] },
      { role: "注释 Ngữ pháp: mỗi điểm ngữ pháp một slide", types: ["grammar"], count: [1, 2, 3] },
      {
        role: "练习 Luyện tập: trả lời theo bài khoá, điền từ, sắp xếp câu",
        types: ["qa-list", "fill-blank", "sentence-order", "quiz", "listening"],
        count: [1, 2, 3],
        activity: true,
      },
      { role: "语音 Ngữ âm: thanh điệu, nghe và đọc theo", types: ["tone-pick", "listening"], count: [0, 1, 1] },
      USE_STEP,
      GAME_STEP,
      SUMMARY,
    ],
  },
  {
    id: "hsk2",
    label: "Theo giáo trình HSK 2",
    description: `Một bài của giáo trình HSK chuẩn 2: 热身 (ghép từ với hình, rồi một hoạt động khởi động) → 课文 (4 cảnh hội thoại, mỗi cảnh 4 câu, ghi nơi diễn ra) → 生词 → 注释 → 练习 (trả lời theo bài khoá, mô tả tranh bằng câu có chỗ trống) → 语音 (trọng âm từ, ngữ điệu câu) → 运用. ${TEXTBOOK_NOTE}`,
    steps: [
      COVER,
      REVIEW_STEP,
      { role: "热身 Khởi động: ghép từ với hình, rồi một hoạt động khởi động theo chủ đề", types: ["matching", "quiz", "qa-list"], count: [1, 1, 2] },
      { role: "课文 Bài khoá: 4 cảnh hội thoại, mỗi cảnh một slide, ghi nơi diễn ra", types: ["dialogue"], count: [3, 4, 4] },
      { role: "生词 Từ mới của bài", types: ["vocabulary", "picture-card"], count: [1, 2, 2] },
      { role: "注释 Ngữ pháp: mỗi điểm ngữ pháp một slide", types: ["grammar"], count: [1, 2, 3] },
      {
        role: "练习 Luyện tập: trả lời theo bài khoá, điền từ vào câu mô tả tranh",
        types: ["qa-list", "fill-blank", "sentence-order", "quiz", "listening"],
        count: [1, 2, 3],
        activity: true,
      },
      { role: "语音 Ngữ âm: trọng âm từ, ngữ điệu câu; nghe và đọc theo", types: ["listening", "tone-pick"], count: [0, 1, 1] },
      USE_STEP,
      GAME_STEP,
      SUMMARY,
    ],
  },
  {
    id: "hsk3",
    label: "Theo giáo trình HSK 3",
    description: `Một bài của giáo trình HSK chuẩn 3: 热身 → 课文 (4 bài khoá: hội thoại 5–6 lượt; từ bài 11, bài khoá 4 là một đoạn văn) → 生词 → 注释 (mỗi điểm có 练一练) → 练习 (chọn từ điền, trả lời theo bài khoá) → 汉字 (旧字新词) → 运用. Sách không in pinyin trên chữ trong bài khoá. ${TEXTBOOK_NOTE}`,
    steps: [
      COVER,
      REVIEW_STEP,
      { role: "热身 Khởi động: ghép từ với hình, rồi một hoạt động khởi động", types: ["matching", "quiz", "qa-list"], count: [1, 1, 2] },
      { role: "课文 Bài khoá 1–4: hội thoại; bài khoá đoạn văn dùng \"passage\"", types: ["dialogue", "passage"], count: [3, 4, 4] },
      { role: "生词 Từ mới của bài", types: ["vocabulary", "picture-card"], count: [1, 1, 2] },
      { role: "注释 Ngữ pháp: mỗi điểm một slide, câu ví dụ lấy từ bài khoá", types: ["grammar"], count: [1, 2, 3] },
      { role: "练一练: hoàn thành câu / đối thoại với từ gợi ý, sau mỗi điểm ngữ pháp", types: ["sentence-practice"], count: [1, 2, 3] },
      {
        role: "练习 Luyện tập: chọn từ điền (ngân hàng 5 từ), trả lời theo bài khoá",
        types: ["fill-blank", "qa-list", "listening", "quiz"],
        count: [1, 2, 3],
        activity: true,
      },
      { role: "汉字 旧字新词: hai từ đã học ghép thành từ mới", types: ["matching", "vocabulary"], count: [0, 1, 1] },
      USE_STEP,
      GAME_STEP,
      SUMMARY,
    ],
  },
  {
    id: "hsk4",
    label: "Theo giáo trình HSK 4",
    description: `Một bài của giáo trình HSK chuẩn 4 (上/下): 热身 → 课文 1–3 (hội thoại 6–8 lượt) → 注释 1–3 kèm 练一练 → câu hỏi theo bài khoá → 课文 4–5 (đoạn văn khoảng 200 chữ) → 注释 4–5 và 比一比 → 练习 (chọn từ điền: hai ngân hàng 5 từ) → 扩展 同字词 → 运用. Sách không in pinyin trên chữ trong bài khoá. ${TEXTBOOK_NOTE}`,
    steps: [
      COVER,
      REVIEW_STEP,
      { role: "热身 Khởi động: ghép từ với hình, rồi câu hỏi khảo sát / thảo luận theo chủ đề", types: ["matching", "qa-list"], count: [1, 1, 2] },
      { role: "课文 1–3: hội thoại dài, mỗi bài khoá một slide", types: ["dialogue", "passage"], count: [2, 3, 3] },
      { role: "注释 1–3: giải thích từ / điểm ngữ pháp, ví dụ lấy từ bài khoá", types: ["grammar"], count: [1, 2, 3] },
      { role: "练一练: hoàn thành câu / đối thoại với từ cho sẵn", types: ["sentence-practice"], count: [1, 2, 3] },
      { role: "根据课文内容回答问题: câu hỏi theo bài khoá", types: ["qa-list"], count: [1, 1, 2] },
      { role: "课文 4–5: đoạn văn, mỗi bài một slide", types: ["passage"], count: [1, 2, 2] },
      { role: "比一比: phân biệt hai từ dễ nhầm", types: ["compare"], count: [1, 1, 1] },
      {
        role: "练习: chọn từ điền (ngân hàng 5 từ), hoàn thành câu",
        types: ["fill-blank", "sentence-practice", "quiz"],
        count: [1, 1, 2],
        activity: true,
      },
      { role: "扩展 同字词: các từ có chung một chữ, kèm câu ví dụ", types: ["vocabulary", "fill-blank"], count: [0, 1, 1] },
      USE_STEP,
      GAME_STEP,
      SUMMARY,
    ],
  },
];

export const BLUEPRINTS: Blueprint[] = [
  ...HSK_BLUEPRINTS,
  {
    id: "vocabulary",
    label: "Từ vựng — học từ mới qua hình ảnh",
    description: "Bài dạy từ mới theo chủ đề: giới thiệu từng từ, dùng thử trong câu ngắn, rồi luyện tập và chơi để nhớ.",
    steps: [
      COVER,
      { role: "Dạy từ mới (vài từ một slide, hoặc một từ một slide với picture-card)", types: TEACH_WORDS, count: [2, 3, 4] },
      { role: "Dùng từ mới trong câu ngắn", types: ["sentence-order", "fill-blank", "dialogue"], count: [0, 1, 1] },
      { role: "Luyện tập", types: PRACTICE, count: [1, 2, 3], activity: true },
      { role: "Trò chơi cả lớp", types: GAMES, count: [1, 2, 2], activity: true },
      SUMMARY,
    ],
  },
  {
    id: "dialogue",
    label: "Hội thoại — học cách giao tiếp",
    description: "Bài giao tiếp theo một tình huống quen thuộc: học cụm từ trọng tâm, nghe hội thoại mẫu, hiểu mẫu câu, rồi luyện lại.",
    steps: [
      COVER,
      { role: "Từ và cụm từ trọng tâm của hội thoại", types: ["vocabulary", "flashcard"], count: [1, 1, 2] },
      { role: "Hội thoại mẫu theo tình huống", types: ["dialogue"], count: [1, 2, 3] },
      { role: "Giải thích mẫu câu chính trong hội thoại", types: ["grammar"], count: [0, 1, 1] },
      { role: "Luyện tập", types: ["qa-list", "listening", "sentence-order", "fill-blank", "quiz", "matching"], count: [1, 2, 2], activity: true },
      { role: "Trò chơi cả lớp", types: GAMES, count: [0, 1, 2], activity: true },
      SUMMARY,
    ],
  },
  {
    id: "grammar",
    label: "Mẫu câu — giải thích và ví dụ",
    description: "Bài dạy mẫu câu: ôn nhanh từ sẽ dùng, giải thích cấu trúc bằng ví dụ, rồi luyện đặt câu.",
    steps: [
      COVER,
      { role: "Ôn nhanh các từ sẽ dùng trong mẫu câu", types: ["vocabulary", "flashcard"], count: [1, 1, 1] },
      { role: "Giải thích mẫu câu kèm ví dụ", types: ["grammar"], count: [1, 2, 2] },
      { role: "Luyện tập mẫu câu", types: ["fill-blank", "sentence-order", "quiz"], count: [2, 3, 4], activity: true },
      { role: "Trò chơi cả lớp", types: GAMES, count: [0, 1, 1], activity: true },
      SUMMARY,
    ],
  },
  {
    id: "review",
    label: "Ôn tập — kiểm tra kiến thức đã học",
    description: "Bài ôn tập: không dạy từ mới, chỉ gợi nhớ và luyện lại những gì lớp đã học, nhiều hoạt động và trò chơi.",
    steps: [
      COVER,
      { role: "Gợi nhớ từ đã học", types: ["flashcard", "whats-missing", "guess-picture"], count: [1, 1, 2] },
      { role: "Luyện tập", types: PRACTICE, count: [2, 3, 4], activity: true },
      { role: "Trò chơi cả lớp", types: GAMES, count: [1, 2, 3], activity: true },
      SUMMARY,
    ],
  },
  {
    id: "mixed",
    label: "Tổng hợp — kết hợp nhiều dạng",
    description: "Bài trọn vẹn một tiết: dạy từ mới, dùng từ trong mẫu câu hoặc hội thoại, luyện tập và trò chơi.",
    steps: [
      COVER,
      { role: "Dạy từ mới", types: TEACH_WORDS, count: [1, 2, 2] },
      { role: "Dùng từ trong mẫu câu hoặc hội thoại", types: ["dialogue", "grammar"], count: [1, 1, 2] },
      { role: "Luyện tập", types: PRACTICE, count: [1, 2, 3], activity: true },
      { role: "Trò chơi cả lớp", types: GAMES, count: [1, 2, 2], activity: true },
      SUMMARY,
    ],
  },
  {
    id: "word-focus",
    label: "Dạy kỹ từ — chèn vào giữa bài theo giáo trình",
    description:
      "Đào sâu vài từ (hoặc một mẫu câu) giáo viên chọn, để chèn ngay sau phần đó trong bài theo giáo trình: giải thích kỹ từng từ, ngữ pháp đi kèm, luyện tập, rồi chủ đề nói để học sinh dùng từ nói về bản thân. Không có trang bìa hay tổng kết.",
    steps: [
      { role: "Giải thích kỹ từng từ: một từ một slide, có từ loại, cách dùng và câu ví dụ", types: ["picture-card"], count: [1, 2, 3] },
      { role: "Ngữ pháp hoặc cách dùng đi kèm các từ này", types: ["grammar"], count: [0, 1, 1] },
      { role: "Luyện tập với các từ này", types: ["fill-blank", "sentence-order", "quiz", "matching"], count: [1, 1, 2], activity: true },
      { role: "Chủ đề nói: câu hỏi để học sinh dùng các từ này nói về bản thân", types: ["qa-list"], count: [1, 1, 1] },
      { role: "Trò chơi ngắn", types: GAMES, count: [0, 0, 1], activity: true },
    ],
  },
];

export interface PlanStep {
  role: string;
  types: string[];
  count: number;
  /** The teacher's guidance for this step, from her lesson form. */
  note?: string;
}

/** A step of the outline the teacher can adjust before copying the prompt. */
export interface OutlineStep extends PlanStep {
  /** The blueprint's count for this length and these activities. */
  suggested: number;
  min: number;
  max: number;
}

/** Most slides a teacher can give one outline step. */
const MAX_STEP_SLIDES = 6;

const DURATION_INDEX: Record<Duration, 0 | 1 | 2 | 3> = { short: 0, medium: 1, long: 2, double: 3 };

/** Slides of a step for a lesson length; a double lesson has nearly twice a long one's, but one cover and one summary. */
function countFor(step: BlueprintStep, index: 0 | 1 | 2 | 3): number {
  if (index < 3) return step.count[index as 0 | 1 | 2];
  if (step.frame) return step.count[2];
  return Math.min(MAX_STEP_SLIDES, Math.round(step.count[2] * 1.8));
}

const isGameStep = (types: string[]) => types.length > 0 && types.every((t) => GAMES.includes(t));

function blueprint(kind: LessonKind): Blueprint {
  return BLUEPRINTS.find((b) => b.id === kind) ?? BLUEPRINTS[0]!;
}

/** Steps of a blueprint with the types unsuitable for `age` removed; steps left empty drop out. */
function ageSteps(kind: LessonKind, age: AgeBand, insert = false): (BlueprintStep & { required: boolean })[] {
  const avoid = new Set(ageProfile(age).avoid);
  return blueprint(kind).steps.filter((s) => !(insert && s.frame)).map((s) => ({
    ...s,
    types: s.types.filter((t) => !avoid.has(t)),
    required: s.count.every((c) => c > 0),
  }));
}

/** Lesson kinds that still make sense for `age`: no step the kind relies on is left empty. */
export function lessonKindsFor(age: AgeBand): Blueprint[] {
  return BLUEPRINTS.filter((b) => ageSteps(b.id, age).every((s) => s.types.length > 0 || !s.required));
}

/** Activity types the teacher may pick for this kind and age, in blueprint order. */
export function activityChoices(kind: LessonKind, age: AgeBand): string[] {
  if (kind === "form") return [];
  return [...new Set(ageSteps(kind, age).flatMap((s) => (s.activity ? s.types : [])))];
}

/**
 * A usable request from anything, such as the one saved last time: unknown
 * values fall back to defaults, a kind the age cannot use gives way to the
 * first one it can, and picked activities the plan does not offer are dropped.
 */
export function normalizeRequest(raw: unknown): LessonRequest {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof LessonRequest, unknown>>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const age = AGE_PROFILES.some((a) => a.id === r.age) ? (r.age as AgeBand) : DEFAULT_REQUEST.age;
  const form = normalizeForm(r.form);
  const kinds = lessonKindsFor(age);
  const fallback = kinds.find((b) => b.id === DEFAULT_REQUEST.kind) ?? kinds[0]!;
  // "textbook" was the HSK 1 kind before each level had its own.
  const asked = r.kind === "textbook" ? "hsk1" : r.kind;
  const kind: LessonKind = asked === "form" && form ? "form" : (kinds.find((b) => b.id === asked) ?? fallback).id;
  const duration = DURATIONS.some((d) => d.id === r.duration) ? (r.duration as Duration) : DEFAULT_REQUEST.duration;
  const offered = activityChoices(kind, age);
  const activities = Array.isArray(r.activities) ? offered.filter((t) => (r.activities as unknown[]).includes(t)) : [];
  const outline: Record<string, number> = {};
  if (r.outline && typeof r.outline === "object" && !Array.isArray(r.outline)) {
    for (const [role, n] of Object.entries(r.outline)) {
      if (role.length <= 120 && Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_STEP_SLIDES) outline[role] = n as number;
    }
  }
  return {
    topic: text(r.topic, 200),
    age,
    kind,
    duration,
    words: text(r.words, 2000),
    patterns: text(r.patterns, 500),
    known: text(r.known, 2000),
    exclude: text(r.exclude, 1000),
    source: text(r.source, 200),
    activities,
    notes: text(r.notes, 2000),
    outline,
    form,
  };
}

/**
 * Every step of the lesson, including optional ones left at 0, with the
 * teacher's counts applied. An activity step none of whose types the teacher
 * picked hands its slides to the next activity step that has some. Activity
 * and optional steps can go down to 0; the steps a lesson relies on keep 1.
 */
export function planOutline(request: LessonRequest, insert = false): OutlineStep[] {
  if (request.kind === "form") return formOutline(request);
  const index = DURATION_INDEX[request.duration] ?? 1;
  const games = ageProfile(request.age).games;
  const picked = new Set(request.activities);
  const steps: OutlineStep[] = [];
  let carried = 0;
  const pending: OutlineStep[] = [];
  for (const s of ageSteps(request.kind, request.age, insert)) {
    let types = s.types;
    // Adults get games only when the teacher asks for them (+ in the outline, or by picking one).
    let count = !games && isGameStep(s.types) && !s.types.some((t) => picked.has(t)) ? 0 : countFor(s, index);
    if (s.activity && picked.size) {
      const chosen = types.filter((t) => picked.has(t));
      if (!chosen.length) {
        carried += count;
        continue;
      }
      types = chosen;
      count += carried;
      carried = 0;
    }
    if (!types.length) continue;
    const min = s.required && !s.activity ? 1 : 0;
    const step = { role: s.role, types, count, suggested: count, min, max: Math.max(MAX_STEP_SLIDES, count) };
    steps.push(step);
    if (s.activity) pending.push(step);
  }
  // Slides left over after the last activity step go to the last one that exists.
  if (carried && pending.length) {
    const last = pending[pending.length - 1]!;
    last.count = last.suggested = last.count + carried;
  }
  for (const step of steps) {
    const chosen = request.outline[step.role];
    if (chosen !== undefined) step.count = Math.min(step.max, Math.max(step.min, chosen));
  }
  return steps;
}

/** The teacher's own form, step for step; any step can be dropped by setting it to 0. */
function formOutline(request: LessonRequest): OutlineStep[] {
  return (request.form?.steps ?? []).map((s, i) => {
    const role = `${i + 1}. ${s.role}`;
    const chosen = request.outline[role];
    const max = Math.max(MAX_STEP_SLIDES, s.count);
    const count = chosen === undefined ? s.count : Math.min(max, Math.max(0, chosen));
    return { role, types: [s.type], count, suggested: s.count, min: 0, max, ...(s.note ? { note: s.note } : {}) };
  });
}

/**
 * The slide sequence for a request: the outline without the steps set to 0.
 * `insert`: the slides go into an existing lesson, so no cover or summary.
 */
export function resolvePlan(request: LessonRequest, insert = false): PlanStep[] {
  return planOutline(request, insert)
    .filter((s) => s.count > 0)
    .map(({ role, types, count, note }) => ({ role, types, count, ...(note ? { note } : {}) }));
}

export function planSlideCount(plan: PlanStep[]): number {
  return plan.reduce((n, s) => n + s.count, 0);
}

/** Splits the teacher's word list on commas, Chinese enumeration marks, semicolons and new lines. */
export function parseWordList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,，、;；\n]+/)
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  ];
}

const HAN = /\p{Script=Han}/u;

function collectStrings(value: unknown, out: string[]): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

/**
 * Things worth a second look in an AI lesson that still matches every schema:
 * required Chinese words that never appear, excluded ones that do, slide types
 * too hard for the age, and a lesson far longer or shorter than planned. They
 * never block the import.
 */
export function checkAgainstRequest(slides: Slide[], request: LessonRequest, registry: TemplateRegistry, insert = false): string[] {
  const warnings: string[] = [];
  const text = slides.flatMap((s) => collectStrings(s.content, [])).join("\n");
  const missing = parseWordList(request.words).filter((w) => HAN.test(w) && !text.includes(w));
  if (missing.length) warnings.push(`Thiếu từ bắt buộc: ${missing.join(", ")}.`);
  const unwanted = parseWordList(request.exclude).filter((w) => HAN.test(w) && text.includes(w));
  if (unwanted.length) warnings.push(`Có nội dung bạn muốn loại khỏi bài: ${unwanted.join(", ")}.`);

  const age = ageProfile(request.age);
  slides.forEach((s, i) => {
    if (age.avoid.includes(s.type)) {
      const label = registry.get(s.type)?.label ?? s.type;
      warnings.push(`Slide ${i + 1} (${label}): dạng này thường khó với ${age.label}.`);
    }
  });

  const planned = planSlideCount(resolvePlan(request, insert));
  if (Math.abs(slides.length - planned) > 2) {
    warnings.push(`Bài có ${slides.length} slide, dự kiến khoảng ${planned} slide.`);
  }
  return warnings;
}

import { AGE_PROFILES, ageProfile, type AgeBand } from "./ages";
import type { Slide } from "./schema";
import type { TemplateRegistry } from "./templateRegistry";

/**
 * Lesson blueprints: the app decides the order and kinds of slides for each
 * kind of lesson; the AI only writes the language content into them.
 */

export type LessonKind = "vocabulary" | "dialogue" | "grammar" | "review" | "mixed";
export type Duration = "short" | "medium" | "long";

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
  /** Activity slide types the teacher prefers; empty lets the AI choose. */
  activities: string[];
  notes: string;
  /**
   * Slides per outline step set by the teacher, by step role; steps not
   * listed keep the blueprint's count. Cleared when the kind, age, length or
   * activities change, since the steps and their counts change with them.
   */
  outline: Record<string, number>;
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
  activities: [],
  notes: "",
  outline: {},
};

/** Request fields that describe a way of teaching rather than one lesson's content; a preset keeps these. */
export const PRESET_FIELDS = ["age", "kind", "duration", "activities", "outline", "notes"] as const;
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
];

interface BlueprintStep {
  role: string;
  types: string[];
  /** Slides for a short, medium and long lesson; 0 leaves the step out. */
  count: [number, number, number];
  /** Practice or game step: narrowed to the activities the teacher picked. */
  activity?: boolean;
}

interface Blueprint {
  id: LessonKind;
  label: string;
  /** Told to the AI along with the steps. */
  description: string;
  steps: BlueprintStep[];
}

const TEACH_WORDS = ["vocabulary", "picture-card", "flashcard"];
const PRACTICE = ["quiz", "qa-list", "matching", "fill-blank", "sentence-order", "tone-pick", "sort-groups"];
const GAMES = ["whats-missing", "guess-picture", "box-pick", "lucky-wheel", "memory"];

const COVER: BlueprintStep = { role: "Mở đầu: tên bài", types: ["cover"], count: [1, 1, 1] };
const SUMMARY: BlueprintStep = { role: "Tổng kết: ý cần nhớ và từ vựng chính", types: ["summary"], count: [1, 1, 1] };

export const BLUEPRINTS: Blueprint[] = [
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
      { role: "Luyện tập", types: ["qa-list", "sentence-order", "fill-blank", "quiz", "matching"], count: [1, 2, 2], activity: true },
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
];

export interface PlanStep {
  role: string;
  types: string[];
  count: number;
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

const DURATION_INDEX: Record<Duration, 0 | 1 | 2> = { short: 0, medium: 1, long: 2 };

function blueprint(kind: LessonKind): Blueprint {
  return BLUEPRINTS.find((b) => b.id === kind) ?? BLUEPRINTS[0]!;
}

/** Steps of a blueprint with the types unsuitable for `age` removed; steps left empty drop out. */
function ageSteps(kind: LessonKind, age: AgeBand): (BlueprintStep & { required: boolean })[] {
  const avoid = new Set(ageProfile(age).avoid);
  return blueprint(kind).steps.map((s) => ({
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
  const kinds = lessonKindsFor(age);
  const kind = kinds.find((b) => b.id === r.kind)?.id ?? kinds[0]!.id;
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
    activities,
    notes: text(r.notes, 2000),
    outline,
  };
}

/**
 * Every step of the lesson, including optional ones left at 0, with the
 * teacher's counts applied. An activity step none of whose types the teacher
 * picked hands its slides to the next activity step that has some. Activity
 * and optional steps can go down to 0; the steps a lesson relies on keep 1.
 */
export function planOutline(request: LessonRequest): OutlineStep[] {
  const index = DURATION_INDEX[request.duration] ?? 1;
  const picked = new Set(request.activities);
  const steps: OutlineStep[] = [];
  let carried = 0;
  const pending: OutlineStep[] = [];
  for (const s of ageSteps(request.kind, request.age)) {
    let types = s.types;
    let count = s.count[index];
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

/** The slide sequence for a request: the outline without the steps set to 0. */
export function resolvePlan(request: LessonRequest): PlanStep[] {
  return planOutline(request)
    .filter((s) => s.count > 0)
    .map(({ role, types, count }) => ({ role, types, count }));
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
export function checkAgainstRequest(slides: Slide[], request: LessonRequest, registry: TemplateRegistry): string[] {
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

  const planned = planSlideCount(resolvePlan(request));
  if (Math.abs(slides.length - planned) > 2) {
    warnings.push(`Bài có ${slides.length} slide, dự kiến khoảng ${planned} slide.`);
  }
  return warnings;
}

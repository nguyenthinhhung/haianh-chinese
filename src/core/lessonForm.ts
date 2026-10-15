import type { LessonDocument } from "./schema";
import type { TemplateRegistry } from "./templateRegistry";

/**
 * A teacher's own lesson form: the order and kinds of slides she uses for
 * every unit of a course, taken from a lesson she built by hand. The AI fills
 * the same form with each new unit's content, so all lessons look alike and
 * she only adds what suits each class.
 */
export interface LessonForm {
  name: string;
  steps: FormStep[];
}

export interface FormStep {
  /** What this part of the lesson is, e.g. "课文 — Hội thoại: Bài khoá". */
  role: string;
  /** The slide type the part uses. */
  type: string;
  count: number;
  /** The teacher's note on that slide, passed on as guidance. */
  note?: string;
}

const MAX_FORM_STEPS = 40;
const MAX_STEP_COUNT = 6;
const MAX_ROLE = 120;
const MAX_NOTE = 200;

function headingOf(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const c = content as Record<string, unknown>;
  for (const key of ["heading", "title"]) {
    const v = c[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * The form of `doc`: one step per run of same-type slides within a part. A
 * cover slide opens a part and names the steps after it.
 */
export function formFromLesson(name: string, doc: LessonDocument, registry: TemplateRegistry): LessonForm {
  type Run = FormStep & { heading: string; part: string };
  const steps: Run[] = [];
  let part = "";
  let last: Run | null = null;
  doc.slides.forEach((slide, i) => {
    const heading = headingOf(slide.content);
    if (slide.type === "cover" && i > 0) part = heading;
    if (last && last.type === slide.type && last.part === part && slide.type !== "cover" && last.count < MAX_STEP_COUNT) {
      last.count += 1;
      // Several slides of a kind keep a heading only if they share it.
      if (last.heading !== heading) last.heading = "";
      return;
    }
    const note = slide.notes?.trim();
    last = { role: "", type: slide.type, count: 1, heading, part, ...(note ? { note: clip(note, MAX_NOTE) } : {}) };
    steps.push(last);
  });
  return {
    name: clip(name.trim(), 60),
    steps: steps.slice(0, MAX_FORM_STEPS).map((s) => {
      const label = registry.get(s.type)?.label ?? s.type;
      const what = s.type === "cover" ? (steps.indexOf(s) === 0 ? "Tên bài" : "Mở đầu phần") : label;
      // No colon: the outline shows a step's name up to the first one.
      const role = [s.part && s.type !== "cover" ? s.part : "", s.heading ? `${what} “${s.heading}”` : what].filter(Boolean).join(" — ");
      return { role: clip(role, MAX_ROLE), type: s.type, count: s.count, ...(s.note ? { note: s.note } : {}) };
    }),
  };
}

/**
 * A form read back from storage, or null when it is unusable. With a
 * registry, steps of slide types it does not know are dropped.
 */
export function normalizeForm(raw: unknown, registry?: TemplateRegistry): LessonForm | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { name?: unknown; steps?: unknown };
  if (typeof r.name !== "string" || !r.name.trim() || !Array.isArray(r.steps)) return null;
  const steps: FormStep[] = [];
  for (const s of r.steps.slice(0, MAX_FORM_STEPS)) {
    if (!s || typeof s !== "object") continue;
    const { role, type, count, note } = s as Record<string, unknown>;
    if (typeof role !== "string" || !role.trim() || typeof type !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(type)) continue;
    if (registry && !registry.get(type)) continue;
    if (!Number.isInteger(count) || (count as number) < 0) continue;
    steps.push({
      role: clip(role.trim(), MAX_ROLE),
      type,
      count: Math.min(MAX_STEP_COUNT, count as number),
      ...(typeof note === "string" && note.trim() ? { note: clip(note.trim(), MAX_NOTE) } : {}),
    });
  }
  return steps.length ? { name: clip(r.name.trim(), 60), steps } : null;
}

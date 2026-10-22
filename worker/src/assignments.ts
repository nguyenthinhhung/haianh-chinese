import { z } from "zod";
import {
  applyManualGrades,
  exerciseReview,
  gradeExercise,
  studentCopy,
  type Answers,
  type AnswerValue,
  type ExerciseGrade,
  type StudentExercise,
} from "../../src/core/exerciseGrade";
import { ExerciseSchema, type Exercise } from "../../src/core/exerciseSchema";

/**
 * Exercises handed out to students: the teacher's app puts one here, students
 * open its link, start, and hand in; the grading is the app's own code. The
 * right answers never leave this file except in the review after handing in,
 * and only when the exercise allows it.
 */

const EXERCISE_ID = /^e_[a-z0-9]{4,32}$/;
const SLUG = /^[a-z0-9]{12}$/;
const ATTEMPT_ID = /^t_[a-z0-9]{16}$/;
const CLIENT_ID = /^[a-z0-9]{8,40}$/;
const SEED = /^[a-z0-9]{1,40}$/;
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_ANSWERS_BYTES = 100 * 1024;

const AssetUrl = z.string().regex(/^\/f\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/);

/** What the app sends when handing an exercise out. */
export const AssignmentPayloadSchema = z.object({
  lessonTitle: z.string().max(200).default(""),
  theme: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).default("classic"),
  hanziFont: z.enum(["sans", "kai"]).default("sans"),
  exercise: ExerciseSchema,
  /** Published address of each picture and sound, by asset ID. */
  assetUrls: z.record(z.string().regex(/^a_[a-z0-9]{4,32}$/), AssetUrl).default({}),
});
export type AssignmentPayload = z.output<typeof AssignmentPayloadSchema>;

export interface AssignmentRow {
  id: string;
  slug: string;
  title: string;
  lesson_title: string;
  payload: string;
  version: number;
  closed: number;
  /** After this, no attempt starts; attempts under way may still hand in, marked late. */
  closes_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttemptRow {
  id: string;
  assignment_id: string;
  version: number;
  student_name: string;
  client_id: string;
  started_at: string;
  submitted_at: string | null;
  answers: string | null;
  grade: string | null;
  score: number | null;
  max_score: number | null;
  percent: number | null;
  late: number;
}

/** A hand-in this long after the time is up still counts as on time: the network and the student's device lag a little. */
const GRACE_MS = 2 * 60 * 1000;

/** Whether new attempts may start: not closed by the teacher, and before the deadline. */
export function isOpen(row: Pick<AssignmentRow, "closed" | "closes_at">, now = Date.now()): boolean {
  return !row.closed && !(row.closes_at && Date.parse(row.closes_at) <= now);
}

/**
 * When an attempt's time runs out, by the server's clock: its time limit from
 * the start, or the deadline, whichever comes first. A clock that starts with
 * the first answer runs in the student's browser, so only the deadline holds there.
 */
export function attemptDeadline(exercise: Exercise, row: Pick<AssignmentRow, "closes_at">, startedAt: string): number | null {
  const ends: number[] = [];
  const { timeLimit, timerStart } = exercise.settings;
  if (timeLimit > 0 && timerStart === "start") ends.push(Date.parse(startedAt) + timeLimit * 60_000);
  if (row.closes_at) ends.push(Date.parse(row.closes_at));
  return ends.length ? Math.min(...ends) : null;
}

/** A deadline typed on the results page (`2026-10-25T21:00`, Vietnam time) as ISO; null when unreadable. */
export function vietnamTimeToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const t = Date.parse(`${value}:00+07:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
function randomId(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** A student's name as shown to the teacher: one line, no outer spaces, at most 60 characters. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 60);
  return /\p{L}/u.test(name) ? name : null;
}

const ITEM_ID = /^[a-z]_[a-z0-9]{4,32}$/;

/** One answer in a shape some question can take, within size limits; undefined drops it. Each question checks its own shape when graded. */
function cleanValue(value: unknown): AnswerValue | undefined {
  if (typeof value === "boolean") return value;
  // Typed answers and writing.
  if (typeof value === "string") return value.length <= 2000 ? value : undefined;
  // Words in order.
  if (Array.isArray(value)) return value.length <= 30 && value.every((t) => typeof t === "string" && t.length <= 60) ? (value as string[]) : undefined;
  // Item → choice: matching, the word box, sorting.
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    const ok = entries.length <= 30 && entries.every(([k, v]) => ITEM_ID.test(k) && typeof v === "string" && ITEM_ID.test(v));
    return ok ? (Object.fromEntries(entries) as Record<string, string>) : undefined;
  }
  return undefined;
}

/** Answers keep only shapes a question can take; anything else is dropped, never stored. */
export function cleanAnswers(raw: unknown): Answers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Answers = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (++n > 500) return null;
    if (!/^q_[a-z0-9]{4,32}$/.test(key)) continue;
    const clean = cleanValue(value);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

/** Every picture and sound a student's copy shows, to send only their addresses. */
function usedAssets(copy: StudentExercise): Set<string> {
  const ids = new Set<string>();
  const add = (id: string | undefined) => id && ids.add(id);
  for (const part of copy.parts) {
    add(part.audio);
    add(part.image);
    for (const q of part.questions) {
      add(q.audio);
      add(q.image);
      for (const o of q.options ?? []) add(o.image);
    }
  }
  return ids;
}

export function readPayload(row: AssignmentRow): AssignmentPayload {
  return AssignmentPayloadSchema.parse(JSON.parse(row.payload));
}

/** The result a student sees: the grade unless the exercise hides it, and the review when the exercise allows it. */
export function resultBody(exercise: Exercise, grade: ExerciseGrade, answers: Answers, attemptId: string, late: boolean) {
  return {
    attemptId,
    answers,
    ...(exercise.settings.showAnswers === "hidden" ? {} : { grade }),
    late,
    ...(exercise.settings.showAnswers === "after-submit" ? { review: exerciseReview(exercise) } : {}),
  };
}

async function findBySlug(db: D1Database, slug: string): Promise<AssignmentRow | null> {
  if (!SLUG.test(slug)) return null;
  return db.prepare("SELECT * FROM assignments WHERE slug = ?").bind(slug).first<AssignmentRow>();
}

// Teacher ----------------------------------------------------------------------

/** Hands an exercise out, or updates one handed out before (same link, next version). */
export async function putAssignment(db: D1Database, id: string, request: Request): Promise<Response> {
  if (!EXERCISE_ID.test(id)) return json({ error: "bad-id" }, 400);
  const body = await request.text();
  if (body.length > MAX_PAYLOAD_BYTES) return json({ error: "too-large" }, 413);
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return json({ error: "bad-json" }, 400);
  }
  const parsed = AssignmentPayloadSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid", issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  const payload = parsed.data;
  if (payload.exercise.id !== id) return json({ error: "bad-id" }, 400);

  const now = new Date().toISOString();
  const title = payload.exercise.title.trim() || "Bài tập";
  const existing = await db.prepare("SELECT slug, version FROM assignments WHERE id = ?").bind(id).first<{ slug: string; version: number }>();
  if (existing) {
    await db
      .prepare("UPDATE assignments SET title = ?, lesson_title = ?, payload = ?, version = version + 1, updated_at = ? WHERE id = ?")
      .bind(title, payload.lessonTitle, JSON.stringify(payload), now, id)
      .run();
    return json({ ok: true, slug: existing.slug, version: existing.version + 1 });
  }
  const slug = randomId(12);
  await db
    .prepare("INSERT INTO assignments (id, slug, title, lesson_title, payload, version, closed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)")
    .bind(id, slug, title, payload.lessonTitle, JSON.stringify(payload), now, now)
    .run();
  return json({ ok: true, slug, version: 1 });
}

/**
 * The results page's controls: stop or resume taking hand-ins, set or clear
 * the deadline. False when the form makes no sense.
 */
export async function updateAssignment(db: D1Database, id: string, form: FormData): Promise<boolean> {
  if (!EXERCISE_ID.test(id)) return false;
  const action = form.get("action");
  if (action === "close" || action === "open") {
    await db.prepare("UPDATE assignments SET closed = ? WHERE id = ?").bind(action === "close" ? 1 : 0, id).run();
    return true;
  }
  if (action === "clear-deadline") {
    await db.prepare("UPDATE assignments SET closes_at = NULL WHERE id = ?").bind(id).run();
    return true;
  }
  if (action === "deadline") {
    const iso = vietnamTimeToIso(String(form.get("deadline") ?? ""));
    if (!iso) return false;
    await db.prepare("UPDATE assignments SET closes_at = ? WHERE id = ?").bind(iso, id).run();
    return true;
  }
  return false;
}

/** One attempt, with the assignment it belongs to. */
export async function attemptDetail(db: D1Database, id: string, attemptId: string): Promise<{ assignment: AssignmentRow; attempt: AttemptRow } | null> {
  if (!EXERCISE_ID.test(id) || !ATTEMPT_ID.test(attemptId)) return null;
  const assignment = await db.prepare("SELECT * FROM assignments WHERE id = ?").bind(id).first<AssignmentRow>();
  const attempt = assignment && (await db.prepare("SELECT * FROM attempts WHERE id = ? AND assignment_id = ?").bind(attemptId, id).first<AttemptRow>());
  return assignment && attempt?.submitted_at ? { assignment, attempt } : null;
}

/**
 * The teacher's points for written answers (`q_<id>` fields of the form),
 * applied to the grade kept for the attempt. Nothing else is graded again.
 */
export async function gradeByHand(db: D1Database, id: string, attemptId: string, form: FormData): Promise<boolean> {
  const found = await attemptDetail(db, id, attemptId);
  if (!found?.attempt.grade) return false;
  const manual: Record<string, number> = {};
  for (const [key, value] of form) {
    if (/^q_[a-z0-9]{4,32}$/.test(key) && typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) manual[key] = Number(value);
  }
  const { exercise } = readPayload(found.assignment);
  const grade = applyManualGrades(JSON.parse(found.attempt.grade) as ExerciseGrade, manual, exercise.settings.passPercent);
  await db
    .prepare("UPDATE attempts SET grade = ?, score = ?, max_score = ?, percent = ? WHERE id = ?")
    .bind(JSON.stringify(grade), grade.score, grade.max, grade.percent, attemptId)
    .run();
  return true;
}

export async function deleteAttempt(db: D1Database, id: string, attemptId: string): Promise<void> {
  if (!EXERCISE_ID.test(id) || !ATTEMPT_ID.test(attemptId)) return;
  await db.prepare("DELETE FROM attempts WHERE id = ? AND assignment_id = ?").bind(attemptId, id).run();
}

/** Everything kept on the server, as one JSON file the teacher can keep. */
export async function exportAll(db: D1Database): Promise<unknown> {
  const assignments = await db.prepare("SELECT * FROM assignments ORDER BY created_at").all<AssignmentRow>();
  const attempts = await db.prepare("SELECT * FROM attempts ORDER BY started_at").all<AttemptRow>();
  return {
    exportedAt: new Date().toISOString(),
    assignments: assignments.results.map((a) => ({ ...a, payload: JSON.parse(a.payload) as unknown })),
    attempts: attempts.results.map((t) => ({
      ...t,
      answers: t.answers ? (JSON.parse(t.answers) as unknown) : null,
      grade: t.grade ? (JSON.parse(t.grade) as unknown) : null,
    })),
  };
}

/** Takes an exercise off the web with every hand-in; `removed` is false when it was not there. */
export async function deleteAssignment(db: D1Database, id: string): Promise<Response> {
  if (!EXERCISE_ID.test(id)) return json({ error: "bad-id" }, 400);
  const [, assignment] = await db.batch([db.prepare("DELETE FROM attempts WHERE assignment_id = ?").bind(id), db.prepare("DELETE FROM assignments WHERE id = ?").bind(id)]);
  return json({ ok: true, removed: (assignment?.meta.changes ?? 0) > 0 });
}

export interface AssignmentSummary {
  id: string;
  slug: string;
  title: string;
  lesson_title: string;
  updated_at: string;
  closed: number;
  closes_at: string | null;
  /** Hand-ins with written answers still to grade. */
  to_grade: number;
  submitted: number;
  students: number;
  avg_percent: number | null;
  last_submitted: string | null;
}

export async function listAssignments(db: D1Database): Promise<AssignmentSummary[]> {
  const rows = await db
    .prepare(
      `SELECT a.id, a.slug, a.title, a.lesson_title, a.updated_at, a.closed, a.closes_at,
              COUNT(t.submitted_at) AS submitted,
              COUNT(CASE WHEN json_extract(t.grade, '$.pending') > 0 THEN 1 END) AS to_grade,
              COUNT(DISTINCT CASE WHEN t.submitted_at IS NOT NULL THEN t.client_id END) AS students,
              ROUND(AVG(t.percent)) AS avg_percent,
              MAX(t.submitted_at) AS last_submitted
         FROM assignments a LEFT JOIN attempts t ON t.assignment_id = a.id
        GROUP BY a.id
        ORDER BY COALESCE(MAX(t.submitted_at), a.updated_at) DESC`,
    )
    .all<AssignmentSummary>();
  return rows.results;
}

export async function assignmentResults(db: D1Database, id: string): Promise<{ assignment: AssignmentRow; attempts: AttemptRow[]; inProgress: number } | null> {
  if (!EXERCISE_ID.test(id)) return null;
  const assignment = await db.prepare("SELECT * FROM assignments WHERE id = ?").bind(id).first<AssignmentRow>();
  if (!assignment) return null;
  const attempts = await db
    .prepare("SELECT * FROM attempts WHERE assignment_id = ? AND submitted_at IS NOT NULL ORDER BY submitted_at DESC")
    .bind(id)
    .all<AttemptRow>();
  const open = await db
    .prepare("SELECT COUNT(*) AS n FROM attempts WHERE assignment_id = ? AND submitted_at IS NULL")
    .bind(id)
    .first<{ n: number }>();
  return { assignment, attempts: attempts.results, inProgress: open?.n ?? 0 };
}

// Students ---------------------------------------------------------------------

/** The student's copy: no answers, shuffled with `seed` (one per attempt, kept by the browser). */
export async function getStudentCopy(db: D1Database, slug: string, url: URL): Promise<Response> {
  const row = await findBySlug(db, slug);
  if (!row) return json({ error: "not-found" }, 404);
  // Sent even when closed: a student part-way through still needs it to hand in.
  const payload = readPayload(row);
  const seedParam = url.searchParams.get("seed") ?? "";
  const copy = studentCopy(payload.exercise, SEED.test(seedParam) ? seedParam : randomId(10));
  const used = usedAssets(copy);
  return json({
    title: row.title,
    lessonTitle: row.lesson_title,
    theme: payload.theme,
    hanziFont: payload.hanziFont,
    version: row.version,
    open: isOpen(row),
    closesAt: row.closes_at,
    exercise: copy,
    assetUrls: Object.fromEntries(Object.entries(payload.assetUrls).filter(([id]) => used.has(id))),
  });
}

async function readJson(request: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Registers an attempt: the student's name, and the time the clock starts on the server. */
export async function startAttempt(db: D1Database, slug: string, request: Request): Promise<Response> {
  const row = await findBySlug(db, slug);
  if (!row) return json({ error: "not-found" }, 404);
  if (!isOpen(row)) return json({ error: "closed" }, 410);
  const body = await readJson(request, 4096);
  const name = cleanName(body?.name);
  const clientId = typeof body?.clientId === "string" && CLIENT_ID.test(body.clientId) ? body.clientId : null;
  if (!name) return json({ error: "bad-name" }, 400);
  if (!clientId) return json({ error: "bad-client" }, 400);

  const { exercise } = readPayload(row);
  if (exercise.settings.attempts === "one") {
    const done = await db
      .prepare("SELECT id FROM attempts WHERE assignment_id = ? AND client_id = ? AND submitted_at IS NOT NULL LIMIT 1")
      .bind(row.id, clientId)
      .first<{ id: string }>();
    if (done) return json({ error: "already-submitted", attemptId: done.id }, 409);
  }
  const id = `t_${randomId(16)}`;
  const startedAt = new Date().toISOString();
  await db
    .prepare("INSERT INTO attempts (id, assignment_id, version, student_name, client_id, started_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, row.id, row.version, name, clientId, startedAt)
    .run();
  const deadline = attemptDeadline(exercise, row, startedAt);
  // The browser turns `deadline` into its own clock with `serverNow`, so a wrong clock on the device changes nothing.
  return json({ attemptId: id, startedAt, deadline: deadline === null ? null : new Date(deadline).toISOString(), serverNow: new Date().toISOString() });
}

/** Grades and keeps a hand-in. Handing in twice returns the first result, so a retry after a dropped connection is safe. */
export async function submitAttempt(db: D1Database, slug: string, request: Request): Promise<Response> {
  const row = await findBySlug(db, slug);
  if (!row) return json({ error: "not-found" }, 404);
  const body = await readJson(request, MAX_ANSWERS_BYTES);
  const attemptId = typeof body?.attemptId === "string" && ATTEMPT_ID.test(body.attemptId) ? body.attemptId : null;
  const answers = cleanAnswers(body?.answers);
  if (!attemptId || !answers) return json({ error: "bad-request" }, 400);

  const attempt = await db.prepare("SELECT * FROM attempts WHERE id = ? AND assignment_id = ?").bind(attemptId, row.id).first<AttemptRow>();
  if (!attempt) return json({ error: "no-attempt" }, 404);
  const { exercise } = readPayload(row);
  if (attempt.submitted_at && attempt.grade && attempt.answers) {
    return json(resultBody(exercise, JSON.parse(attempt.grade) as ExerciseGrade, JSON.parse(attempt.answers) as Answers, attempt.id, !!attempt.late));
  }

  // Late work is kept, never refused: the teacher decides what it counts for.
  const deadline = attemptDeadline(exercise, row, attempt.started_at);
  const late = deadline !== null && Date.now() > deadline + GRACE_MS;
  const grade = await handIn(db, row, attempt.id, answers, late);
  return json(resultBody(exercise, grade, answers, attempt.id, late));
}

/** Grades the answers with the exercise as it stands and keeps them; an attempt handed in already stays as it was. */
async function handIn(db: D1Database, row: AssignmentRow, attemptId: string, answers: Answers, late: boolean): Promise<ExerciseGrade> {
  const grade = gradeExercise(readPayload(row).exercise, answers);
  await db
    .prepare(
      "UPDATE attempts SET submitted_at = ?, answers = ?, grade = ?, score = ?, max_score = ?, percent = ?, version = ?, late = ? WHERE id = ? AND submitted_at IS NULL",
    )
    .bind(new Date().toISOString(), JSON.stringify(answers), JSON.stringify(grade), grade.score, grade.max, grade.percent, row.version, late ? 1 : 0, attemptId)
    .run();
  return grade;
}

export type SlipOutcome = { ok: true; attemptId: string } | { ok: false; error: "unreadable" | "other-exercise" | "handed-in" };

/**
 * An answer slip a student could not hand in, brought by the teacher: its
 * last line holds the attempt and the answers. Graded like any hand-in; not
 * marked late, since the teacher chose to take it.
 */
export async function handInSlip(db: D1Database, id: string, slip: string): Promise<SlipOutcome> {
  type SlipData = { attemptId?: unknown; answers?: unknown };
  let data: SlipData | null = null;
  for (const line of slip.split(/\r?\n/).reverse()) {
    try {
      const parsed: unknown = JSON.parse(line.trim());
      if (parsed && typeof parsed === "object" && "attemptId" in parsed) {
        data = parsed as SlipData;
        break;
      }
    } catch {
      // Not the data line.
    }
  }
  const attemptId = typeof data?.attemptId === "string" && ATTEMPT_ID.test(data.attemptId) ? data.attemptId : null;
  const answers = cleanAnswers(data?.answers);
  if (!EXERCISE_ID.test(id) || !attemptId || !answers) return { ok: false, error: "unreadable" };
  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").bind(id).first<AssignmentRow>();
  const attempt = row && (await db.prepare("SELECT * FROM attempts WHERE id = ? AND assignment_id = ?").bind(attemptId, id).first<AttemptRow>());
  if (!row || !attempt) return { ok: false, error: "other-exercise" };
  if (attempt.submitted_at) return { ok: false, error: "handed-in" };
  await handIn(db, row, attemptId, answers, false);
  return { ok: true, attemptId };
}

/** A student's own result again, e.g. after reloading the page. */
export async function getResult(db: D1Database, slug: string, attemptId: string): Promise<Response> {
  const row = await findBySlug(db, slug);
  if (!row || !ATTEMPT_ID.test(attemptId)) return json({ error: "not-found" }, 404);
  const attempt = await db.prepare("SELECT * FROM attempts WHERE id = ? AND assignment_id = ?").bind(attemptId, row.id).first<AttemptRow>();
  if (!attempt?.submitted_at || !attempt.grade || !attempt.answers) return json({ error: "not-submitted" }, 404);
  const { exercise } = readPayload(row);
  return json(resultBody(exercise, JSON.parse(attempt.grade) as ExerciseGrade, JSON.parse(attempt.answers) as Answers, attempt.id, !!attempt.late));
}

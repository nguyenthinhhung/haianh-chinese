import { z } from "zod";
import { exerciseReview, gradeExercise, studentCopy, type Answers, type ExerciseGrade, type StudentExercise } from "../../src/core/exerciseGrade";
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

/** Answers keep only the shape a question can take; anything else is dropped, never stored. */
export function cleanAnswers(raw: unknown): Answers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Answers = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (++n > 500) return null;
    if (!/^q_[a-z0-9]{4,32}$/.test(key)) continue;
    if (typeof value === "boolean" || (typeof value === "string" && /^o_[a-z0-9]{4,32}$/.test(value))) out[key] = value;
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

/** The result a student sees: always the grade, and the review when the exercise allows it. */
function resultBody(exercise: Exercise, grade: ExerciseGrade, answers: Answers, attemptId: string) {
  return {
    attemptId,
    answers,
    grade,
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

export async function deleteAssignment(db: D1Database, id: string): Promise<Response> {
  if (!EXERCISE_ID.test(id)) return json({ error: "bad-id" }, 400);
  await db.batch([db.prepare("DELETE FROM attempts WHERE assignment_id = ?").bind(id), db.prepare("DELETE FROM assignments WHERE id = ?").bind(id)]);
  return json({ ok: true });
}

export interface AssignmentSummary {
  id: string;
  slug: string;
  title: string;
  lesson_title: string;
  updated_at: string;
  submitted: number;
  students: number;
  avg_percent: number | null;
  last_submitted: string | null;
}

export async function listAssignments(db: D1Database): Promise<AssignmentSummary[]> {
  const rows = await db
    .prepare(
      `SELECT a.id, a.slug, a.title, a.lesson_title, a.updated_at,
              COUNT(t.submitted_at) AS submitted,
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
  if (row.closed) return json({ error: "closed", title: row.title }, 410);
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
  if (row.closed) return json({ error: "closed" }, 410);
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
  return json({ attemptId: id, startedAt });
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
    return json(resultBody(exercise, JSON.parse(attempt.grade) as ExerciseGrade, JSON.parse(attempt.answers) as Answers, attempt.id));
  }

  const grade = gradeExercise(exercise, answers);
  await db
    .prepare(
      "UPDATE attempts SET submitted_at = ?, answers = ?, grade = ?, score = ?, max_score = ?, percent = ?, version = ? WHERE id = ? AND submitted_at IS NULL",
    )
    .bind(new Date().toISOString(), JSON.stringify(answers), JSON.stringify(grade), grade.score, grade.max, grade.percent, row.version, attempt.id)
    .run();
  return json(resultBody(exercise, grade, answers, attempt.id));
}

/** A student's own result again, e.g. after reloading the page. */
export async function getResult(db: D1Database, slug: string, attemptId: string): Promise<Response> {
  const row = await findBySlug(db, slug);
  if (!row || !ATTEMPT_ID.test(attemptId)) return json({ error: "not-found" }, 404);
  const attempt = await db.prepare("SELECT * FROM attempts WHERE id = ? AND assignment_id = ?").bind(attemptId, row.id).first<AttemptRow>();
  if (!attempt?.submitted_at || !attempt.grade || !attempt.answers) return json({ error: "not-submitted" }, 404);
  const { exercise } = readPayload(row);
  return json(resultBody(exercise, JSON.parse(attempt.grade) as ExerciseGrade, JSON.parse(attempt.answers) as Answers, attempt.id));
}

import { QUESTION_KINDS } from "../../src/core/exercise";
import type { Answers, ExerciseGrade } from "../../src/core/exerciseGrade";
import type { Exercise, Question } from "../../src/core/exerciseSchema";
import { answerText, expectedText, questionLine } from "../../src/core/exerciseText";
import {
  assignmentResults,
  attemptDetail,
  deleteAssignment,
  deleteAttempt,
  exportAll,
  gradeByHand,
  isOpen,
  listAssignments,
  readPayload,
  updateAssignment,
  type AttemptRow,
} from "./assignments";
import { attemptPage, PAGE_CSP, resultsListPage, resultsPage, vietnamInputValue, type AttemptQuestion, type QuestionStat } from "./pages";

/** The teacher's results pages, under /results; signed in already. Null when the path is not one of them. */

const html = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": PAGE_CSP, "X-Robots-Tag": "noindex" } });
const redirect = (to: string) => new Response(null, { status: 303, headers: { Location: to } });
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

const download = (body: string, type: string, filename: string, fallback: string) =>
  new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });

const questionsOf = (exercise: Exercise): Question[] => exercise.parts.flatMap((p) => p.questions);
const gradeOf = (a: AttemptRow): ExerciseGrade | null => (a.grade ? (JSON.parse(a.grade) as ExerciseGrade) : null);

/** How each question of the exercise as it stands went, across every hand-in that had it. */
function questionStats(questions: Question[], grades: ExerciseGrade[]): QuestionStat[] {
  return questions.map((q, i) => {
    const stat: QuestionStat = { number: i + 1, kind: QUESTION_KINDS[q.type].label, line: questionLine(q), correct: 0, partial: 0, wrong: 0, blank: 0, pending: 0, percent: null };
    let earned = 0;
    let points = 0;
    for (const grade of grades) {
      const g = grade.questions.find((x) => x.id === q.id);
      if (!g) continue;
      stat[g.status] += 1;
      // Written answers not graded yet say nothing about the question.
      if (g.status !== "pending") {
        earned += g.earned;
        points += g.points;
      }
    }
    stat.percent = points ? Math.round((earned * 100) / points) : null;
    return stat;
  });
}

/**
 * A hand-in question by question, as it was graded. The exercise may have
 * changed since: its answers are read against the questions as they stand.
 */
function attemptQuestions(exercise: Exercise, grade: ExerciseGrade, answers: Answers): AttemptQuestion[] {
  const byId = new Map(questionsOf(exercise).map((q) => [q.id, q]));
  return grade.questions.map((g, i): AttemptQuestion => {
    const q = byId.get(g.id);
    return {
      id: g.id,
      number: i + 1,
      kind: q ? QUESTION_KINDS[q.type].label : "",
      line: q ? questionLine(q) : "",
      given: q ? answerText(q, answers[g.id]) : "",
      expected: q ? expectedText(q) : "",
      status: g.status,
      earned: g.earned,
      points: g.points,
      // Exactly the questions the teacher's points apply to.
      byHand: g.status === "pending" || !!g.manual,
      removed: !q,
    };
  });
}

/** Excel takes a cell starting with one of these for a formula; names are typed by students. */
const csvCell = (value: string | number) => {
  if (typeof value === "number") return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const vietnamTime = (iso: string) => vietnamInputValue(iso).replace("T", " ");

/** One row per hand-in, oldest first, with each question's points; BOM so Excel reads it as UTF-8. */
function resultsCsv(exercise: Exercise, attempts: AttemptRow[]): string {
  const questions = questionsOf(exercise);
  const { passPercent } = exercise.settings;
  const head = [
    "Học viên",
    "Lần nộp",
    "Điểm",
    "Tối đa",
    "%",
    ...(passPercent ? ["Kết quả"] : []),
    "Điểm chờ chấm",
    "Nộp trễ",
    "Bắt đầu",
    "Nộp lúc",
    "Thời gian làm (giây)",
    ...questions.map((_, i) => `Câu ${i + 1}`),
  ];
  const counts = new Map<string, number>();
  const rows = [...attempts]
    .sort((x, y) => x.submitted_at!.localeCompare(y.submitted_at!))
    .map((a) => {
      const grade = gradeOf(a);
      const byId = new Map(grade?.questions.map((g) => [g.id, g]));
      const nth = (counts.get(a.client_id) ?? 0) + 1;
      counts.set(a.client_id, nth);
      const percent = a.percent ?? 0;
      return [
        a.student_name,
        nth,
        a.score ?? 0,
        a.max_score ?? 0,
        percent,
        ...(passPercent ? [grade?.pending ? "Chờ chấm" : percent >= passPercent ? "Đạt" : "Chưa đạt"] : []),
        grade?.pending ?? 0,
        a.late ? "Có" : "",
        vietnamTime(a.started_at),
        vietnamTime(a.submitted_at!),
        Math.max(0, Math.round((Date.parse(a.submitted_at!) - Date.parse(a.started_at)) / 1000)),
        ...questions.map((q) => {
          const g = byId.get(q.id);
          return !g ? "" : g.status === "pending" ? "chờ chấm" : g.earned;
        }),
      ];
    });
  return `﻿${[head, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export async function handleResults(request: Request, db: D1Database, url: URL): Promise<Response | null> {
  const { pathname } = url;
  const method = request.method;

  if (pathname === "/results" && method === "GET") {
    const rows = await listAssignments(db);
    return html(
      resultsListPage(
        rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          lessonTitle: r.lesson_title,
          open: isOpen(r),
          closesAt: r.closes_at,
          toGrade: r.to_grade,
          submitted: r.submitted,
          students: r.students,
          avgPercent: r.avg_percent,
          lastSubmitted: r.last_submitted,
        })),
      ),
    );
  }

  if (pathname === "/results/export.json" && method === "GET") {
    const date = vietnamTime(new Date().toISOString()).slice(0, 10);
    const name = `lesson-studio-${date}.json`;
    return download(JSON.stringify(await exportAll(db), null, 1), "application/json; charset=utf-8", name, name);
  }

  const attempt = /^\/results\/([^/]+)\/attempts\/([^/]+?)(?:\/(grade|delete))?$/.exec(pathname);
  if (attempt) {
    const id = attempt[1]!;
    const attemptId = attempt[2]!;
    const what = attempt[3];
    if (what === "grade" && method === "POST") {
      return (await gradeByHand(db, id, attemptId, await request.formData())) ? redirect(`/results/${id}/attempts/${attemptId}`) : notFound();
    }
    if (what === "delete" && method === "POST") {
      await deleteAttempt(db, id, attemptId);
      return redirect(`/results/${id}`);
    }
    if (what || method !== "GET") return null;
    const found = await attemptDetail(db, id, attemptId);
    const grade = found && gradeOf(found.attempt);
    if (!found || !grade) return notFound();
    const { assignment, attempt: row } = found;
    const answers = row.answers ? (JSON.parse(row.answers) as Answers) : {};
    const { exercise } = readPayload(assignment);
    return html(
      attemptPage(
        {
          assignmentId: assignment.id,
          attemptId: row.id,
          title: assignment.title,
          name: row.student_name,
          score: grade.score,
          max: grade.max,
          percent: grade.percent,
          passPercent: exercise.settings.passPercent,
          startedAt: row.started_at,
          submittedAt: row.submitted_at!,
          late: !!row.late,
          pending: grade.pending ?? 0,
        },
        attemptQuestions(exercise, grade, answers),
      ),
    );
  }

  const action = /^\/results\/([^/]+)\/(settings|delete|csv)$/.exec(pathname);
  if (action) {
    const id = action[1]!;
    const what = action[2];
    if (what === "settings" && method === "POST") {
      await updateAssignment(db, id, await request.formData());
      return redirect(`/results/${id}`);
    }
    if (what === "delete" && method === "POST") {
      return (await deleteAssignment(db, id)).ok ? redirect("/results") : notFound();
    }
    if (what === "csv" && method === "GET") {
      const found = await assignmentResults(db, id);
      if (!found) return notFound();
      const { assignment } = found;
      const csv = resultsCsv(readPayload(assignment).exercise, found.attempts);
      return download(csv, "text/csv; charset=utf-8", `Bảng điểm - ${assignment.title}.csv`, `bang-diem-${assignment.slug}.csv`);
    }
    return null;
  }

  const detail = /^\/results\/([^/]+)$/.exec(pathname);
  if (detail && method === "GET") {
    const found = await assignmentResults(db, detail[1]!);
    if (!found) return notFound();
    const { assignment } = found;
    const { exercise } = readPayload(assignment);
    const graded = found.attempts.map((a) => ({ a, grade: gradeOf(a) }));
    return html(
      resultsPage(
        {
          origin: url.origin,
          id: assignment.id,
          slug: assignment.slug,
          title: assignment.title,
          lessonTitle: assignment.lesson_title,
          closed: !!assignment.closed,
          open: isOpen(assignment),
          closesAt: assignment.closes_at,
          timeLimit: exercise.settings.timeLimit,
          passPercent: exercise.settings.passPercent,
          inProgress: found.inProgress,
        },
        graded.map(({ a, grade }) => ({
          id: a.id,
          name: a.student_name,
          clientId: a.client_id,
          score: a.score ?? 0,
          max: a.max_score ?? 0,
          percent: a.percent ?? 0,
          startedAt: a.started_at,
          submittedAt: a.submitted_at!,
          late: !!a.late,
          pending: grade?.pending ?? 0,
        })),
        questionStats(
          questionsOf(exercise),
          graded.flatMap(({ grade }) => (grade ? [grade] : [])),
        ),
      ),
    );
  }

  return null;
}

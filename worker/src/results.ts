import { assignmentResults, isOpen, listAssignments, readPayload, updateAssignment } from "./assignments";
import { PAGE_CSP, resultsListPage, resultsPage } from "./pages";

/** The teacher's results pages, under /results; signed in already. Null when the path is not one of them. */

const html = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": PAGE_CSP, "X-Robots-Tag": "noindex" } });
const redirect = (to: string) => new Response(null, { status: 303, headers: { Location: to } });
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

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
          submitted: r.submitted,
          students: r.students,
          avgPercent: r.avg_percent,
          lastSubmitted: r.last_submitted,
        })),
      ),
    );
  }

  const settings = /^\/results\/([^/]+)\/settings$/.exec(pathname);
  if (settings && method === "POST") {
    await updateAssignment(db, settings[1]!, await request.formData());
    return redirect(`/results/${settings[1]}`);
  }

  const detail = /^\/results\/([^/]+)$/.exec(pathname);
  if (detail && method === "GET") {
    const found = await assignmentResults(db, detail[1]!);
    if (!found) return notFound();
    const { assignment } = found;
    const { settings: exerciseSettings } = readPayload(assignment).exercise;
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
          timeLimit: exerciseSettings.timeLimit,
          passPercent: exerciseSettings.passPercent,
          inProgress: found.inProgress,
        },
        found.attempts.map((a) => ({
          name: a.student_name,
          clientId: a.client_id,
          score: a.score ?? 0,
          max: a.max_score ?? 0,
          percent: a.percent ?? 0,
          startedAt: a.started_at,
          submittedAt: a.submitted_at!,
          late: !!a.late,
        })),
      ),
    );
  }

  return null;
}

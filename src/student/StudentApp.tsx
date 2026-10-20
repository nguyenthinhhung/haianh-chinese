import { useEffect, useMemo, useState } from "react";
import type { Answers, ExerciseGrade, ExerciseReview, StudentExercise } from "../core/exerciseGrade";
import { ExercisePlayer, type PlayerResult } from "../exercise/ExercisePlayer";
import baseCss from "../renderer/base.css?raw";
import { FONT_CSS } from "../renderer/fonts";
import { createThemeRegistry } from "../themes";

/**
 * The page a student opens from the teacher's link (/a/<link>): the same
 * player as the app's "Làm thử", with the student's name, the attempt
 * registered on the server, and the server grading what is handed in.
 */

interface Assignment {
  title: string;
  lessonTitle: string;
  theme: string;
  hanziFont: "sans" | "kai";
  version: number;
  exercise: StudentExercise;
  assetUrls: Record<string, string>;
}

/** The attempt in progress in this browser, and the shuffle it was given. */
interface Progress {
  attemptId: string;
  seed: string;
}

interface Finished {
  answers: Answers;
  result: PlayerResult;
}

interface ResultBody {
  attemptId?: string;
  answers?: Answers;
  grade?: ExerciseGrade;
  review?: ExerciseReview;
  error?: string;
}

const slug = location.pathname.split("/")[2] ?? "";
const keys = {
  client: "ls-client",
  name: "ls-name",
  progress: `ls-progress-${slug}`,
  done: `ls-done-${slug}`,
};

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be off (private windows); the exercise still works, a reload just starts over.
  }
}

const randomId = (length: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => "0123456789abcdefghijklmnopqrstuvwxyz"[b % 36]).join("");

/** A random ID kept by this browser, so students with the same name stay apart in the results. */
function clientId(): string {
  const saved = read<string>(keys.client);
  if (saved && /^[a-z0-9]{8,40}$/.test(saved)) return saved;
  const id = randomId(20);
  write(keys.client, id);
  return id;
}

async function api<T>(path: string, body?: unknown): Promise<{ status: number; data: T }> {
  let res: Response;
  try {
    res = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

const toResult = (body: ResultBody): PlayerResult => ({ grade: body.grade!, ...(body.review ? { review: body.review } : {}) });

const themes = createThemeRegistry();

export function StudentApp() {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [failure, setFailure] = useState<"not-found" | "closed" | "network" | null>(null);
  const [progress, setProgress] = useState<Progress | null>(() => read<Progress>(keys.progress));
  const [seed, setSeed] = useState(() => progress?.seed ?? randomId(10));
  const [finished, setFinished] = useState<Finished | null>(null);
  const [name, setName] = useState(() => read<string>(keys.name) ?? "");
  // Bumped to start another attempt with a fresh copy.
  const [round, setRound] = useState(0);

  async function showResult(attemptId: string): Promise<boolean> {
    const { status, data } = await api<ResultBody>(`/api/a/${slug}/result/${attemptId}`);
    if (status !== 200 || !data.grade || !data.answers) return false;
    setFinished({ answers: data.answers, result: toResult(data) });
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { status, data } = await api<Assignment>(`/api/a/${slug}?seed=${seed}`);
        if (cancelled) return;
        if (status === 404) return setFailure("not-found");
        if (status === 410) return setFailure("closed");
        if (status !== 200) return setFailure("network");
        document.title = data.title;
        // An exercise handed in once only: coming back shows that result instead of a new start.
        const done = read<string>(keys.done);
        if (!progress && done && data.exercise.settings.attempts === "one") await showResult(done);
        if (!cancelled) setAssignment(data);
      } catch {
        if (!cancelled) setFailure("network");
      }
    })();
    return () => {
      cancelled = true;
    };
    // A new round fetches a new copy; the rest only matters at the start.
  }, [round]);

  const css = useMemo(() => (assignment ? [FONT_CSS, baseCss, themes.resolve(assignment.theme).css].join("\n") : ""), [assignment]);

  if (failure) {
    return (
      <div className="st-message">
        {failure === "not-found" ? (
          <p>
            <strong>Không tìm thấy bài tập</strong>Kiểm tra lại đường link giáo viên gửi.
          </p>
        ) : failure === "closed" ? (
          <p>
            <strong>Bài tập đã đóng</strong>Giáo viên không nhận bài nộp cho bài này nữa.
          </p>
        ) : (
          <p>
            <strong>Chưa tải được bài tập</strong>Kiểm tra mạng rồi tải lại trang.
          </p>
        )}
      </div>
    );
  }
  if (!assignment) return <div className="st-message">Đang tải bài tập…</div>;

  async function start(): Promise<boolean> {
    const studentName = name.replace(/\s+/g, " ").trim();
    write(keys.name, studentName);
    const { status, data } = await api<{ attemptId?: string; error?: string }>(`/api/a/${slug}/start`, { name: studentName, clientId: clientId() });
    if (status === 409 && data.attemptId) {
      // Handed in before from this browser, and the exercise allows one attempt.
      write(keys.done, data.attemptId);
      if (await showResult(data.attemptId)) return false;
      throw new Error("Em đã nộp bài này rồi.");
    }
    if (status === 410) throw new Error("Bài tập này đã đóng.");
    if (status !== 200 || !data.attemptId) throw new Error(data.error === "bad-name" ? "Nhập họ và tên của em." : "Chưa bắt đầu được, thử lại sau ít phút.");
    const next = { attemptId: data.attemptId, seed };
    write(keys.progress, next);
    setProgress(next);
    return true;
  }

  async function submit(answers: Answers): Promise<PlayerResult> {
    if (!progress) throw new Error("Bài chưa được bắt đầu; tải lại trang.");
    const { status, data } = await api<ResultBody>(`/api/a/${slug}/submit`, { attemptId: progress.attemptId, answers });
    if (status !== 200 || !data.grade) {
      throw new Error(status === 404 ? "Không tìm thấy lượt làm bài này; tải lại trang rồi làm lại." : "Máy chủ chưa nhận được bài. Bấm Nộp bài lần nữa.");
    }
    write(keys.done, progress.attemptId);
    write(keys.progress, null);
    return toResult(data);
  }

  function restart() {
    write(keys.progress, null);
    setProgress(null);
    setFinished(null);
    setSeed(randomId(10));
    setAssignment(null);
    setRound((r) => r + 1);
  }

  const nameField = (
    <label className="st-name">
      Họ và tên
      <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} placeholder="Ví dụ: Nguyễn Minh An" />
      <small>Giáo viên xem điểm theo tên này.</small>
    </label>
  );

  return (
    <>
      <style>{css}</style>
      <ExercisePlayer
        key={`${round}-${finished ? "done" : "open"}`}
        exercise={assignment.exercise}
        assetUrl={(id) => assignment.assetUrls[id]}
        themeId={themes.resolve(assignment.theme).id}
        hanziFont={assignment.hanziFont}
        submit={submit}
        onRestart={restart}
        storageKey={progress ? `ls-answers-${progress.attemptId}` : undefined}
        startExtra={nameField}
        canStart={/\p{L}/u.test(name)}
        onStart={start}
        finished={finished ?? undefined}
      />
    </>
  );
}

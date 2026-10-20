import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Answers, AnswerValue, ExerciseGrade, ExerciseReview, StudentExercise } from "../core/exerciseGrade";
import { SKILL_LABELS, type Skill } from "../core/exerciseSchema";
import { ListensContext, listensLeft, PartHeader, QuestionCard, type AssetUrl, type Listens } from "./QuestionCard";

/**
 * A student doing an exercise: a start screen, the questions with an audio
 * bar, a clock and progress, then the result. The same component runs in
 * the app's "try it" and on the web, where `submit` sends the answers to the
 * server; nothing here knows which.
 */

export interface PlayerResult {
  grade: ExerciseGrade;
  /** Present when the exercise lets students see the answers. */
  review?: ExerciseReview;
  /** Handed in after the time was up (the server says so). */
  late?: boolean;
}

export interface ExercisePlayerProps {
  exercise: StudentExercise;
  assetUrl: AssetUrl;
  submit(answers: Answers): Promise<PlayerResult>;
  /** Theme of the lesson, so the exercise looks like the lesson it comes from. */
  themeId: string;
  hanziFont: "sans" | "kai";
  /** Starts again with a new copy (a fresh shuffle); without it, "Làm lại" only clears the answers. */
  onRestart?(): void;
  /** Keeps answers in the browser under this key, so a reload loses nothing. */
  storageKey?: string;
  /** More of the start screen, e.g. the student's name on the web. */
  startExtra?: ReactNode;
  /** False keeps "Bắt đầu" off, e.g. until a name is typed. */
  canStart?: boolean;
  /**
   * Runs before the questions show (the web registers the attempt). A
   * rejection stays on the start screen with its message; `false` stays
   * there quietly (the page has something else to show).
   */
  onStart?(): Promise<boolean | void>;
  /** An attempt handed in before, e.g. on reopening the page: the player opens on its result. */
  finished?: { answers: Answers; result: PlayerResult };
  /**
   * When time is up, set by the server and turned into this device's clock
   * (the web), so changing the device's clock gains nothing. Without it the
   * clock runs from the local start.
   */
  deadline?: number | null;
  /** More facts for the start screen, e.g. the deadline for handing in. */
  facts?: string[];
  /** Offered when handing in fails: keeps the answers in a file the student can send the teacher. */
  saveSlip?(answers: Answers): void;
}

type Phase = "intro" | "doing" | "result";

interface Saved {
  answers: Answers;
  flags: string[];
  startedAt: number | null;
  listens: Record<string, number>;
}

function load(key: string | undefined): Saved | null {
  if (!key) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as Saved | null;
    return raw && typeof raw.answers === "object" ? raw : null;
  } catch {
    return null;
  }
}

function save(key: string | undefined, data: Saved | null): void {
  if (!key) return;
  try {
    if (data) localStorage.setItem(key, JSON.stringify(data));
    else localStorage.removeItem(key);
  } catch {
    // Private windows may refuse storage; the exercise still works.
  }
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** The recording of the part being listened to, with seek, speed and the listening limit. */
function AudioBar({
  tracks,
  current,
  onPick,
  playRequest,
  assetUrl,
}: {
  tracks: { assetId: string; label: string }[];
  current: number;
  onPick(index: number): void;
  /** Bumped when a part's "Nghe" button asks for its track to play. */
  playRequest: number;
  assetUrl: AssetUrl;
}) {
  const listens = useContext(ListensContext);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const track = tracks[Math.min(current, tracks.length - 1)];
  const limited = listens.limit > 0;
  const left = track ? listensLeft(listens, track.assetId) : 0;

  const start = useCallback(() => {
    const audio = ref.current;
    if (!audio || !track) return;
    const fresh = audio.ended || audio.currentTime < 0.2;
    if (fresh && listensLeft(listens, track.assetId) <= 0) return;
    if (fresh) {
      audio.currentTime = 0;
      listens.count(track.assetId);
    }
    void audio.play();
  }, [listens, track]);

  useEffect(() => {
    if (playRequest) start();
    // Only a new request plays; `start` changes with every listen counted.
  }, [playRequest]);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate, current]);

  if (!track) return null;
  const toggle = () => (ref.current && !ref.current.paused ? ref.current.pause() : start());

  return (
    <div className="ex-audio">
      {tracks.length > 1 && (
        <select className="ex-track" value={current} onChange={(e) => onPick(Number(e.target.value))} aria-label="File nghe">
          {tracks.map((t, i) => (
            <option key={t.assetId + i} value={i}>
              {t.label}
            </option>
          ))}
        </select>
      )}
      {!limited && (
        <button type="button" className="ex-icon" onClick={() => ref.current && (ref.current.currentTime = Math.max(0, ref.current.currentTime - 5))} aria-label="Lùi 5 giây">
          ↺5
        </button>
      )}
      <button type="button" className="ex-play" onClick={toggle} disabled={!playing && left <= 0} aria-label={playing ? "Dừng" : "Phát"}>
        {playing ? "❚❚" : "▶"}
      </button>
      {limited ? (
        <span className="ex-listens">Còn {left} lần nghe</span>
      ) : (
        <input
          className="ex-seek"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={time}
          onChange={(e) => ref.current && (ref.current.currentTime = Number(e.target.value))}
          aria-label="Tua"
        />
      )}
      <span className="ex-time">
        {clock(time)} / {clock(duration)}
      </span>
      <select className="ex-rate" value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Tốc độ">
        {[0.75, 1, 1.25, 1.5].map((r) => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </select>
      <audio
        ref={ref}
        src={assetUrl(track.assetId)}
        preload="metadata"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          setTime(0);
          e.currentTarget.playbackRate = rate;
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}

export function ExercisePlayer(props: ExercisePlayerProps) {
  const { exercise, assetUrl, submit, themeId, hanziFont, onRestart, storageKey, startExtra, canStart = true, onStart, finished, deadline, facts, saveSlip } = props;
  const saved = useMemo(() => load(storageKey), [storageKey]);
  const [phase, setPhase] = useState<Phase>(finished ? "result" : saved?.startedAt ? "doing" : "intro");
  const [answers, setAnswers] = useState<Answers>(finished?.answers ?? saved?.answers ?? {});
  const [starting, setStarting] = useState(false);
  const [flags, setFlags] = useState<Set<string>>(new Set(saved?.flags));
  const [startedAt, setStartedAt] = useState<number | null>(saved?.startedAt ?? null);
  const [used, setUsed] = useState<Record<string, number>>(saved?.listens ?? {});
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<PlayerResult | null>(finished?.result ?? null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"submit" | "clear" | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [track, setTrack] = useState(0);
  const [playRequest, setPlayRequest] = useState(0);

  const { settings } = exercise;
  const questions = useMemo(() => exercise.parts.flatMap((p) => p.questions), [exercise]);
  const numbers = useMemo(() => new Map(questions.map((q, i) => [q.id, i + 1])), [questions]);
  const totalPoints = questions.reduce((n, q) => n + q.points, 0);
  const tracks = useMemo(
    () =>
      exercise.parts.flatMap((p, i) =>
        p.audio ? [{ assetId: p.audio, label: `Phần ${i + 1}${p.title ? ` · ${p.title}` : ` · ${SKILL_LABELS[p.skill]}`}` }] : [],
      ),
    [exercise],
  );
  const answered = questions.filter((q) => answers[q.id] !== undefined).length;

  const listens: Listens = useMemo(
    () => ({ limit: settings.maxListens, used, count: (id) => setUsed((u) => ({ ...u, [id]: (u[id] ?? 0) + 1 })) }),
    [settings.maxListens, used],
  );

  useEffect(() => {
    if (phase === "doing") save(storageKey, { answers, flags: [...flags], startedAt, listens: used });
  }, [phase, answers, flags, startedAt, used, storageKey]);

  const limit = settings.timeLimit * 60;
  const remaining = limit && deadline ? (deadline - now) / 1000 : limit && startedAt ? limit - (now - startedAt) / 1000 : null;

  const send = useCallback(async () => {
    setConfirm(null);
    setSending(true);
    setError(null);
    try {
      const r = await submit(answers);
      save(storageKey, null);
      setResult(r);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }, [answers, submit, storageKey]);

  // The clock: ticks every second while running, and hands in what is done when time is up.
  useEffect(() => {
    if (phase !== "doing" || !limit || !(startedAt || deadline)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase, limit, startedAt, deadline]);
  const expired = useRef(false);
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && phase === "doing" && !expired.current && !sending) {
      expired.current = true;
      void send();
    }
  }, [remaining, phase, sending, send]);

  async function begin() {
    if (onStart) {
      setStarting(true);
      setError(null);
      try {
        if ((await onStart()) === false) return;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      } finally {
        setStarting(false);
      }
    }
    setPhase("doing");
    if (settings.timerStart === "start") setStartedAt(Date.now());
    setNow(Date.now());
  }

  /** `undefined` takes the answer back (typing deleted, every card returned). */
  function answer(questionId: string, value: AnswerValue | undefined) {
    setAnswers((a) => {
      const next = { ...a };
      if (value === undefined) delete next[questionId];
      else next[questionId] = value;
      return next;
    });
    if (!startedAt) {
      setStartedAt(Date.now());
      setNow(Date.now());
    }
  }

  function clearAll() {
    setConfirm(null);
    setAnswers({});
    setFlags(new Set());
  }

  function restart() {
    save(storageKey, null);
    if (onRestart) return onRestart();
    setAnswers({});
    setFlags(new Set());
    setStartedAt(null);
    setUsed({});
    setResult(null);
    expired.current = false;
    setPhase("intro");
  }

  const jump = (questionId: string) => {
    setShowGrid(false);
    document.getElementById(`ex-q-${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Each screen starts at its top, inside whatever scrolls (the page, or the app's dialog).
  const rootId = `ex-${exercise.id}`;
  useEffect(() => {
    document.getElementById(rootId)?.scrollIntoView({ block: "start" });
  }, [phase, rootId]);

  const unanswered = questions.filter((q) => answers[q.id] === undefined);
  const deck = { id: rootId, className: "ls-deck ex-player", "data-theme": themeId, "data-hanzi-font": hanziFont };

  if (phase === "intro") {
    const skills = [...new Set(exercise.parts.map((p) => p.skill))];
    return (
      <div {...deck}>
        <main className="ex-main ex-intro">
          <div className="ex-cover">
            <p className="ex-kicker">Bài tập</p>
            <h1>{exercise.title || "Bài tập"}</h1>
            <ul className="ex-facts">
              <li>{questions.length} câu</li>
              <li>{totalPoints} điểm</li>
              <li>{settings.timeLimit ? `${settings.timeLimit} phút` : "Không giới hạn thời gian"}</li>
              {settings.maxListens > 0 && <li>Mỗi file nghe tối đa {settings.maxListens} lần</li>}
              {settings.attempts === "one" && <li>Chỉ nộp một lần</li>}
              {facts?.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="ex-skills">{skills.map((s) => SKILL_LABELS[s]).join(" · ")}</p>
          </div>
          {exercise.intro && <p className="ex-intro-text">{exercise.intro}</p>}
          {settings.timeLimit > 0 && settings.timerStart === "first-answer" && (
            <p className="ex-note">Đồng hồ bắt đầu chạy từ câu trả lời đầu tiên.</p>
          )}
          {startExtra}
          {error && (
            <p className="ex-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="ex-primary ex-start" onClick={() => void begin()} disabled={!questions.length || !canStart || starting}>
            {starting ? "Đang bắt đầu…" : "Bắt đầu làm bài"}
          </button>
        </main>
      </div>
    );
  }

  if (phase === "result" && result) {
    const { grade, review } = result;
    const graded = new Map(grade.questions.map((q) => [q.id, q]));
    const status = new Map(grade.questions.map((q) => [q.id, q.status]));
    const wrongCount = grade.questions.filter((q) => q.status !== "correct").length;
    return (
      <div {...deck}>
        <main className="ex-main ex-result">
          <div className={`ex-score${grade.passed === undefined ? "" : grade.passed ? " ex-score--pass" : " ex-score--fail"}`}>
            <p className="ex-kicker">{exercise.title}</p>
            <p className="ex-score-big">
              {grade.score}
              <span>/{grade.max} điểm</span>
            </p>
            <p className="ex-score-percent">
              {grade.percent}%{grade.passed !== undefined && ` · ${grade.passed ? "Đạt" : "Chưa đạt"} (cần ${settings.passPercent}%)`}
            </p>
            {result.late && <p className="ex-note">Bài được nộp sau giờ quy định.</p>}
            {grade.pending > 0 && <p className="ex-note">Còn {grade.pending} điểm phần tự luận chờ giáo viên chấm.</p>}
            <ul className="ex-skill-scores">
              {(Object.entries(grade.bySkill) as [Skill, { score: number; max: number }][]).map(([skill, s]) => (
                <li key={skill}>
                  <span>{SKILL_LABELS[skill]}</span>
                  <meter min={0} max={s.max || 1} value={s.score} />
                  <span>
                    {s.score}/{s.max}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {review ? (
            <>
              <div className="ex-filter" role="group" aria-label="Lọc câu">
                <button type="button" aria-pressed={!onlyWrong} onClick={() => setOnlyWrong(false)}>
                  Tất cả ({questions.length})
                </button>
                <button type="button" aria-pressed={onlyWrong} onClick={() => setOnlyWrong(true)}>
                  Câu sai và chưa làm ({wrongCount})
                </button>
              </div>
              {exercise.parts.map((part, p) => {
                const shown = part.questions.filter((q) => !onlyWrong || status.get(q.id) !== "correct");
                if (!shown.length) return null;
                return (
                  <div key={part.id}>
                    <PartHeader part={part} index={p} assetUrl={assetUrl} transcript={review.parts[part.id]?.transcript} />
                    {shown.map((q) => {
                      const r = review.questions[q.id];
                      return (
                        <QuestionCard
                          key={q.id}
                          question={q}
                          number={numbers.get(q.id)!}
                          assetUrl={assetUrl}
                          value={answers[q.id]}
                          expected={r?.expected}
                          status={status.get(q.id)}
                          earned={graded.get(q.id)?.earned}
                          explanation={r?.explanation}
                          transcript={r?.transcript}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </>
          ) : (
            <p className="ex-note">Giáo viên chỉ cho xem điểm của đề này.</p>
          )}
          <div className="ex-actions">
            {settings.attempts === "many" && (
              <button type="button" className="ex-primary" onClick={restart}>
                Làm lại từ đầu
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <ListensContext.Provider value={listens}>
      <div {...deck}>
        <header className="ex-top">
          <div className="ex-top-row">
            <strong className="ex-top-title">{exercise.title}</strong>
            {remaining !== null && (
              <span className={`ex-clock${remaining < 60 ? " ex-clock--low" : ""}`} role="timer" aria-label="Thời gian còn lại">
                ⏱ {clock(remaining)}
              </span>
            )}
            {remaining === null && limit > 0 && <span className="ex-clock">⏱ {settings.timeLimit}:00</span>}
            <button type="button" className="ex-progress" aria-expanded={showGrid} onClick={() => setShowGrid((v) => !v)}>
              Đã làm {answered}/{questions.length}
            </button>
          </div>
          {tracks.length > 0 && (
            <AudioBar tracks={tracks} current={track} onPick={setTrack} playRequest={playRequest} assetUrl={assetUrl} />
          )}
          {showGrid && (
            <nav className="ex-grid" aria-label="Các câu">
              {questions.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className={`ex-grid-cell${answers[q.id] !== undefined ? " ex-grid-cell--done" : ""}${flags.has(q.id) ? " ex-grid-cell--flag" : ""}`}
                  onClick={() => jump(q.id)}
                >
                  {numbers.get(q.id)}
                </button>
              ))}
            </nav>
          )}
        </header>
        <main className="ex-main">
          {exercise.parts.map((part, p) => (
            <div key={part.id}>
              <PartHeader
                part={part}
                index={p}
                assetUrl={assetUrl}
                onListen={(assetId) => {
                  const i = tracks.findIndex((t) => t.assetId === assetId);
                  if (i >= 0) setTrack(i);
                  setPlayRequest((n) => n + 1);
                }}
              />
              {part.questions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  number={numbers.get(q.id)!}
                  assetUrl={assetUrl}
                  value={answers[q.id]}
                  onAnswer={(v) => answer(q.id, v)}
                  flagged={flags.has(q.id)}
                  onFlag={() =>
                    setFlags((f) => {
                      const next = new Set(f);
                      if (!next.delete(q.id)) next.add(q.id);
                      return next;
                    })
                  }
                />
              ))}
            </div>
          ))}
        </main>
        <footer className="ex-bottom">
          {error && (
            <p className="ex-error" role="alert">
              Chưa nộp được: {error}
              {saveSlip && (
                <>
                  {" "}
                  Nếu vẫn không nộp được,{" "}
                  <button type="button" className="ex-slip" onClick={() => saveSlip(answers)}>
                    tải phiếu trả lời
                  </button>{" "}
                  rồi gửi cho giáo viên.
                </>
              )}
            </p>
          )}
          <div className="ex-bottom-row">
            <button type="button" className="ex-secondary" onClick={() => setConfirm("clear")} disabled={!answered || sending}>
              Xoá hết đáp án
            </button>
            <button type="button" className="ex-primary" onClick={() => (unanswered.length ? setConfirm("submit") : void send())} disabled={sending}>
              {sending ? "Đang nộp…" : "Nộp bài"}
            </button>
          </div>
        </footer>
        {confirm && (
          <div className="ex-confirm-backdrop" onClick={() => setConfirm(null)}>
            <div className="ex-confirm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              {confirm === "submit" ? (
                <>
                  <p>
                    Còn {unanswered.length} câu chưa làm: {unanswered.slice(0, 12).map((q) => numbers.get(q.id)).join(", ")}
                    {unanswered.length > 12 ? "…" : ""}. Vẫn nộp bài?
                  </p>
                  <div className="ex-bottom-row">
                    <button type="button" className="ex-secondary" onClick={() => (setConfirm(null), jump(unanswered[0]!.id))}>
                      Làm tiếp
                    </button>
                    <button type="button" className="ex-primary" onClick={() => void send()}>
                      Nộp bài
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>Xoá hết đáp án đã chọn để làm lại từ đầu?</p>
                  <div className="ex-bottom-row">
                    <button type="button" className="ex-secondary" onClick={() => setConfirm(null)}>
                      Thôi
                    </button>
                    <button type="button" className="ex-primary" onClick={clearAll}>
                      Xoá hết
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </ListensContext.Provider>
  );
}

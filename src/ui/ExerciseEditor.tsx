import { useEffect, useMemo, useState } from "react";
import { exerciseAudioJobs, type AudioJob } from "../core/autoAudio";
import {
  addExercise,
  addPart,
  addQuestion,
  duplicateExercise,
  duplicateQuestion,
  EXERCISE_EDITOR,
  findQuestion,
  moveQuestion,
  movePart,
  PART_EDITOR,
  QUESTION_KINDS,
  QUESTION_TYPES,
  questionCount,
  questionNumbers,
  removeExercise,
  removePart,
  removeQuestion,
  setExerciseField,
  SETTINGS_EDITOR,
} from "../core/exercise";
import { exerciseIssues, type ExerciseIssue } from "../core/exerciseCheck";
import { exerciseReview, expectedAnswer, gradeExercise, studentCopy, studentPart, studentQuestion } from "../core/exerciseGrade";
import { SKILL_LABELS, type Exercise, type QuestionType } from "../core/exerciseSchema";
import type { RenderEnv } from "../renderer/render";
import { ExercisePlayer } from "../exercise/ExercisePlayer";
import { PartHeader, QuestionCard, type AssetUrl } from "../exercise/QuestionCard";
import { AssignDialog } from "./AssignDialog";
import { ExerciseImportDialog } from "./ExerciseImportDialog";
import { addMessage, FormFields, type FormTarget, type Messages } from "./FormFields";
import { useServices } from "./services";
import type { LessonSession } from "./useLessonSession";

/**
 * The lesson editor's "Bài tập" mode: the lesson's exercises on the left,
 * the selected one as students will see it in the middle, and the form for
 * the selected part of it on the right.
 */

type Node = { kind: "exercise" } | { kind: "part"; id: string } | { kind: "question"; id: string };

interface Props {
  session: LessonSession;
  env: RenderEnv;
  onNotice(text: string): void;
  /** Queues recordings to make in the background; how many were new. */
  onReadAloud(jobs: AudioJob[]): number;
}

const worst = (issues: ExerciseIssue[]) => (issues.some((i) => i.level === "error") ? "error" : issues.length ? "warning" : undefined);

function snippet(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 28 ? `${line.slice(0, 27)}…` : line;
}

/** Full-screen "try it": the student's player on a fresh shuffle, graded on this computer, nothing kept. */
function TryDialog({ exercise, assetUrl, themeId, hanziFont, onClose }: { exercise: Exercise; assetUrl: AssetUrl; themeId: string; hanziFont: "sans" | "kai"; onClose(): void }) {
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2));
  const copy = useMemo(() => studentCopy(exercise, seed), [exercise, seed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="ex-try" role="dialog" aria-modal="true" aria-label={`Làm thử: ${exercise.title}`}>
      <div className="ex-try-bar">
        <span>
          <strong>Làm thử</strong> — làm như học viên; kết quả không được lưu.
        </span>
        <button type="button" onClick={onClose}>
          Đóng (Esc)
        </button>
      </div>
      <div className="ex-try-body">
        <ExercisePlayer
          key={seed}
          exercise={copy}
          assetUrl={assetUrl}
          themeId={themeId}
          hanziFont={hanziFont}
          submit={async (answers) => ({
            grade: gradeExercise(exercise, answers),
            ...(exercise.settings.showAnswers === "after-submit" ? { review: exerciseReview(exercise) } : {}),
          })}
          onRestart={() => setSeed(Math.random().toString(36).slice(2))}
        />
      </div>
    </div>
  );
}

export function ExerciseEditor({ session, env, onNotice, onReadAloud }: Props) {
  const { persistence } = useServices();
  const doc = session.doc;
  const [exerciseId, setExerciseId] = useState(doc.exercises[0]?.id);
  const exercise = doc.exercises.find((e) => e.id === exerciseId) ?? doc.exercises[0];
  const [node, setNode] = useState<Node>({ kind: "exercise" });
  const [adding, setAdding] = useState(false);
  const [trying, setTrying] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [importing, setImporting] = useState(false);

  const assets = useMemo(() => new Map(doc.assets.map((a) => [a.id, a])), [doc.assets]);
  const assetUrl: AssetUrl = (id) => {
    const a = assets.get(id);
    return a ? persistence.assetUrl(session.dir, a.file) : undefined;
  };
  const issues = useMemo(() => (exercise ? exerciseIssues(exercise) : []), [exercise]);
  const numbers = useMemo(() => (exercise ? questionNumbers(exercise) : new Map<string, number>()), [exercise]);
  const messages = useMemo(() => {
    const map: Messages = new Map();
    for (const i of issues) addMessage(map, i.path, i.level, i.message);
    return map;
  }, [issues]);
  const errors = issues.filter((i) => i.level === "error").length;

  // A selection that no longer exists (deleted, or undone) falls back to the exercise.
  const selected = useMemo((): Node => {
    if (!exercise) return { kind: "exercise" };
    if (node.kind === "part" && exercise.parts.some((p) => p.id === node.id)) return node;
    if (node.kind === "question" && findQuestion(exercise, node.id)) return node;
    return { kind: "exercise" };
  }, [exercise, node]);

  useEffect(() => {
    if (selected.kind === "exercise") return;
    const el = document.getElementById(selected.kind === "part" ? `ex-p-${selected.id}` : `ex-q-${selected.id}`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  function createExercise() {
    let id = "";
    session.update((d) => {
      const r = addExercise(d);
      id = r.exerciseId;
      return r.doc;
    });
    setExerciseId(id);
    setNode({ kind: "exercise" });
  }

  function importExercise(imported: Exercise) {
    session.update((d) => addExercise(d, imported).doc);
    setExerciseId(imported.id);
    setNode({ kind: "exercise" });
    const reading = onReadAloud(exerciseAudioJobs(imported));
    onNotice(`Đã thêm đề “${imported.title}” (Ctrl+Z để bỏ).${reading ? ` Đang tạo giọng đọc cho ${reading} đoạn nghe.` : ""}`);
  }

  const importDialog = importing && <ExerciseImportDialog pinyin={doc.settings.pinyin} onImport={importExercise} onClose={() => setImporting(false)} />;
  const listening = useMemo(() => (exercise ? exerciseAudioJobs(exercise) : []), [exercise]);

  if (!exercise) {
    return (
      <>
        <nav className="navigator exercise-nav" aria-label="Danh sách đề">
          <div className="exercise-empty">
            <p>Bài này chưa có đề bài tập nào.</p>
            <button type="button" className="primary" onClick={createExercise}>
              + Tạo đề bài tập
            </button>
            <button type="button" onClick={() => setImporting(true)}>
              Nhập đề từ AI…
            </button>
          </div>
        </nav>
        <main className="workspace exercise-workspace">
          <div className="exercise-intro">
            <h2>Bài tập cho học viên</h2>
            <p>
              Đề bài tập để học viên tự làm và được chấm điểm tự động: trắc nghiệm, đúng/sai, điền chỗ trống, nối cặp, sắp xếp câu, thanh
              điệu, phân nhóm, tự luận…, kèm file nghe, ảnh và đoạn văn. Đề nằm trong bài học này, dùng chung ảnh và âm thanh của bài. Có thể
              nhờ AI chép bài tập từ giáo trình rồi nhập vào.
            </p>
            <button type="button" className="primary" onClick={createExercise}>
              + Tạo đề bài tập
            </button>
          </div>
        </main>
        <aside className="properties" aria-label="Thuộc tính" />
        {importDialog}
      </>
    );
  }

  const exId = exercise.id;
  const target: FormTarget = { id: exId, content: exercise, set: (d, path, value) => setExerciseField(d, exId, path, value) };
  const update = (command: Parameters<LessonSession["update"]>[0]) => session.update(command);

  const questionAt = selected.kind === "question" ? findQuestion(exercise, selected.id) : undefined;
  const partIndex =
    selected.kind === "part" ? exercise.parts.findIndex((p) => p.id === selected.id) : questionAt ? questionAt.partIndex : exercise.parts.length - 1;

  function add(type: QuestionType) {
    setAdding(false);
    let partId = exercise!.parts[partIndex]?.id;
    let questionId = "";
    session.update((d) => {
      let next = d;
      if (!partId) {
        const r = addPart(next, exId);
        partId = r.partId;
        next = r.doc;
      }
      const r = addQuestion(next, exId, partId, type, questionAt?.part.id === partId ? questionAt.question.id : undefined);
      questionId = r.questionId;
      return r.doc;
    });
    setNode({ kind: "question", id: questionId });
  }

  function addPartHere() {
    let partId = "";
    session.update((d) => {
      const r = addPart(d, exId, exercise!.parts[partIndex]?.id);
      partId = r.partId;
      return r.doc;
    });
    setNode({ kind: "part", id: partId });
  }

  const issuesOf = (questionId: string) => issues.filter((i) => i.questionId === questionId);

  return (
    <>
      <nav className="navigator exercise-nav" aria-label="Danh sách đề">
        {doc.exercises.length > 1 && (
          <div className="exercise-list">
            {doc.exercises.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`exercise-item${e.id === exId ? " selected" : ""}`}
                onClick={() => {
                  setExerciseId(e.id);
                  setNode({ kind: "exercise" });
                }}
              >
                <span>{e.title || "(chưa đặt tên)"}</span>
                <span className="muted">{questionCount(e)} câu</span>
              </button>
            ))}
          </div>
        )}
        <ol className="outline">
          <li>
            <button type="button" className={`outline-item outline-exercise${selected.kind === "exercise" ? " selected" : ""}`} onClick={() => setNode({ kind: "exercise" })}>
              <strong>{exercise.title || "(chưa đặt tên)"}</strong>
              <span className="muted">Cài đặt đề · {questionCount(exercise)} câu</span>
            </button>
          </li>
          {exercise.parts.map((part, p) => {
            const partProblem = worst(issues.filter((i) => i.partId === part.id && !i.questionId));
            return (
              <li key={part.id}>
                <button
                  type="button"
                  className={`outline-item outline-part${selected.kind === "part" && selected.id === part.id ? " selected" : ""}`}
                  onClick={() => setNode({ kind: "part", id: part.id })}
                >
                  <span>
                    Phần {p + 1} · {SKILL_LABELS[part.skill]}
                    {part.title ? ` · ${snippet(part.title)}` : ""}
                  </span>
                  {partProblem && <span className={`outline-dot outline-dot--${partProblem}`} aria-label={partProblem === "error" ? "Cần sửa" : "Nên xem lại"} />}
                </button>
                <ol>
                  {part.questions.map((q) => {
                    const problem = worst(issuesOf(q.id));
                    return (
                      <li key={q.id}>
                        <button
                          type="button"
                          className={`outline-item outline-question${selected.kind === "question" && selected.id === q.id ? " selected" : ""}`}
                          onClick={() => setNode({ kind: "question", id: q.id })}
                        >
                          <span>
                            Câu {numbers.get(q.id)} · {snippet(q.prompt) || QUESTION_KINDS[q.type].label}
                          </span>
                          {problem && <span className={`outline-dot outline-dot--${problem}`} aria-label={problem === "error" ? "Cần sửa" : "Nên xem lại"} />}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </li>
            );
          })}
        </ol>
        <div className="navigator-actions">
          <div className="add-menu">
            <button type="button" className="primary" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
              + Câu hỏi
            </button>
            {adding && (
              <>
                <div className="slide-picker-backdrop" onClick={() => setAdding(false)} />
                <ul className="question-picker" role="menu">
                  {QUESTION_TYPES.map((type) => (
                    <li key={type}>
                      <button type="button" role="menuitem" onClick={() => add(type)}>
                        <span className="menu-item-label">{QUESTION_KINDS[type].label}</span>
                        <span className="menu-item-desc">{QUESTION_KINDS[type].description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="icon-row icon-row--two">
            <button type="button" onClick={addPartHere} title="Thêm một phần mới (ví dụ phần nghe 2, phần đọc)">
              + Phần
            </button>
            <button type="button" onClick={createExercise} title="Thêm một đề khác trong bài này">
              + Đề mới
            </button>
          </div>
          <button type="button" onClick={() => setImporting(true)} title="Nhờ AI chép bài tập từ giáo trình hoặc soạn đề mới, rồi dán vào đây">
            Nhập đề từ AI…
          </button>
        </div>
      </nav>

      <main className="workspace exercise-workspace">
        <div className="exercise-head">
          <span className={`exercise-status${errors ? " exercise-status--error" : ""}`}>
            {errors ? `${errors} chỗ cần sửa trước khi giao bài` : issues.length ? `Sẵn sàng · ${issues.length} chỗ nên xem lại` : "✓ Sẵn sàng giao bài"}
          </span>
          <div className="exercise-head-actions">
            {listening.length > 0 && persistence.kind === "tauri" && (
              <button
                type="button"
                onClick={() => {
                  if (!onReadAloud(listening)) onNotice("Đang tạo giọng đọc cho các đoạn nghe này rồi.");
                }}
                title="Đọc lời bài nghe thành file nghe cho phần nghe và câu nghe chưa có file (giọng Google Dịch)"
              >
                🔊 Tạo file nghe ({listening.length})
              </button>
            )}
            {persistence.kind === "tauri" && (
              <button
                type="button"
                onClick={() => setAssigning(true)}
                disabled={!questionCount(exercise)}
                title="Gửi link cho học viên làm bài; máy chủ chấm điểm và lưu vào bảng điểm"
              >
                Giao bài…
              </button>
            )}
            <button type="button" className="primary" onClick={() => setTrying(true)} disabled={!questionCount(exercise)}>
              ▶ Làm thử
            </button>
          </div>
        </div>
        <div className="exercise-preview">
          <div
            className="ls-deck ex-player ex-player--author"
            data-theme={env.themes.resolve(doc.theme.id).id}
            data-hanzi-font={doc.settings.hanziFont}
          >
            <div className="ex-main">
              {exercise.parts.map((part, p) => (
                <div key={part.id}>
                  <PartHeader
                    part={studentPart(part, [])}
                    index={p}
                    assetUrl={assetUrl}
                    transcript={part.transcript || undefined}
                    selected={selected.kind === "part" && selected.id === part.id}
                    onSelect={() => setNode({ kind: "part", id: part.id })}
                  />
                  {part.questions.map((q) => (
                    <QuestionCard
                      key={q.id}
                      question={studentQuestion(q, exercise.settings.pinyin)}
                      number={numbers.get(q.id)!}
                      assetUrl={assetUrl}
                      expected={expectedAnswer(q)}
                      explanation={q.explanation || undefined}
                      transcript={q.transcript || undefined}
                      selected={selected.kind === "question" && selected.id === q.id}
                      onSelect={() => setNode({ kind: "question", id: q.id })}
                      problem={worst(issuesOf(q.id))}
                    />
                  ))}
                  {!part.questions.length && <p className="exercise-part-empty">Phần này chưa có câu hỏi. Bấm “+ Câu hỏi” ở cột trái.</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <aside className="properties" aria-label="Thuộc tính">
        <div className="props-body">
          {selected.kind === "exercise" && (
            <div className="props-section">
              <h3>Đề bài tập</h3>
              <div className="node-actions">
                <button
                  type="button"
                  onClick={() => {
                    let id = "";
                    update((d) => {
                      const r = duplicateExercise(d, exId);
                      id = r.exerciseId;
                      return r.doc;
                    });
                    setExerciseId(id);
                  }}
                >
                  Nhân bản đề
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    update((d) => removeExercise(d, exId));
                    setExerciseId(undefined);
                    onNotice(`Đã xoá đề “${exercise.title || "chưa đặt tên"}”. Bấm Ctrl+Z để lấy lại.`);
                  }}
                >
                  Xoá đề
                </button>
              </div>
              <FormFields fields={EXERCISE_EDITOR} target={target} session={session} messages={messages} />
              <h4 className="props-subhead">Cách làm bài</h4>
              <FormFields fields={SETTINGS_EDITOR} base={["settings"]} target={target} session={session} messages={messages} />
              {issues.length > 0 && (
                <>
                  <h4 className="props-subhead">Kiểm tra đề</h4>
                  <ul className="issue-list">
                    {issues.map((i, k) => (
                      <li key={k}>
                        <button
                          type="button"
                          className={i.level === "error" ? "field-error" : "field-warning"}
                          onClick={() => setNode(i.questionId ? { kind: "question", id: i.questionId } : i.partId ? { kind: "part", id: i.partId } : { kind: "exercise" })}
                        >
                          {i.questionId ? `Câu ${numbers.get(i.questionId)}: ` : i.partId ? `Phần ${exercise.parts.findIndex((p) => p.id === i.partId) + 1}: ` : ""}
                          {i.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {selected.kind === "part" && partIndex >= 0 && (
            <div className="props-section">
              <h3>Phần {partIndex + 1}</h3>
              <div className="node-actions">
                <button type="button" title="Lên" disabled={partIndex === 0} onClick={() => update((d) => movePart(d, exId, selected.id, partIndex - 1))}>
                  ↑
                </button>
                <button
                  type="button"
                  title="Xuống"
                  disabled={partIndex === exercise.parts.length - 1}
                  onClick={() => update((d) => movePart(d, exId, selected.id, partIndex + 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    update((d) => removePart(d, exId, selected.id));
                    onNotice(`Đã xoá phần ${partIndex + 1}. Bấm Ctrl+Z để lấy lại.`);
                  }}
                >
                  Xoá phần
                </button>
              </div>
              <FormFields fields={PART_EDITOR} base={["parts", partIndex]} target={target} session={session} messages={messages} />
            </div>
          )}

          {selected.kind === "question" && questionAt && (
            <div className="props-section">
              <h3>
                Câu {numbers.get(questionAt.question.id)} · {QUESTION_KINDS[questionAt.question.type].label}
              </h3>
              <div className="node-actions">
                <button type="button" title="Lên" onClick={() => update((d) => moveQuestion(d, exId, selected.id, -1))}>
                  ↑
                </button>
                <button type="button" title="Xuống" onClick={() => update((d) => moveQuestion(d, exId, selected.id, 1))}>
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    let id = "";
                    update((d) => {
                      const r = duplicateQuestion(d, exId, selected.id);
                      id = r.questionId;
                      return r.doc;
                    });
                    setNode({ kind: "question", id });
                  }}
                >
                  Nhân bản
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    update((d) => removeQuestion(d, exId, selected.id));
                    onNotice(`Đã xoá câu ${numbers.get(selected.id)}. Bấm Ctrl+Z để lấy lại.`);
                  }}
                >
                  Xoá
                </button>
              </div>
              <FormFields
                key={questionAt.question.id}
                fields={QUESTION_KINDS[questionAt.question.type].editor}
                base={["parts", questionAt.partIndex, "questions", questionAt.index]}
                target={target}
                session={session}
                messages={messages}
              />
            </div>
          )}
        </div>
      </aside>

      {importDialog}
      {assigning && <AssignDialog dir={session.dir} doc={doc} exercise={exercise} onClose={() => setAssigning(false)} />}
      {trying && (
        <TryDialog
          exercise={exercise}
          assetUrl={assetUrl}
          themeId={env.themes.resolve(doc.theme.id).id}
          hanziFont={doc.settings.hanziFont}
          onClose={() => setTrying(false)}
        />
      )}
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { AGE_PROFILES } from "../core/ages";
import { QUESTION_KINDS, QUESTION_TYPES, questionCount } from "../core/exercise";
import { buildExercisePrompt, normalizeExerciseRequest, parseAiExercise, type ExerciseRequest } from "../core/exerciseImport";
import { SKILL_LABELS, type Exercise } from "../core/exerciseSchema";
import { CopyButton, fixRequest } from "./AiImportDialog";

interface Props {
  /** Whether new exercises show pinyin, as the lesson does. */
  pinyin: boolean;
  onImport(exercise: Exercise): void;
  onClose(): void;
}

// The teacher's last choices, so the next exercise for the same class starts from them.
const REQUEST_KEY = "ls.aiExerciseRequest";

function loadRequest(): ExerciseRequest {
  try {
    return normalizeExerciseRequest(JSON.parse(localStorage.getItem(REQUEST_KEY) ?? "null"));
  } catch {
    return normalizeExerciseRequest(null);
  }
}

/** An exercise written by an AI chat tool, usually copied from the textbook's pages. */
export function ExerciseImportDialog({ pinyin, onImport, onClose }: Props) {
  const [request, setRequest] = useState(loadRequest);
  const [text, setText] = useState("");
  const result = useMemo(() => (text.trim() ? parseAiExercise(text, pinyin) : null), [text, pinyin]);
  const change = (patch: Partial<ExerciseRequest>) => setRequest((r) => normalizeExerciseRequest({ ...r, ...patch }));
  const ready = !!(request.source.trim() || request.topic.trim());

  useEffect(() => {
    try {
      localStorage.setItem(REQUEST_KEY, JSON.stringify(request));
    } catch {
      // Not remembering the choices is harmless.
    }
  }, [request]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog ai-import" role="dialog" aria-modal="true" aria-labelledby="exercise-import-title">
        <header className="dialog-header">
          <h2 id="exercise-import-title">Nhập đề bài tập từ AI</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </header>

        <ol className="ai-steps">
          <li>
            <span>Chọn nội dung đề. Ứng dụng soạn sẵn lời nhắn cho AI.</span>
            <div className="ai-form">
              <label className="ai-form-wide">
                <span>
                  Chép bài tập từ giáo trình <span className="muted">(nếu có: tên sách và bài)</span>
                </span>
                <input
                  value={request.source}
                  onChange={(e) => change({ source: e.target.value })}
                  placeholder="Ví dụ: HSK 1, Bài 7 — rồi đính kèm các trang bài tập khi gửi cho AI"
                />
              </label>
              <label className="ai-form-wide">
                <span>
                  Chủ đề <span className="muted">(khi để AI tự soạn)</span>
                </span>
                <input value={request.topic} onChange={(e) => change({ topic: e.target.value })} placeholder="Ví dụ: Gia đình, số đếm" />
              </label>
              <label className="ai-form-wide">
                <span>
                  Từ vựng trọng tâm <span className="muted">(nếu có)</span>
                </span>
                <textarea rows={2} lang="zh-CN" value={request.words} onChange={(e) => change({ words: e.target.value })} placeholder="爸爸, 妈妈, 哥哥" />
              </label>
              <label>
                Học viên
                <select value={request.age} onChange={(e) => change({ age: e.target.value as ExerciseRequest["age"] })}>
                  {AGE_PROFILES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <label title={request.source.trim() ? "Chép từ giáo trình thì số câu theo sách." : undefined}>
                Số câu (khoảng)
                <input
                  type="number"
                  min={3}
                  max={50}
                  value={request.count}
                  disabled={!!request.source.trim()}
                  onChange={(e) => change({ count: Number(e.target.value) })}
                />
              </label>
              <label className="chip ai-form-wide">
                <input type="checkbox" checked={request.listening} onChange={(e) => change({ listening: e.target.checked })} /> Có phần nghe
                <span className="muted"> — ứng dụng tự đọc lời bài nghe thành file nghe; có thể thay bằng file của sách sau.</span>
              </label>
              <fieldset className="ai-form-wide">
                <legend>
                  Dạng câu <span className="muted">(bỏ trống để AI tự chọn)</span>
                </legend>
                <div className="ai-activities">
                  {QUESTION_TYPES.map((t) => (
                    <label key={t} className="chip" title={QUESTION_KINDS[t].description}>
                      <input
                        type="checkbox"
                        checked={request.kinds.includes(t)}
                        onChange={() => change({ kinds: request.kinds.includes(t) ? request.kinds.filter((k) => k !== t) : [...request.kinds, t] })}
                      />{" "}
                      {QUESTION_KINDS[t].label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="ai-form-wide">
                <span>
                  Yêu cầu thêm <span className="muted">(nếu có)</span>
                </span>
                <textarea rows={2} value={request.notes} onChange={(e) => change({ notes: e.target.value })} placeholder="Ví dụ: giải thích ngắn bằng tiếng Việt cho mọi câu" />
              </label>
            </div>
          </li>
          <li>
            <span>Sao chép lời nhắn, dán vào ChatGPT, Gemini, Claude hoặc công cụ AI bạn dùng.</span>
            <CopyButton primary label="Sao chép lời nhắn cho AI" disabled={!ready} text={() => buildExercisePrompt(request)} />
            {!ready && <span className="muted">Ghi tên giáo trình hoặc chủ đề trước.</span>}
            {request.source.trim() && (
              <span className="ai-attach-note">Nhớ đính kèm ảnh hoặc PDF các trang bài tập của “{request.source.trim()}” cùng lời nhắn.</span>
            )}
          </li>
          <li>
            <span>Sao chép toàn bộ câu trả lời của AI và dán vào đây:</span>
            <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"title": "...", "parts": [...]}' aria-label="Câu trả lời của AI" />
          </li>
        </ol>

        {result && !result.ok && (
          <div className="banner banner--error" role="alert">
            <strong>Nội dung chưa dùng được ({result.errors.length} lỗi). Sửa lại hoặc nhờ AI sửa theo các lỗi này:</strong>
            <ul>
              {result.errors.slice(0, 12).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <CopyButton label="Sao chép lỗi để gửi lại AI" text={() => fixRequest(result.errors)} />
          </div>
        )}

        {result?.ok && result.issues.length > 0 && (
          <div className="banner">
            <strong>Còn {result.issues.length} chỗ cần sửa trước khi giao bài. Vẫn nhập được để sửa trong ứng dụng, hoặc nhờ AI sửa:</strong>
            <ul>
              {result.issues.slice(0, 12).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <CopyButton label="Sao chép để gửi lại AI" text={() => fixRequest(result.issues)} />
          </div>
        )}

        {result?.ok && (
          <div className="ai-preview">
            <p>
              <strong>{result.exercise.title}</strong> — {questionCount(result.exercise)} câu:
            </p>
            <ol>
              {result.exercise.parts.map((p) => (
                <li key={p.id}>
                  {SKILL_LABELS[p.skill]}
                  {p.title && ` · ${p.title}`}
                  <span className="muted">
                    {" "}
                    — {p.questions.length} câu: {[...new Set(p.questions.map((q) => QUESTION_KINDS[q.type].label))].join(", ")}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Huỷ
          </button>
          <button
            type="button"
            className="primary"
            disabled={!result?.ok}
            onClick={() => {
              if (!result?.ok) return;
              onImport(result.exercise);
              onClose();
            }}
          >
            Thêm đề vào bài
          </button>
        </div>
      </div>
    </div>
  );
}

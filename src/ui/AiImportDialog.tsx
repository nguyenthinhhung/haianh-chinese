import { useEffect, useMemo, useState } from "react";
import { AGE_PROFILES, ageProfile } from "../core/ages";
import { buildAiPrompt, parseAiLesson } from "../core/aiImport";
import {
  activityChoices,
  checkAgainstRequest,
  DURATIONS,
  lessonKindsFor,
  normalizeRequest,
  planSlideCount,
  resolvePlan,
  type LessonRequest,
} from "../core/lessonPlan";
import { pinyinWarnings } from "../core/pinyinCheck";
import type { Slide } from "../core/schema";
import type { ImageFillRequest } from "./lessonFiles";
import { useServices } from "./services";

interface Props {
  /** "new" creates a lesson; "append" adds the slides to the open one. */
  mode: "new" | "append";
  /**
   * `themeId` suits the age the lesson was asked for; only a new lesson uses
   * it. `images` drives the picture search that follows the import.
   */
  onImport(title: string, slides: Slide[], themeId: string, images: ImageFillRequest): Promise<void>;
  onClose(): void;
}

// The teacher's last choices, so the next lesson for the same class starts from them.
const REQUEST_KEY = "ls.aiLessonRequest";

function loadRequest(): LessonRequest {
  try {
    return normalizeRequest(JSON.parse(localStorage.getItem(REQUEST_KEY) ?? "null"));
  } catch {
    return normalizeRequest(null);
  }
}

/** First text found in slide content, to tell slides apart in the preview. */
function firstText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const v of value) {
      const t = firstText(v);
      if (t) return t;
    }
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) {
      const t = firstText(v);
      if (t) return t;
    }
  }
  return "";
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older webviews without clipboard permission: select-and-copy fallback.
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** What to paste back into the AI chat so it fixes its own answer. */
function fixRequest(problems: string[]): string {
  return `Bài bạn vừa soạn còn các vấn đề sau. Hãy sửa và trả lời lại TOÀN BỘ bài bằng một khối JSON theo đúng định dạng cũ:\n${problems.map((p) => `- ${p}`).join("\n")}`;
}

function CopyButton({ text, label, primary, disabled }: { text: () => string; label: string; primary?: boolean; disabled?: boolean }) {
  const [state, setState] = useState<"" | "ok" | "fail">("");
  return (
    <span className="copy-button">
      <button
        type="button"
        className={primary ? "primary" : undefined}
        disabled={disabled}
        onClick={async () => setState((await copyText(text())) ? "ok" : "fail")}
      >
        {label}
      </button>
      {state === "ok" && <span className="muted">Đã sao chép.</span>}
      {state === "fail" && <span className="field-error">Không sao chép được, hãy thử lại.</span>}
    </span>
  );
}

function RequestForm({ request, onChange }: { request: LessonRequest; onChange(patch: Partial<LessonRequest>): void }) {
  const { templates } = useServices();
  const plan = useMemo(() => resolvePlan(request), [request]);
  const activities = activityChoices(request.kind, request.age);
  const toggle = (type: string) =>
    onChange({
      activities: request.activities.includes(type) ? request.activities.filter((t) => t !== type) : [...request.activities, type],
    });

  return (
    <div className="ai-form">
      <label className="ai-form-wide">
        Chủ đề bài học
        <input value={request.topic} onChange={(e) => onChange({ topic: e.target.value })} placeholder="Ví dụ: Con vật trong sở thú" />
      </label>
      <label>
        Học sinh
        <select value={request.age} onChange={(e) => onChange({ age: e.target.value as LessonRequest["age"] })}>
          {AGE_PROFILES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Thời lượng
        <select value={request.duration} onChange={(e) => onChange({ duration: e.target.value as LessonRequest["duration"] })}>
          {DURATIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <label className="ai-form-wide">
        Dạng bài
        <select value={request.kind} onChange={(e) => onChange({ kind: e.target.value as LessonRequest["kind"] })}>
          {lessonKindsFor(request.age).map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>
          {request.kind === "review" ? "Từ đã học cần ôn" : "Từ vựng cần dạy"} <span className="muted">(nếu có)</span>
        </span>
        <textarea
          rows={2}
          lang="zh-CN"
          value={request.words}
          onChange={(e) => onChange({ words: e.target.value })}
          placeholder="猫, 狗, 兔子, 熊猫 — bỏ trống để AI tự chọn"
        />
      </label>
      <label>
        <span>
          Mẫu câu <span className="muted">(nếu có)</span>
        </span>
        <textarea
          rows={2}
          lang="zh-CN"
          value={request.patterns}
          onChange={(e) => onChange({ patterns: e.target.value })}
          placeholder="这是什么？这是……"
        />
      </label>
      <fieldset className="ai-form-wide">
        <legend>
          Hoạt động muốn có <span className="muted">(bỏ trống để AI tự chọn)</span>
        </legend>
        <div className="ai-activities">
          {activities.map((t) => (
            <label key={t} className="chip">
              <input type="checkbox" checked={request.activities.includes(t)} onChange={() => toggle(t)} />{" "}
              {templates.get(t)?.label ?? t}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="ai-form-wide">
        <span>
          Yêu cầu thêm <span className="muted">(nếu có)</span>
        </span>
        <textarea
          rows={2}
          value={request.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Ví dụ: câu ngắn, vui nhộn; nhân vật là hai bạn Tiểu Minh và Lan"
        />
      </label>
      <p className="ai-plan ai-form-wide">
        <strong>Dự kiến {planSlideCount(plan)} slide:</strong>{" "}
        {plan.map((s) => `${s.role.split(/[:(]/)[0]!.trim()}${s.count > 1 ? ` ×${s.count}` : ""}`).join(" → ")}
      </p>
    </div>
  );
}

export function AiImportDialog({ mode, onImport, onClose }: Props) {
  const { templates } = useServices();
  const [request, setRequest] = useState(loadRequest);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => (text.trim() ? parseAiLesson(text, templates) : null), [text, templates]);
  const warnings = useMemo(
    () =>
      result?.ok
        ? [...checkAgainstRequest(result.slides, request, templates), ...pinyinWarnings(result.slides, templates)]
        : [],
    [result, request, templates],
  );

  useEffect(() => {
    try {
      localStorage.setItem(REQUEST_KEY, JSON.stringify(request));
    } catch {
      // Not remembering the choices is harmless.
    }
  }, [request]);

  useEffect(() => {
    if (result?.ok && result.title && !title) setTitle(result.title);
  }, [result, title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function submit() {
    if (!result?.ok) return;
    setBusy(true);
    setError(null);
    try {
      const age = ageProfile(request.age);
      await onImport(title.trim() || request.topic.trim() || "Bài mới", result.slides, age.theme, {
        queries: result.imageQueries,
        clipart: age.clipart,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog ai-import" role="dialog" aria-modal="true" aria-labelledby="ai-import-title">
        <header className="dialog-header">
          <h2 id="ai-import-title">Nhập bài từ AI</h2>
          <button type="button" className="ghost" onClick={onClose} disabled={busy} aria-label="Đóng">
            ✕
          </button>
        </header>

        <ol className="ai-steps">
          <li>
            <span>Chọn nội dung bài học. Ứng dụng soạn sẵn lời nhắn cho AI theo lựa chọn của bạn.</span>
            <RequestForm request={request} onChange={(patch) => setRequest((r) => normalizeRequest({ ...r, ...patch }))} />
          </li>
          <li>
            <span>Sao chép lời nhắn, dán vào ChatGPT, Gemini, Claude hoặc công cụ AI bạn dùng.</span>
            <CopyButton
              primary
              label="Sao chép lời nhắn cho AI"
              disabled={!request.topic.trim()}
              text={() => buildAiPrompt(templates, request)}
            />
            {!request.topic.trim() && <span className="muted">Hãy ghi chủ đề bài học trước.</span>}
          </li>
          <li>
            <span>Sao chép toàn bộ câu trả lời của AI và dán vào đây:</span>
            <textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='{"title": "...", "slides": [...]}'
              aria-label="Câu trả lời của AI"
            />
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

        {warnings.length > 0 && (
          <div className="banner">
            <strong>Nên xem lại ({warnings.length}). Vẫn nhập được, hoặc nhờ AI sửa:</strong>
            <ul>
              {warnings.slice(0, 12).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <CopyButton label="Sao chép để gửi lại AI" text={() => fixRequest(warnings)} />
          </div>
        )}

        {result?.ok && (
          <div className="ai-preview">
            {mode === "new" && (
              <label>
                Tên bài học
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
            )}
            <p>
              <strong>{result.slides.length} slide</strong> sẵn sàng:
            </p>
            <ol>
              {result.slides.map((s) => (
                <li key={s.id}>
                  {templates.require(s.type).label}
                  {firstText(s.content) && <span className="muted"> — {firstText(s.content).slice(0, 40)}</span>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {error && <p className="field-error">{error}</p>}

        <div className="form-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className="primary" disabled={!result?.ok || busy} onClick={() => void submit()}>
            {mode === "new" ? "Tạo bài mới" : "Thêm vào cuối bài"}
          </button>
        </div>
      </div>
    </div>
  );
}

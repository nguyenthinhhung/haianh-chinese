import { useEffect, useMemo, useState } from "react";
import { AGE_PROFILES, ageProfile } from "../core/ages";
import { buildAiPrompt, parseAiLesson } from "../core/aiImport";
import {
  activityChoices,
  applyPreset,
  checkAgainstRequest,
  DURATIONS,
  lessonKindsFor,
  normalizeRequest,
  parseWordList,
  planOutline,
  presetOf,
  type LessonPreset,
  type LessonRequest,
} from "../core/lessonPlan";
import { parseLessonHtml } from "../core/codec";
import { lessonWords } from "../core/lessonWords";
import { pinyinWarnings } from "../core/pinyinCheck";
import type { LessonLocation } from "../platform/persistence";
import type { Slide } from "../core/schema";
import type { ImageFillRequest } from "./lessonFiles";
import { deleteForm, loadForms } from "./lessonForms";
import { useServices } from "./services";

interface Props {
  /** "new" creates a lesson; "append" adds the slides to the open one. */
  mode: "new" | "append";
  /** In "append" mode: the slide (1-based) the new slides go after; none puts them at the end. */
  insertAfter?: number;
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

/** The outline's steps and counts depend on these; the teacher's step counts no longer fit after a change. */
const OUTLINE_INPUTS = ["age", "kind", "duration", "activities", "form"] as const;

function changeRequest(request: LessonRequest, patch: Partial<LessonRequest>): LessonRequest {
  const reshaped = !("outline" in patch) && OUTLINE_INPUTS.some((k) => k in patch && patch[k] !== request[k]);
  return normalizeRequest({ ...request, ...patch, ...(reshaped ? { outline: {} } : {}) });
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
export function fixRequest(problems: string[]): string {
  return `Bài bạn vừa soạn còn các vấn đề sau. Hãy sửa và trả lời lại TOÀN BỘ bài bằng một khối JSON theo đúng định dạng cũ:\n${problems.map((p) => `- ${p}`).join("\n")}`;
}

export function CopyButton({ text, label, primary, disabled }: { text: () => string; label: string; primary?: boolean; disabled?: boolean }) {
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

// Ways of teaching the teacher saved by name, e.g. "Từ vựng mầm non 20 phút".
const PRESETS_KEY = "ls.aiPresets";

function loadPresets(): LessonPreset[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((p): p is LessonPreset => !!p && typeof p.name === "string" && !!p.name.trim() && !!p.settings && typeof p.settings === "object")
      : [];
  } catch {
    return [];
  }
}

function Presets({ request, onApply }: { request: LessonRequest; onApply(preset: LessonPreset): void }) {
  const [presets, setPresets] = useState(loadPresets);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState("");

  function store(next: LessonPreset[]) {
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      // Presets are a convenience; failing to keep one loses nothing else.
    }
  }

  return (
    <div className="ai-presets ai-form-wide">
      <select
        aria-label="Mẫu đã lưu"
        value={picked}
        onChange={(e) => {
          setPicked(e.target.value);
          const preset = presets.find((p) => p.name === e.target.value);
          if (preset) onApply(preset);
        }}
      >
        <option value="">{presets.length ? "Dùng mẫu đã lưu…" : "Chưa có mẫu nào"}</option>
        {presets.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>
      {picked && (
        <button
          type="button"
          className="ghost"
          title="Xoá mẫu này"
          onClick={() => {
            store(presets.filter((p) => p.name !== picked));
            setPicked("");
          }}
        >
          Xoá mẫu
        </button>
      )}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên mẫu, ví dụ: Từ vựng mầm non 20 phút" aria-label="Tên mẫu" />
      <button
        type="button"
        disabled={!name.trim()}
        title="Lưu lứa tuổi, dạng bài, thời lượng, dàn ý, hoạt động và yêu cầu thêm (không lưu chủ đề và từ vựng)"
        onClick={() => {
          const preset = presetOf(name, request);
          store([...presets.filter((p) => p.name !== preset.name), preset]);
          setPicked(preset.name);
          setName("");
        }}
      >
        Lưu thành mẫu
      </button>
    </div>
  );
}

function Outline({ request, insert, onChange }: { request: LessonRequest; insert: boolean; onChange(patch: Partial<LessonRequest>): void }) {
  const { templates } = useServices();
  const steps = useMemo(() => planOutline(request, insert), [request, insert]);
  const total = steps.reduce((n, s) => n + s.count, 0);
  const set = (role: string, count: number) => onChange({ outline: { ...request.outline, [role]: count } });
  const changed = steps.some((s) => s.count !== s.suggested);

  return (
    <fieldset className="ai-outline ai-form-wide">
      <legend>
        Dàn ý: {total} slide{" "}
        <span className="muted">(bấm − / + để đổi số slide; về 0 là bỏ bước đó)</span>
        {changed && (
          <button type="button" className="ghost" onClick={() => onChange({ outline: {} })}>
            Về dàn ý gợi ý
          </button>
        )}
      </legend>
      <ol>
        {steps.map((s) => (
          <li key={s.role} className={s.count ? undefined : "ai-outline-off"}>
            <span className="ai-outline-role" title={s.role}>
              {/* The role is written for the AI; its first words name the step for the teacher. */}
              {s.role.split(/[:(]/)[0]!.trim()}
              <span className="muted"> · {s.types.map((t) => templates.get(t)?.label ?? t).join(" / ")}</span>
            </span>
            <span className="ai-outline-count">
              <button type="button" aria-label={`Bớt một slide: ${s.role}`} disabled={s.count <= s.min} onClick={() => set(s.role, s.count - 1)}>
                −
              </button>
              <span>{s.count}</span>
              <button type="button" aria-label={`Thêm một slide: ${s.role}`} disabled={s.count >= s.max} onClick={() => set(s.role, s.count + 1)}>
                +
              </button>
            </span>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

/**
 * Fills "words the class knows" from lessons in the library: the teacher
 * ticks earlier lessons and their words are added, without duplicates.
 */
function KnownFromLessons({ onAdd }: { onAdd(words: string[]): number }) {
  const { persistence, templates } = useServices();
  const [lessons, setLessons] = useState<LessonLocation[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function openPicker() {
    setMessage(null);
    try {
      setLessons(await persistence.listLessons());
    } catch (e) {
      setMessage(`Không đọc được thư viện: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function add() {
    setBusy(true);
    const words: string[] = [];
    let unreadable = 0;
    for (const dir of picked) {
      try {
        const parsed = parseLessonHtml((await persistence.readLesson(dir)).html, templates);
        if (parsed.ok) words.push(...lessonWords(parsed.doc, templates));
        else unreadable++;
      } catch {
        unreadable++;
      }
    }
    const added = onAdd(words);
    setMessage(`Đã thêm ${added} từ mới vào danh sách.${unreadable ? ` ${unreadable} bài không đọc được.` : ""}`);
    setLessons(null);
    setPicked(new Set());
    setBusy(false);
  }

  if (!lessons) {
    return (
      <div className="ai-form-wide ai-known-from">
        <button type="button" className="ghost" onClick={() => void openPicker()}>
          Lấy từ các bài đã dạy…
        </button>
        {message && <span className="muted">{message}</span>}
      </div>
    );
  }
  return (
    <fieldset className="ai-form-wide ai-known-picker">
      <legend>Chọn các bài lớp đã học</legend>
      {lessons.length === 0 && <p className="muted">Thư viện chưa có bài nào.</p>}
      <div className="ai-known-list">
        {lessons.map((l) => (
          <label key={l.dir} className="chip">
            <input
              type="checkbox"
              checked={picked.has(l.dir)}
              onChange={() =>
                setPicked((s) => {
                  const next = new Set(s);
                  if (!next.delete(l.dir)) next.add(l.dir);
                  return next;
                })
              }
            />{" "}
            {l.title ?? l.folderName}
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button type="button" onClick={() => setLessons(null)} disabled={busy}>
          Huỷ
        </button>
        <button type="button" className="primary" onClick={() => void add()} disabled={busy || picked.size === 0}>
          {busy ? "Đang đọc…" : `Thêm từ của ${picked.size} bài`}
        </button>
      </div>
    </fieldset>
  );
}

const FORM_PREFIX = "form:";

function RequestForm({ request, insert, onChange }: { request: LessonRequest; insert: boolean; onChange(patch: Partial<LessonRequest>): void }) {
  const { templates } = useServices();
  const [forms, setForms] = useState(() => loadForms(templates));
  const usingForm = request.kind === "form" && request.form;

  function pickKind(value: string) {
    if (!value.startsWith(FORM_PREFIX)) return onChange({ kind: value as LessonRequest["kind"], form: null });
    const form = forms.find((f) => f.name === value.slice(FORM_PREFIX.length));
    if (form) onChange({ kind: "form", form });
  }
  const activities = activityChoices(request.kind, request.age);
  const review = request.kind === "review";
  const toggle = (type: string) =>
    onChange({
      activities: request.activities.includes(type) ? request.activities.filter((t) => t !== type) : [...request.activities, type],
    });
  // Opened when something in it is already filled in, so nothing set stays out of sight.
  const advancedInUse = !!(request.patterns.trim() || request.known.trim() || request.exclude.trim() || request.notes.trim() || request.activities.length);

  return (
    <div className="ai-form">
      <Presets request={request} onApply={(preset) => onChange(applyPreset(request, preset))} />
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
      <label title={usingForm ? "Khung bài đã định số slide của từng phần; chỉnh ở Dàn ý bên dưới." : undefined}>
        Thời lượng
        <select
          value={request.duration}
          disabled={!!usingForm}
          onChange={(e) => onChange({ duration: e.target.value as LessonRequest["duration"] })}
        >
          {DURATIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <label className="ai-form-wide">
        Dạng bài
        <span className="ai-kind">
          <select value={usingForm ? `${FORM_PREFIX}${request.form!.name}` : request.kind} onChange={(e) => pickKind(e.target.value)}>
            {/* Teaching chosen words in depth only makes sense inside an existing lesson. */}
            {lessonKindsFor(request.age)
              .filter((b) => insert || b.id !== "word-focus")
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            {/* A form makes a whole lesson; inserted slides use the kinds above. */}
            {forms.length > 0 && !insert && (
              <optgroup label="Khung bài của tôi">
                {forms.map((f) => (
                  <option key={f.name} value={`${FORM_PREFIX}${f.name}`}>
                    Khung: {f.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {usingForm && (
            <button
              type="button"
              className="ghost"
              title="Xoá khung bài này khỏi máy (bài đã soạn không bị ảnh hưởng)"
              onClick={() => {
                if (!window.confirm(`Xoá khung bài “${request.form!.name}”?`)) return;
                setForms(deleteForm(request.form!.name, templates));
                onChange({ kind: "hsk1", form: null });
              }}
            >
              Xoá khung
            </button>
          )}
        </span>
        {forms.length === 0 && !insert && (
          <span className="muted">
            Mẹo: soạn xong một bài ưng ý, vào tab <strong>Bài học</strong> bấm <strong>Lưu làm khung bài</strong> để mọi bài sau theo đúng khung đó.
          </span>
        )}
      </label>
      <label className="ai-form-wide">
        <span>
          {review ? "Từ đã học cần ôn" : request.kind === "word-focus" ? "Từ cần dạy kỹ" : "Từ vựng cần dạy"} <span className="muted">(nếu có)</span>
        </span>
        <textarea
          rows={2}
          lang="zh-CN"
          value={request.words}
          onChange={(e) => onChange({ words: e.target.value })}
          placeholder="猫, 狗, 兔子, 熊猫 — bỏ trống để AI tự chọn"
        />
      </label>
      <label className="ai-form-wide">
        <span>
          Soạn theo giáo trình <span className="muted">(nếu có: tên sách và bài)</span>
        </span>
        <input
          value={request.source}
          onChange={(e) => onChange({ source: e.target.value })}
          placeholder="Ví dụ: HSK 1, Bài 7 — rồi đính kèm các trang của bài khi gửi cho AI"
        />
      </label>
      <Outline request={request} insert={insert} onChange={onChange} />
      <details className="ai-advanced ai-form-wide" open={advancedInUse || undefined}>
        <summary>Tuỳ chỉnh nâng cao</summary>
        <div className="ai-form">
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
          {!review && (
            <label>
              <span>
                Từ lớp đã học <span className="muted">(dùng lại, không dạy lại)</span>
              </span>
              <textarea
                rows={2}
                lang="zh-CN"
                value={request.known}
                onChange={(e) => onChange({ known: e.target.value })}
                placeholder="你好, 我, 是, 这"
              />
            </label>
          )}
          {!review && (
            <KnownFromLessons
              onAdd={(found) => {
                const merged = [...new Set([...parseWordList(request.known), ...found])];
                onChange({ known: merged.join(", ") });
                return merged.length - parseWordList(request.known).length;
              }}
            />
          )}
          <label className={review ? undefined : "ai-form-wide"}>
            <span>
              Không đưa vào bài <span className="muted">(nếu có)</span>
            </span>
            <textarea
              rows={2}
              value={request.exclude}
              onChange={(e) => onChange({ exclude: e.target.value })}
              placeholder="Ví dụ: 狗, 猪 — hoặc: không dùng động vật hoang dã"
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
        </div>
      </details>
    </div>
  );
}

export function AiImportDialog({ mode, insertAfter, onImport, onClose }: Props) {
  const { templates } = useServices();
  const [request, setRequest] = useState(() => {
    const r = loadRequest();
    if (mode === "new" && r.kind === "word-focus") return changeRequest(r, { kind: "vocabulary" });
    if (mode === "append" && r.kind === "form") return changeRequest(r, { kind: "word-focus", form: null });
    return r;
  });
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => (text.trim() ? parseAiLesson(text, templates) : null), [text, templates]);
  const warnings = useMemo(
    () =>
      result?.ok
        ? [...checkAgainstRequest(result.slides, request, templates, mode === "append"), ...pinyinWarnings(result.slides, templates)]
        : [],
    [result, request, templates, mode],
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
          <h2 id="ai-import-title">{mode === "new" ? "Tạo bài bằng AI" : "Thêm slide bằng AI"}</h2>
          <button type="button" className="ghost" onClick={onClose} disabled={busy} aria-label="Đóng">
            ✕
          </button>
        </header>

        <ol className="ai-steps">
          <li>
            <span>Chọn nội dung bài học. Ứng dụng soạn sẵn lời nhắn cho AI theo lựa chọn của bạn.</span>
            <RequestForm request={request} insert={mode === "append"} onChange={(patch) => setRequest((r) => changeRequest(r, patch))} />
          </li>
          <li>
            <span>Sao chép lời nhắn, dán vào ChatGPT, Gemini, Claude hoặc công cụ AI bạn dùng.</span>
            <CopyButton
              primary
              label="Sao chép lời nhắn cho AI"
              disabled={!request.topic.trim()}
              text={() => buildAiPrompt(templates, request, mode === "append")}
            />
            {!request.topic.trim() && <span className="muted">Hãy ghi chủ đề bài học trước.</span>}
            {request.topic.trim() && request.source.trim() && (
              <span className="ai-attach-note">
                Nhớ đính kèm file PDF giáo trình (chỉ các trang của bài “{request.source.trim()}”) cùng lời nhắn.
              </span>
            )}
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
            {mode === "new" ? "Tạo bài mới" : insertAfter ? `Chèn sau slide ${insertAfter}` : "Thêm vào cuối bài"}
          </button>
        </div>
      </div>
    </div>
  );
}

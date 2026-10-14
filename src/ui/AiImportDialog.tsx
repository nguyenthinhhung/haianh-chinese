import { useEffect, useMemo, useState } from "react";
import { buildAiPrompt, parseAiLesson } from "../core/aiImport";
import type { Slide } from "../core/schema";
import { useServices } from "./services";

interface Props {
  /** "new" creates a lesson; "append" adds the slides to the open one. */
  mode: "new" | "append";
  onImport(title: string, slides: Slide[]): Promise<void>;
  onClose(): void;
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

export function AiImportDialog({ mode, onImport, onClose }: Props) {
  const { templates } = useServices();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => (text.trim() ? parseAiLesson(text, templates) : null), [text, templates]);

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
      await onImport(title.trim() || "Bài mới", result.slides);
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
            <span>
              Sao chép lời nhắn mẫu, dán vào ChatGPT, Gemini hoặc công cụ AI bạn dùng, rồi sửa chủ đề ở dòng đầu.
            </span>
            <button
              type="button"
              className="primary"
              onClick={async () => setCopied((await copyText(buildAiPrompt(templates))) ? "ok" : "fail")}
            >
              Sao chép lời nhắn cho AI
            </button>
            {copied === "ok" && <span className="muted">Đã sao chép.</span>}
            {copied === "fail" && <span className="field-error">Không sao chép được, hãy thử lại.</span>}
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

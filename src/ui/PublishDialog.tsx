import { useEffect, useRef, useState } from "react";
import type { LessonDocument } from "../core/schema";
import { PersistenceError } from "../platform/persistence";
import { publishLesson, type PublishResult } from "./lessonFiles";
import { useServices } from "./services";

interface Props {
  dir: string;
  doc: LessonDocument;
  onClose(): void;
}

/** Publishes the lesson to the teacher's web server; the first time it also asks for the server and password. */
export function PublishDialog({ dir, doc, onClose }: Props) {
  const services = useServices();
  const [loaded, setLoaded] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [copied, setCopied] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void services.persistence.getPublishSettings().then((s) => {
      setSavedUrl(s.serverUrl);
      setServerUrl(s.serverUrl ?? "");
      setHasPassword(s.hasPassword);
      setLoaded(true);
    });
  }, [services]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function publish() {
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      if (!hasPassword && !password) throw new PersistenceError("not-configured", "Nhập mật khẩu đăng bài.");
      if (password || serverUrl.trim() !== savedUrl) {
        const saved = await services.persistence.setPublishSettings(serverUrl, password || null);
        setSavedUrl(saved.serverUrl);
        setServerUrl(saved.serverUrl ?? "");
        setHasPassword(saved.hasPassword);
        setPassword("");
      }
      setResult(await publishLesson(dir, doc, services));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (e instanceof PersistenceError && e.code === "unauthorized") {
        setHasPassword(false);
        passwordRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Không sao chép được; hãy bôi đen đường link và sao chép bằng tay.");
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        className="dialog publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        onSubmit={(e) => {
          e.preventDefault();
          void publish();
        }}
      >
        <header className="dialog-header">
          <h2 id="publish-title">Đăng lên web</h2>
          <button type="button" className="ghost" onClick={onClose} disabled={busy} aria-label="Đóng">
            ✕
          </button>
        </header>
        <p className="muted">
          Bài được đăng lên máy chủ riêng của bạn để trình chiếu từ bất kỳ máy nào có trình duyệt. Chỉ người có mật khẩu
          mới mở được. Đăng lại thì bản trên web được thay bằng bản mới.
        </p>
        <div className="field">
          <label className="field-label" htmlFor="publish-server">
            Địa chỉ máy chủ
          </label>
          <input
            id="publish-server"
            type="url"
            placeholder="https://tên.workers.dev"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            disabled={!loaded || busy}
            required
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="publish-password">
            Mật khẩu đăng bài
          </label>
          <input
            id="publish-password"
            ref={passwordRef}
            type="password"
            autoComplete="off"
            placeholder={hasPassword ? "Đã lưu; để trống để giữ nguyên" : ""}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!loaded || busy}
          />
          <span className="muted">Tắt bộ gõ tiếng Việt khi nhập. Mật khẩu được cất trong kho mật khẩu của máy.</span>
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div className="publish-result" role="status">
            <p>
              Đã đăng. {result.uploaded > 0 ? `Đã gửi ${result.uploaded} file ảnh/âm thanh mới.` : "Ảnh và âm thanh đã có sẵn trên máy chủ."}
            </p>
            {result.missing.length > 0 && (
              <p className="field-warning">Thiếu {result.missing.length} ảnh/âm thanh không đọc được; bản trên web sẽ thiếu chúng.</p>
            )}
            <div className="publish-link">
              <input readOnly value={result.url} aria-label="Đường link bài học" onFocus={(e) => e.target.select()} />
              <button type="button" className="ghost" onClick={() => void copy(result.url)}>
                {copied ? "Đã sao chép" : "Sao chép link"}
              </button>
            </div>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Đóng
          </button>
          <button type="submit" className="primary" disabled={!loaded || busy || !doc.slides.length}>
            {busy ? "Đang đăng…" : result ? "Đăng lại" : "Đăng"}
          </button>
        </div>
      </form>
    </div>
  );
}

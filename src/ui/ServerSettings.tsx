import { useEffect, useRef, useState } from "react";
import { PersistenceError } from "../platform/persistence";
import { useServices } from "./services";

/**
 * The teacher's web server (address and password), shared by "Đăng lên web"
 * and "Giao bài": filled in the first time, kept afterwards.
 */

export interface ServerSettings {
  loaded: boolean;
  serverUrl: string;
  setServerUrl(value: string): void;
  password: string;
  setPassword(value: string): void;
  hasPassword: boolean;
  passwordRef: React.RefObject<HTMLInputElement | null>;
  /** Stores what was typed, if anything changed; rejects when there is no password yet. */
  save(): Promise<void>;
  /** After an error: when the server refused the password, asks for it again. */
  handleError(e: unknown): void;
}

export function useServerSettings(): ServerSettings {
  const { persistence } = useServices();
  const [loaded, setLoaded] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void persistence.getPublishSettings().then((s) => {
      setSavedUrl(s.serverUrl);
      setServerUrl(s.serverUrl ?? "");
      setHasPassword(s.hasPassword);
      setLoaded(true);
    });
  }, [persistence]);

  async function save() {
    if (!hasPassword && !password) throw new PersistenceError("not-configured", "Nhập mật khẩu đăng bài.");
    if (!password && serverUrl.trim() === savedUrl) return;
    const saved = await persistence.setPublishSettings(serverUrl, password || null);
    setSavedUrl(saved.serverUrl);
    setServerUrl(saved.serverUrl ?? "");
    setHasPassword(saved.hasPassword);
    setPassword("");
  }

  function handleError(e: unknown) {
    if (e instanceof PersistenceError && e.code === "unauthorized") {
      setHasPassword(false);
      passwordRef.current?.focus();
    }
  }

  return { loaded, serverUrl, setServerUrl, password, setPassword, hasPassword, passwordRef, save, handleError };
}

export function ServerFields({ settings, disabled }: { settings: ServerSettings; disabled: boolean }) {
  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="server-url">
          Địa chỉ máy chủ
        </label>
        <input
          id="server-url"
          type="url"
          placeholder="https://tên.workers.dev"
          value={settings.serverUrl}
          onChange={(e) => settings.setServerUrl(e.target.value)}
          disabled={!settings.loaded || disabled}
          required
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="server-password">
          Mật khẩu đăng bài
        </label>
        <input
          id="server-password"
          ref={settings.passwordRef}
          type="password"
          autoComplete="off"
          placeholder={settings.hasPassword ? "Đã lưu; để trống để giữ nguyên" : ""}
          value={settings.password}
          onChange={(e) => settings.setPassword(e.target.value)}
          disabled={!settings.loaded || disabled}
        />
        <span className="muted">Tắt bộ gõ tiếng Việt khi nhập. Mật khẩu được cất trong kho mật khẩu của máy.</span>
      </div>
    </>
  );
}

/** A link to hand on, with a button that copies it. */
export function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="publish-link">
      <input readOnly value={url} aria-label={label} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="ghost"
        onClick={() =>
          void navigator.clipboard.writeText(url).then(
            () => setCopied(true),
            () => setFailed(true),
          )
        }
      >
        {copied ? "Đã sao chép" : "Sao chép link"}
      </button>
      {failed && <span className="field-error">Không sao chép được; bôi đen đường link rồi sao chép bằng tay.</span>}
    </div>
  );
}

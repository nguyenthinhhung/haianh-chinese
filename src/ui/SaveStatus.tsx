import { SHORTCUTS } from "./shortcuts";
import type { LessonSession } from "./useLessonSession";

export function SaveStatusButton({ session }: { session: LessonSession }) {
  const { status } = session;

  if (status.kind === "conflict") {
    return (
      <div className="save-status save-status--error" role="alert">
        <span>File đã bị thay đổi bên ngoài ứng dụng (OneDrive/iCloud?).</span>
        <button type="button" onClick={() => void session.save({ overwrite: true })}>
          Ghi đè bằng bản đang sửa
        </button>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="save-status save-status--error" role="alert">
        <span title={status.message}>Không lưu được: {status.message}</span>
        <button type="button" onClick={() => void session.save()}>
          Thử lại
        </button>
      </div>
    );
  }

  const label = { saved: "Đã lưu", dirty: "Lưu", saving: "Đang lưu…" }[status.kind];
  return (
    <div className="save-status" aria-live="polite">
      {status.kind === "dirty" && <span className="unsaved">Chưa lưu</span>}
      <button
        type="button"
        className={status.kind === "dirty" ? "primary" : "muted-button"}
        disabled={status.kind !== "dirty"}
        title={`Lưu (${SHORTCUTS.save})`}
        onClick={() => void session.save()}
      >
        {label}
      </button>
    </div>
  );
}

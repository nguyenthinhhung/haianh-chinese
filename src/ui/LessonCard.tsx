import { useState } from "react";
import type { LessonLocation } from "../platform/persistence";

const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

interface Props {
  lesson: LessonLocation;
  disabled: boolean;
  onOpen(): void;
  onRename(title: string): Promise<void>;
  onDuplicate(): Promise<void>;
  onDelete(): Promise<void>;
}

export function LessonCard({ lesson, disabled, onOpen, onRename, onDuplicate, onDelete }: Props) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const name = lesson.title ?? lesson.folderName;
  const [title, setTitle] = useState(name);

  if (mode === "rename") {
    return (
      <form
        className="lesson-item lesson-item--form"
        onSubmit={async (e) => {
          e.preventDefault();
          const next = title.trim();
          if (next && next !== name) await onRename(next);
          setMode("view");
        }}
      >
        <label>
          Tên bài học
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setMode("view")}
          />
        </label>
        <div className="form-actions">
          <button type="button" onClick={() => setMode("view")}>
            Huỷ
          </button>
          <button type="submit" className="primary" disabled={!title.trim() || disabled}>
            Đổi tên
          </button>
        </div>
      </form>
    );
  }

  if (mode === "delete") {
    return (
      <div className="lesson-item lesson-item--form" role="alertdialog" aria-label={`Xoá bài ${name}`}>
        <p>
          Xoá bài <strong>“{name}”</strong>? Bài sẽ được chuyển vào Thùng rác, có thể khôi phục từ đó.
        </p>
        <div className="form-actions">
          <button type="button" autoFocus onClick={() => setMode("view")}>
            Huỷ
          </button>
          <button
            type="button"
            className="danger"
            disabled={disabled}
            onClick={async () => {
              await onDelete();
              setMode("view");
            }}
          >
            Xoá
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lesson-item">
      <button type="button" className="lesson-card" onClick={onOpen} disabled={disabled}>
        <span className="lesson-name">{name}</span>
        <span className="muted">{dateFormat.format(new Date(lesson.modifiedMs))}</span>
      </button>
      <div className="lesson-actions">
        <button
          type="button"
          className="ghost"
          disabled={disabled}
          onClick={() => {
            setTitle(name);
            setMode("rename");
          }}
        >
          Đổi tên
        </button>
        <button type="button" className="ghost" disabled={disabled} onClick={() => void onDuplicate()}>
          Nhân bản
        </button>
        <button type="button" className="ghost danger" disabled={disabled} onClick={() => setMode("delete")}>
          Xoá
        </button>
      </div>
    </div>
  );
}

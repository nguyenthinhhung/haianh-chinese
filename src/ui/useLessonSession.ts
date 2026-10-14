import { produce } from "immer";
import { useCallback, useEffect, useRef, useState } from "react";
import { removeUnusedAssets, touchUpdatedAt } from "../core/document";
import {
  applyEverywhere,
  canRedo,
  canUndo,
  createHistory,
  record,
  redo as redoStep,
  replacePresent,
  undo as undoStep,
  type History,
} from "../core/history";
import type { LessonDocument } from "../core/schema";
import { formatIssue, validateLesson } from "../core/validate";
import { PersistenceError } from "../platform/persistence";
import { libraryHtml, type OpenLesson } from "./lessonFiles";
import { useServices } from "./services";

export type SaveStatus =
  | { kind: "saved" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

export interface UpdateOptions {
  /** Consecutive edits with the same key (e.g. typing in one field) undo as one step. */
  coalesce?: string;
}

export interface LessonSession {
  dir: string;
  doc: LessonDocument;
  status: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  /** Applies a command to the current document as one undoable step. */
  update(command: (doc: LessonDocument) => LessonDocument, options?: UpdateOptions): void;
  /**
   * Applies a change that finished in the background (a picture found for an
   * empty slot) to the whole undo history instead of adding a step, so undo
   * neither removes it nor has to step over it.
   */
  applyInBackground(change: (doc: LessonDocument) => LessonDocument): void;
  undo(): void;
  redo(): void;
  /** Writes `lesson.html`; `overwrite` skips the outside-change check after a conflict. */
  save(options?: { overwrite?: boolean }): Promise<boolean>;
  /**
   * Finishes with the lesson: drops unused assets, saves, and deletes their
   * files. Resolves false, with the status showing why, when saving fails.
   */
  closeOut(): Promise<boolean>;
}

const DRAFT_DELAY_MS = 1000;
const IDLE_SAVE_MS = 30_000;

export function useLessonSession(initial: OpenLesson): LessonSession {
  const services = useServices();
  const { persistence } = services;
  const [history, setHistory] = useState(() => {
    const h = createHistory(initial.doc);
    // Recovering a draft is itself a step, so undo returns to the saved file.
    return initial.recovered ? record(h, initial.recovered) : h;
  });
  const [savedDoc, setSavedDoc] = useState(initial.doc);
  const savedRef = useRef(initial.doc);
  const [pending, setPending] = useState<Exclude<SaveStatus, { kind: "saved" } | { kind: "dirty" }> | null>(null);
  const hash = useRef(initial.hash);
  const historyRef = useRef(history);
  const saving = useRef(false);

  const doc = history.present;
  const dirty = doc !== savedDoc;
  const status: SaveStatus = pending ?? (dirty ? { kind: "dirty" } : { kind: "saved" });

  // History is applied through the ref immediately, so callers can read
  // results (such as a new slide's ID) right after calling.
  const commit = useCallback((next: History) => {
    if (next === historyRef.current) return;
    historyRef.current = next;
    setHistory(next);
    setPending((p) => (p?.kind === "saving" ? p : null));
  }, []);

  const update = useCallback(
    (command: (d: LessonDocument) => LessonDocument, options?: UpdateOptions) => {
      const h = historyRef.current;
      commit(record(h, command(h.present), options?.coalesce));
    },
    [commit],
  );
  const applyInBackground = useCallback(
    (change: (d: LessonDocument) => LessonDocument) => commit(applyEverywhere(historyRef.current, change)),
    [commit],
  );
  const undo = useCallback(() => commit(undoStep(historyRef.current)), [commit]);
  const redo = useCallback(() => commit(redoStep(historyRef.current)), [commit]);

  const save = useCallback(
    async ({ overwrite = false } = {}): Promise<boolean> => {
      if (saving.current) return false;
      const start = historyRef.current.present;
      // Never write a document that does not validate.
      const valid = validateLesson(start, services.templates);
      if (!valid.ok) {
        setPending({
          kind: "error",
          message: `Bài có chỗ chưa hợp lệ — ${formatIssue(valid.issues[0]!, start, services.templates)}`,
        });
        return false;
      }

      saving.current = true;
      setPending({ kind: "saving" });
      const toWrite = touchUpdatedAt(valid.doc, services.appVersion);
      try {
        const result = await persistence.writeLesson(
          initial.dir,
          toWrite.id,
          libraryHtml(toWrite, services),
          overwrite ? null : hash.current,
        );
        hash.current = result.hash;
        savedRef.current = toWrite;
        setSavedDoc(toWrite);
        // Keep edits made while the file was being written; they stay unsaved.
        const current = historyRef.current.present;
        const next =
          current === start
            ? toWrite
            : produce(current, (d) => {
                d.metadata = toWrite.metadata;
              });
        historyRef.current = replacePresent(historyRef.current, next);
        setHistory(historyRef.current);
        setPending(null);
        if (current === start) {
          // The draft only matters until the file holds everything.
          await persistence.deleteDraft(toWrite.id).catch((e) => console.warn("Could not delete draft", e));
        }
        return true;
      } catch (e) {
        if (e instanceof PersistenceError && e.code === "conflict") setPending({ kind: "conflict" });
        else setPending({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        return false;
      } finally {
        saving.current = false;
      }
    },
    [initial.dir, services, persistence],
  );

  const closeOut = useCallback(async (): Promise<boolean> => {
    // Unused assets are only dropped now: during editing, undo could bring
    // a reference back. History ends with the session, so no step is recorded.
    const h = historyRef.current;
    const cleaned = removeUnusedAssets(h.present, services.templates);
    if (cleaned !== h.present) {
      historyRef.current = replacePresent(h, cleaned);
      setHistory(historyRef.current);
    }
    if (historyRef.current.present !== savedRef.current && !(await save())) return false;
    const keep = historyRef.current.present.assets.map((a) => a.file);
    await persistence.pruneAssets(initial.dir, keep).catch((e) => console.warn("Could not clean up assets", e));
    return true;
  }, [initial.dir, persistence, save, services.templates]);

  const writeDraft = useCallback(
    () =>
      persistence
        .writeDraft(historyRef.current.present.id, JSON.stringify(historyRef.current.present))
        .catch((e) => console.warn("Could not write draft", e)),
    [persistence],
  );

  // Draft: every change reaches disk within about a second, so a crash loses
  // almost nothing even though `lesson.html` is written less often.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void writeDraft(), DRAFT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc, dirty, writeDraft]);

  // Autosave after 30 seconds without edits. Not after a failed save: the
  // teacher sees the error, and the next edit re-arms the timer.
  useEffect(() => {
    if (status.kind !== "dirty") return;
    const timer = setTimeout(() => void save(), IDLE_SAVE_MS);
    return () => clearTimeout(timer);
  }, [doc, status.kind, save]);

  // Closing the window saves first. If that fails the window stays open to
  // show why; closing again quits anyway, leaving the draft for recovery.
  useEffect(() => {
    let failedOnce = false;
    return persistence.onCloseRequested(async () => {
      if (await closeOut()) return true;
      await writeDraft();
      if (failedOnce) return true;
      failedOnce = true;
      return false;
    });
  }, [persistence, closeOut, writeDraft]);

  // Ctrl on Windows, ⌘ on macOS. Undo goes through the document history even
  // inside text fields: their contents come from the document, so the
  // browser's own undo would fight it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void save();
      } else if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y" && !e.metaKey) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, undo, redo]);

  useEffect(() => {
    void persistence.setWindowTitle(`${dirty ? "• " : ""}${doc.title} — Chinese Lesson Studio`);
  }, [dirty, doc.title, persistence]);

  return {
    dir: initial.dir,
    doc,
    status,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    update,
    applyInBackground,
    undo,
    redo,
    save,
    closeOut,
  };
}

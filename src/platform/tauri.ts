import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  PersistenceError,
  type Draft,
  type ImageCandidate,
  type ImageHit,
  type ImportedAsset,
  type PickedLesson,
  type PublishedAssets,
  type PublishSettings,
  type LessonFile,
  type LessonLocation,
  type Persistence,
  type PersistenceErrorCode,
} from "./persistence";

async function call<T>(command: string, args?: Record<string, unknown> | Uint8Array, headers?: Record<string, string>): Promise<T> {
  try {
    return await invoke<T>(command, args, headers ? { headers } : undefined);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && "message" in e) {
      throw new PersistenceError((e as { code: PersistenceErrorCode }).code, String((e as { message: unknown }).message));
    }
    throw new PersistenceError("io", String(e));
  }
}

/** What the open lesson does before the window closes (save); the window closes when every handler agrees. */
const closeHandlers = new Set<() => Promise<boolean>>();

/**
 * Answers the backend's close request: acknowledge at once, run the handlers,
 * then close. Installed at startup so the library closes without delay; the
 * backend closes the window by itself when no page answers (see closing.rs).
 */
function listenForClose(): void {
  void listen("app-close-requested", async () => {
    await call("close_ack");
    let close = true;
    for (const handler of closeHandlers) {
      try {
        if (!(await handler())) close = false;
      } catch (e) {
        // A handler that breaks must not trap the window; the draft keeps the lesson.
        console.error("Close handler failed", e);
      }
    }
    if (close) await call("close_window");
  });
}

export function createTauriPersistence(): Persistence {
  listenForClose();
  return {
    kind: "tauri",
    libraryDir: () => call("library_dir"),
    listLessons: () => call<LessonLocation[]>("list_lessons"),
    createLessonDir: (folderName) => call<LessonLocation>("create_lesson_dir", { folderName }),
    duplicateLessonDir: (dir, folderName) => call<LessonLocation>("duplicate_lesson_dir", { dir, folderName }),
    trashLesson: (dir, lessonId) => call("trash_lesson", { dir, lessonId }),
    readLesson: (dir) => call<LessonFile>("read_lesson", { dir }),
    writeLesson: (dir, lessonId, html, expectedHash) =>
      call<{ hash: string }>("write_lesson", { dir, lessonId, html, expectedHash }),
    writeDraft: (lessonId, json) => call("write_draft", { lessonId, json }),
    readDraft: (lessonId) => call<Draft | null>("read_draft", { lessonId }),
    deleteDraft: (lessonId) => call("delete_draft", { lessonId }),
    acquireLock: (lessonId) => call<boolean>("acquire_lock", { lessonId }),
    releaseLock: (lessonId) => call("release_lock", { lessonId }),
    importAsset: (dir, kind) => call<ImportedAsset | null>("import_asset", { dir, kind }),
    pruneAssets: (dir, keep) => call<number>("prune_assets", { dir, keep }),
    searchImages: (query, page, clipart) => call<ImageHit[]>("search_images", { query, page, clipart }),
    searchImageCandidates: (query, clipart) => call<ImageCandidate[]>("search_image_candidates", { query, clipart }),
    importImageUrl: (dir, urls) => call<ImportedAsset>("import_image_url", { dir, urls }),
    // Sent as a raw body: JSON would inflate a photo several times over.
    importImageBytes: (dir, bytes) =>
      call<ImportedAsset>("import_image_bytes", bytes, { "x-lesson-dir": encodeURIComponent(dir) }),
    speakChinese: (dir, text) => call<ImportedAsset>("speak_chinese", { dir, text }),
    readAssetsData: (dir, files) => call<Record<string, string>>("read_assets_data", { dir, files }),
    saveExport: (html, fileName) => call<string | null>("save_export", { html, fileName }),
    pickLessonFile: () => call<PickedLesson | null>("pick_lesson_file"),
    copySiblingAssets: (dir, files) => call<string[]>("copy_sibling_assets", { dir, files }),
    writeAsset: (dir, file, bytes) =>
      call("write_asset", bytes, { "x-lesson-dir": encodeURIComponent(dir), "x-asset-file": encodeURIComponent(file) }),
    hanziStrokes: (character) => call<string[]>("hanzi_strokes", { character }),
    getPublishSettings: () => call<PublishSettings>("get_publish_settings"),
    setPublishSettings: (serverUrl, password) => call<PublishSettings>("set_publish_settings", { serverUrl, password }),
    publishAssets: (dir, files) => call<PublishedAssets>("publish_assets", { dir, files }),
    publishLesson: (lessonId, title, hanzi, html) => call<{ url: string }>("publish_lesson", { lessonId, title, hanzi, html }),
    publishAssignment: (exerciseId, payload) => call<{ url: string; resultsUrl: string }>("publish_assignment", { exerciseId, payload }),
    assetUrl: (dir, file) => {
      const sep = dir.includes("\\") ? "\\" : "/";
      return convertFileSrc(`${dir}${sep}${file.split("/").join(sep)}`);
    },
    setWindowTitle: (title) => getCurrentWindow().setTitle(title),
    setFullscreen: (on) => getCurrentWindow().setFullscreen(on),
    isFullscreen: () => getCurrentWindow().isFullscreen(),
    setMaximized: (on) => (on ? getCurrentWindow().maximize() : getCurrentWindow().unmaximize()),
    isMaximized: () => getCurrentWindow().isMaximized(),
    onCloseRequested(handler) {
      closeHandlers.add(handler);
      return () => void closeHandlers.delete(handler);
    },
  };
}

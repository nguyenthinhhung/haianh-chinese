import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  PersistenceError,
  type Draft,
  type ImageHit,
  type ImportedAsset,
  type PickedLesson,
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

export function createTauriPersistence(): Persistence {
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
    searchImages: (query, page) => call<ImageHit[]>("search_images", { query, page }),
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
    assetUrl: (dir, file) => {
      const sep = dir.includes("\\") ? "\\" : "/";
      return convertFileSrc(`${dir}${sep}${file.split("/").join(sep)}`);
    },
    setWindowTitle: (title) => getCurrentWindow().setTitle(title),
    setFullscreen: (on) => getCurrentWindow().setFullscreen(on),
    isFullscreen: () => getCurrentWindow().isFullscreen(),
    onCloseRequested(handler) {
      const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
        if (!(await handler())) event.preventDefault();
      });
      return () => void unlisten.then((f) => f());
    },
  };
}

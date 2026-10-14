import { folderNameFromTitle, uniqueFolderName } from "../core/fsNames";
import {
  PersistenceError,
  type Draft,
  type ImportedAsset,
  type LessonLocation,
  type Persistence,
} from "./persistence";

/**
 * Development stand-in used when the UI runs in a plain browser (`npm run dev`)
 * instead of inside Tauri. Lessons live in localStorage, assets only in memory.
 * It mimics the Rust contract (hash check, NFC names) closely enough to
 * exercise the UI; it is not a storage engine.
 */

const KEY = "ls-dev-library";
const ROOT = "/dev-library";

interface Stored {
  lessons: Record<string, { html: string; modifiedMs: number }>;
  drafts: Record<string, Draft>;
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // Fall through to an empty library.
  }
  return { lessons: {}, drafts: {} };
}

function save(s: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Quota or private mode: the dev library stays in memory for this tab.
  }
}

async function sha256(text: string | ArrayBuffer): Promise<string> {
  const data = typeof text === "string" ? new TextEncoder().encode(text) : text;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&amp;": "&" };

function titleOf(html: string): string | null {
  const m = /<title>([\s\S]*?)<\/title>/.exec(html);
  return m ? m[1]!.replace(/&(lt|gt|quot|#39|amp);/g, (e) => ENTITIES[e]!) : null;
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export function createBrowserPersistence(): Persistence {
  let state = load();
  const blobs = new Map<string, string>();
  const locks = new Set<string>();
  const folderOf = (dir: string) => dir.slice(ROOT.length + 1);

  return {
    kind: "browser",
    libraryDir: async () => ROOT,
    async listLessons(): Promise<LessonLocation[]> {
      return Object.entries(state.lessons)
        .filter(([, l]) => l.html)
        .map(([folderName, l]) => ({ dir: `${ROOT}/${folderName}`, folderName, title: titleOf(l.html), modifiedMs: l.modifiedMs }))
        .sort((a, b) => b.modifiedMs - a.modifiedMs);
    },
    async createLessonDir(name) {
      const folderName = uniqueFolderName(folderNameFromTitle(name), Object.keys(state.lessons));
      // Reserve the name; the first save fills it.
      state.lessons[folderName] = { html: "", modifiedMs: Date.now() };
      save(state);
      return { dir: `${ROOT}/${folderName}`, folderName, title: null, modifiedMs: Date.now() };
    },
    // Asset blobs are keyed by file name for the whole tab, so a copy sees them too.
    async duplicateLessonDir(_dir, name) {
      return this.createLessonDir(name);
    },
    async trashLesson(dir, lessonId) {
      if (lessonId && locks.has(lessonId)) throw new PersistenceError("locked", "Bài học đang được mở.");
      delete state.lessons[folderOf(dir)];
      if (lessonId) delete state.drafts[lessonId];
      save(state);
    },
    async readLesson(dir) {
      const lesson = state.lessons[folderOf(dir)];
      if (!lesson?.html) throw new PersistenceError("not-found", "Không tìm thấy lesson.html");
      return { html: lesson.html, hash: await sha256(lesson.html), modifiedMs: lesson.modifiedMs };
    },
    async writeLesson(dir, _lessonId, html, expectedHash) {
      state = load();
      const folder = folderOf(dir);
      const current = state.lessons[folder]?.html;
      if (expectedHash !== null && (!current || (await sha256(current)) !== expectedHash)) {
        throw new PersistenceError("conflict", "lesson.html đã bị thay đổi bên ngoài ứng dụng");
      }
      state.lessons[folder] = { html, modifiedMs: Date.now() };
      save(state);
      return { hash: await sha256(html) };
    },
    async writeDraft(lessonId, json) {
      state.drafts[lessonId] = { json, modifiedMs: Date.now() };
      save(state);
    },
    readDraft: async (lessonId) => state.drafts[lessonId] ?? null,
    async deleteDraft(lessonId) {
      delete state.drafts[lessonId];
      save(state);
    },
    async acquireLock(lessonId) {
      locks.add(lessonId);
      return true;
    },
    async releaseLock(lessonId) {
      locks.delete(lessonId);
    },
    async importAsset(_dir, kind): Promise<ImportedAsset | null> {
      const file = await pickFile(kind === "image" ? "image/png,image/jpeg,image/webp,image/gif" : "audio/*");
      if (!file) return null;
      const hash = (await sha256(await file.arrayBuffer())).slice(0, 12);
      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      const name = `assets/${kind === "image" ? "img" : "audio"}-${hash}.${ext}`;
      if (!blobs.has(name)) blobs.set(name, URL.createObjectURL(file));
      return { file: name, mime: file.type || "application/octet-stream" };
    },
    // Network features need the desktop app: the browser's CORS rules block them.
    async searchImages() {
      throw new PersistenceError("network", "Tìm ảnh chỉ có trong ứng dụng desktop.");
    },
    async importImageUrl() {
      throw new PersistenceError("network", "Tải ảnh từ web chỉ có trong ứng dụng desktop.");
    },
    async importImageBytes(_dir, bytes) {
      const hash = (await sha256(bytes.slice().buffer)).slice(0, 12);
      const name = `assets/img-${hash}.png`;
      if (!blobs.has(name)) blobs.set(name, URL.createObjectURL(new Blob([bytes.slice()], { type: "image/png" })));
      return { file: name, mime: "image/png" };
    },
    async speakChinese() {
      throw new PersistenceError("network", "Tạo giọng đọc chỉ có trong ứng dụng desktop.");
    },
    async readAssetsData(_dir, files) {
      const out: Record<string, string> = {};
      for (const file of files) {
        const url = blobs.get(file);
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        out[file] = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
      }
      return out;
    },
    // A browser cannot ask where to save; it downloads the file instead.
    async saveExport(html, fileName) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      return fileName;
    },
    async pickLessonFile() {
      const file = await pickFile(".html,.htm");
      return file ? { path: file.name, html: await file.text() } : null;
    },
    // A browser file picker cannot reach the folder around the chosen file.
    copySiblingAssets: async () => [],
    async writeAsset(_dir, file, bytes) {
      const type = file.endsWith(".mp3") ? "audio/mpeg" : "image/*";
      if (!blobs.has(file)) blobs.set(file, URL.createObjectURL(new Blob([bytes.slice()], { type })));
    },
    // Imported files only live for this tab; nothing on disk to clean.
    pruneAssets: async () => 0,
    assetUrl: (_dir, file) => blobs.get(file) ?? "",
    async setWindowTitle(title) {
      document.title = title;
    },
    async setFullscreen(on) {
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => {});
      if (!on && document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    },
    isFullscreen: async () => !!document.fullscreenElement,
    // A tab cannot wait for an async save before closing; the draft covers it.
    onCloseRequested: () => () => {},
  };
}

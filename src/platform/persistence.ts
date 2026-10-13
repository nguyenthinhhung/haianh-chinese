export interface LessonLocation {
  /** Absolute path of the lesson folder, as returned by the backend. */
  dir: string;
  /** Folder name, NFC-normalised. */
  folderName: string;
  /** Lesson title from the file; null when it cannot be read. */
  title: string | null;
  modifiedMs: number;
}

export interface LessonFile {
  html: string;
  /** SHA-256 of the file bytes, used to detect changes made outside the app. */
  hash: string;
  modifiedMs: number;
}

export interface Draft {
  json: string;
  modifiedMs: number;
}

/** One image search result. */
export interface ImageHit {
  /** Full-size image on its original site. */
  url: string;
  /** The search engine's small copy, used when the original refuses downloads. */
  thumbnailUrl: string;
  /** Preview as a data: URL. */
  thumbnail: string;
  sourcePage: string | null;
  title: string;
}

export interface ImportedAsset {
  /** Relative path inside the lesson folder, e.g. `assets/img-3f9a2c….webp`. */
  file: string;
  mime: string;
}

export type PersistenceErrorCode =
  | "conflict"
  | "not-found"
  | "invalid-path"
  | "unsupported-file"
  | "too-large"
  | "locked"
  | "network"
  | "io";

export class PersistenceError extends Error {
  constructor(
    readonly code: PersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}

/**
 * Everything that touches the disk. The Tauri implementation does the real
 * work in Rust (atomic writes, backups, locks); the browser one keeps lessons
 * in localStorage for UI development without the desktop shell.
 */
export interface Persistence {
  readonly kind: "tauri" | "browser";
  libraryDir(): Promise<string>;
  listLessons(): Promise<LessonLocation[]>;
  /** Creates a uniquely named folder (with `assets/`) for a new lesson. */
  createLessonDir(folderName: string): Promise<LessonLocation>;
  /** Creates a uniquely named folder holding copies of `dir`'s assets; the caller writes its lesson.html. */
  duplicateLessonDir(dir: string, folderName: string): Promise<LessonLocation>;
  /**
   * Moves a lesson folder to the Recycle Bin / Trash. Fails with `locked`
   * while the lesson is open elsewhere. `lessonId` is null for a folder whose
   * lesson cannot be read.
   */
  trashLesson(dir: string, lessonId: string | null): Promise<void>;
  readLesson(dir: string): Promise<LessonFile>;
  /**
   * Backs up the current file, then atomically replaces `lesson.html`.
   * Fails with `conflict` when the file on disk no longer has `expectedHash`;
   * pass `null` to skip that check (new lesson, or the teacher chose to overwrite).
   */
  writeLesson(dir: string, lessonId: string, html: string, expectedHash: string | null): Promise<{ hash: string }>;
  writeDraft(lessonId: string, json: string): Promise<void>;
  readDraft(lessonId: string): Promise<Draft | null>;
  deleteDraft(lessonId: string): Promise<void>;
  /** False when the lesson is already open in another window or process. */
  acquireLock(lessonId: string): Promise<boolean>;
  releaseLock(lessonId: string): Promise<void>;
  /** Lets the teacher pick a file and copies it into the lesson's `assets/`; null if cancelled. */
  importAsset(dir: string, kind: "image" | "audio"): Promise<ImportedAsset | null>;
  /** Searches the web for images (SafeSearch strict); `page` starts at 0. */
  searchImages(query: string, page: number): Promise<ImageHit[]>;
  /** Downloads an image into `assets/`, trying each URL in turn. */
  importImageUrl(dir: string, urls: string[]): Promise<ImportedAsset>;
  /** Stores pasted or dropped image bytes in `assets/`. */
  importImageBytes(dir: string, bytes: Uint8Array): Promise<ImportedAsset>;
  /** Creates an MP3 of Chinese text read aloud and stores it in `assets/`. */
  speakChinese(dir: string, text: string): Promise<ImportedAsset>;
  /** Deletes imported files in `assets/` other than `keep` (`assets/<name>` paths); returns how many. */
  pruneAssets(dir: string, keep: string[]): Promise<number>;
  /** URL the editor webview can load an asset from. */
  assetUrl(dir: string, file: string): string;
  setWindowTitle(title: string): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  isFullscreen(): Promise<boolean>;
  /**
   * Runs `handler` when the user closes the window; it resolves false to keep
   * the window open. Returns a function that removes the handler.
   */
  onCloseRequested(handler: () => Promise<boolean>): () => void;
}

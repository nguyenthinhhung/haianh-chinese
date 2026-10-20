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
export interface ImageCandidate {
  /** Full-size image on its original site. */
  url: string;
  /** The search engine's small copy, used when the original refuses downloads. */
  thumbnailUrl: string;
  sourcePage: string | null;
  title: string;
}

/** A search result with its preview, for the picture picker. */
export interface ImageHit extends ImageCandidate {
  /** Preview as a data: URL. */
  thumbnail: string;
}

/** A lesson file chosen from outside the library. */
export interface PickedLesson {
  path: string;
  html: string;
}

export interface ImportedAsset {
  /** Relative path inside the lesson folder, e.g. `assets/img-3f9a2c….webp`. */
  file: string;
  mime: string;
}

/** Where lessons are published on the web; the password itself never comes back from the backend. */
export interface PublishSettings {
  serverUrl: string | null;
  hasPassword: boolean;
}

export interface PublishedAssets {
  /** Published file name for each `assets/…` path that was read. */
  names: Record<string, string>;
  /** Paths that could not be read or are not a picture or sound. */
  missing: string[];
  uploaded: number;
}

export type PersistenceErrorCode =
  | "not-configured"
  | "unauthorized"
  | "conflict"
  | "not-found"
  | "invalid-path"
  | "unsupported-file"
  | "too-large"
  | "locked"
  | "network"
  | "rate-limited"
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
  searchImages(query: string, page: number, clipart: boolean): Promise<ImageHit[]>;
  /**
   * Results without previews, for filling pictures in the background. Searches
   * are cached and spaced out by the backend; "rate-limited" means stop for now.
   */
  searchImageCandidates(query: string, clipart: boolean): Promise<ImageCandidate[]>;
  /** Downloads an image into `assets/`, trying each URL in turn. */
  importImageUrl(dir: string, urls: string[]): Promise<ImportedAsset>;
  /** Stores pasted or dropped image bytes in `assets/`. */
  importImageBytes(dir: string, bytes: Uint8Array): Promise<ImportedAsset>;
  /** Stroke outlines of one Chinese character, in writing order, as SVG paths on a 1024-unit square. */
  hanziStrokes(character: string): Promise<string[]>;
  /** Creates an MP3 of Chinese text read aloud and stores it in `assets/`. */
  speakChinese(dir: string, text: string): Promise<ImportedAsset>;
  /** The lesson's asset files as data URLs keyed by `assets/…` path; unreadable files are left out. */
  readAssetsData(dir: string, files: string[]): Promise<Record<string, string>>;
  /** Asks where to save an exported lesson and writes it; the saved path, or null if cancelled. */
  saveExport(html: string, fileName: string): Promise<string | null>;
  /** Lets the teacher pick a lesson file from anywhere; null if cancelled. */
  pickLessonFile(): Promise<PickedLesson | null>;
  /** Copies files from the `assets/` folder beside the last picked lesson file; returns those copied. */
  copySiblingAssets(dir: string, files: string[]): Promise<string[]>;
  /** Writes one asset file (an image or audio carried inside an exported lesson). */
  writeAsset(dir: string, file: string, bytes: Uint8Array): Promise<void>;
  /** Deletes imported files in `assets/` other than `keep` (`assets/<name>` paths); returns how many. */
  pruneAssets(dir: string, keep: string[]): Promise<number>;
  getPublishSettings(): Promise<PublishSettings>;
  /** Saves the server address, and the password unless it is null (keep the stored one). */
  setPublishSettings(serverUrl: string, password: string | null): Promise<PublishSettings>;
  /** Uploads the files the server does not have yet; files are published under content-hash names. */
  publishAssets(dir: string, files: string[]): Promise<PublishedAssets>;
  /** Uploads the lesson page and returns its web address. */
  publishLesson(lessonId: string, title: string, html: string): Promise<{ url: string }>;
  /** URL the editor webview can load an asset from. */
  assetUrl(dir: string, file: string): string;
  setWindowTitle(title: string): Promise<void>;
  setFullscreen(on: boolean): Promise<void>;
  isFullscreen(): Promise<boolean>;
  /** Maximised, not full screen: the taskbar and the window's own buttons stay. */
  setMaximized(on: boolean): Promise<void>;
  isMaximized(): Promise<boolean>;
  /**
   * Runs `handler` when the user closes the window; it resolves false to keep
   * the window open. Returns a function that removes the handler.
   */
  onCloseRequested(handler: () => Promise<boolean>): () => void;
}

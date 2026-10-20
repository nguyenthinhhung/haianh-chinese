import { produce } from "immer";
import { parseLessonHtml, parseLessonJson, readAssetData, serializeLessonHtml, type ParseResult } from "../core/codec";
import { createLesson, removeUnusedAssets, setTitle, touchUpdatedAt } from "../core/document";
import { folderNameFromTitle } from "../core/fsNames";
import { newId } from "../core/ids";
import type { LessonDocument, Slide } from "../core/schema";
import { formatIssue, validateLesson } from "../core/validate";
import type { LessonLocation } from "../platform/persistence";
import { createFromSample, type SampleId } from "../samples";
import type { Services } from "./services";

/** A lesson opened for editing: where it lives and the file version it came from. */
/** The AI's picture search words, by `slotKey`, and whether to look for drawings. */
export interface ImageFillRequest {
  queries: Map<string, string>;
  clipart: boolean;
}

export interface OpenLesson {
  dir: string;
  doc: LessonDocument;
  /** Hash of `lesson.html` as last read or written, for detecting outside changes. */
  hash: string;
  /** Unsaved edits recovered from a draft; the session starts from these, marked unsaved. */
  recovered?: LessonDocument;
  /** Message shown when the editor opens, e.g. files missing from an imported lesson. */
  notice?: string;
  /** Pictures to search for as soon as the editor opens (a lesson just made by AI). */
  imageFill?: ImageFillRequest;
}

/** Edits from an earlier session that never reached `lesson.html`. */
export interface PendingDraft {
  doc: LessonDocument;
  modifiedMs: number;
}

export type OpenResult =
  | { ok: true; lesson: OpenLesson; draft?: PendingDraft }
  | { ok: false; message: string; details: string[] };

/** HTML as stored in the library: assets referenced relative to the lesson folder. */
export function libraryHtml(doc: LessonDocument, services: Services): string {
  return serializeLessonHtml(doc, { templates: services.templates, themes: services.themes, assetUrl: (a) => a.file });
}

export async function openLesson(dir: string, services: Services): Promise<OpenResult> {
  const file = await services.persistence.readLesson(dir);
  const parsed: ParseResult = parseLessonHtml(file.html, services.templates);
  if (!parsed.ok) return { ok: false, message: parsed.message, details: parsed.details };
  // Migrated lessons are written back on the first save; the backup taken then
  // keeps the original version.
  const lesson = { dir, doc: parsed.doc, hash: file.hash };
  const draft = await findDraft(lesson.doc, file.modifiedMs, services);
  return draft ? { ok: true, lesson, draft } : { ok: true, lesson };
}

/**
 * Returns the lesson's draft when it holds edits newer than the file. Drafts
 * that are older or identical are stale leftovers and are deleted; a draft
 * that no longer validates is ignored rather than offered.
 */
async function findDraft(fileDoc: LessonDocument, fileModifiedMs: number, services: Services): Promise<PendingDraft | undefined> {
  const draft = await services.persistence.readDraft(fileDoc.id);
  if (!draft) return undefined;
  const parsed = parseLessonJson(draft.json, services.templates);
  if (!parsed.ok || parsed.doc.id !== fileDoc.id) return undefined;
  if (draft.modifiedMs <= fileModifiedMs || JSON.stringify(parsed.doc) === JSON.stringify(fileDoc)) {
    await services.persistence.deleteDraft(fileDoc.id);
    return undefined;
  }
  return { doc: parsed.doc, modifiedMs: draft.modifiedMs };
}

export async function createLessonFromSample(
  sample: SampleId,
  title: string,
  services: Services,
  themeId?: string,
): Promise<OpenLesson> {
  const doc = createFromSample(sample, title, services.appVersion, themeId);
  const location = await services.persistence.createLessonDir(folderNameFromTitle(title));
  const { hash } = await services.persistence.writeLesson(location.dir, doc.id, libraryHtml(doc, services), null);
  return { dir: location.dir, doc, hash };
}

/** Reads a lesson for a Library action; throws with a readable message when it cannot. */
async function readForAction(dir: string, services: Services) {
  const file = await services.persistence.readLesson(dir);
  const parsed = parseLessonHtml(file.html, services.templates);
  if (!parsed.ok) throw new Error(parsed.message);
  return { doc: parsed.doc, file };
}

/**
 * Changes a lesson's title from the Library. The folder keeps the name it
 * was given at creation. Refused while the lesson is open elsewhere or has
 * unsaved edits in a draft: writing the file would make that draft look stale.
 */
export async function renameLesson(dir: string, title: string, services: Services): Promise<void> {
  const { persistence } = services;
  const { doc, file } = await readForAction(dir, services);
  if (!(await persistence.acquireLock(doc.id))) throw new Error("Bài học đang được mở ở một cửa sổ khác.");
  try {
    if (await findDraft(doc, file.modifiedMs, services)) {
      throw new Error("Bài có thay đổi chưa lưu. Hãy mở bài để khôi phục trước khi đổi tên.");
    }
    const renamed = touchUpdatedAt(setTitle(doc, title), services.appVersion);
    await persistence.writeLesson(dir, doc.id, libraryHtml(renamed, services), file.hash);
  } finally {
    await persistence.releaseLock(doc.id);
  }
}

export const COPY_SUFFIX = " (bản sao)";

/** Copies a lesson, with its assets, under a new ID so the two never share drafts, backups or locks. */
export async function duplicateLesson(dir: string, services: Services): Promise<LessonLocation> {
  const { doc } = await readForAction(dir, services);
  const now = new Date().toISOString();
  const copy = produce(doc, (d) => {
    d.id = newId("l");
    d.title = doc.title + COPY_SUFFIX;
    d.metadata = { createdAt: now, updatedAt: now, appVersion: services.appVersion };
  });
  const location = await services.persistence.duplicateLessonDir(dir, folderNameFromTitle(copy.title));
  await services.persistence.writeLesson(location.dir, copy.id, libraryHtml(copy, services), null);
  return location;
}

/** Moves a lesson to the Recycle Bin / Trash; an unreadable lesson can still be removed. */
export async function deleteLesson(dir: string, services: Services): Promise<void> {
  let lessonId: string | null = null;
  try {
    lessonId = (await readForAction(dir, services)).doc.id;
  } catch {
    // Unreadable or invalid: move the folder anyway.
  }
  await services.persistence.trashLesson(dir, lessonId);
}

/** Exports above this size get a warning: slow to copy and to open on old computers. */
export const EXPORT_WARN_BYTES = 50 * 1024 * 1024;

export interface ExportResult {
  path: string;
  bytes: number;
  /** Asset files that could not be read and are missing from the export. */
  missing: string[];
}

/**
 * Writes the lesson as one HTML file that presents on any computer without
 * the app: CSS, runtime, font, pictures and sounds all inside. Null if the
 * teacher cancels the save dialog.
 */
export async function exportLesson(dir: string, doc: LessonDocument, services: Services): Promise<ExportResult | null> {
  const valid = validateLesson(doc, services.templates);
  if (!valid.ok) throw new Error(`Bài có chỗ chưa hợp lệ — ${formatIssue(valid.issues[0]!, doc, services.templates)}`);
  const lesson = removeUnusedAssets(valid.doc, services.templates);
  const files = lesson.assets.map((a) => a.file);
  const data = await services.persistence.readAssetsData(dir, files);
  const env = { templates: services.templates, themes: services.themes, assetUrl: (a: { file: string }) => a.file };
  const html = serializeLessonHtml(lesson, env, { assets: data });
  const path = await services.persistence.saveExport(html, `${folderNameFromTitle(lesson.title)}.html`);
  if (!path) return null;
  return { path, bytes: new Blob([html]).size, missing: files.filter((f) => !data[f]) };
}

export interface PublishResult {
  url: string;
  /** Files sent this time; the others were already on the server. */
  uploaded: number;
  /** Asset files that could not be read and are missing from the web page. */
  missing: string[];
}

/**
 * Publishes the lesson to the teacher's web server: files first, then a page
 * whose pictures and sounds point at the published copies.
 */
export async function publishLesson(dir: string, doc: LessonDocument, services: Services): Promise<PublishResult> {
  const valid = validateLesson(doc, services.templates);
  if (!valid.ok) throw new Error(`Bài có chỗ chưa hợp lệ — ${formatIssue(valid.issues[0]!, doc, services.templates)}`);
  const lesson = removeUnusedAssets(valid.doc, services.templates);
  const assets = await services.persistence.publishAssets(dir, lesson.assets.map((a) => a.file));
  const env = {
    templates: services.templates,
    themes: services.themes,
    assetUrl: (a: { file: string }) => {
      const name = assets.names[a.file];
      return name ? `/f/${name}` : a.file;
    },
  };
  const html = serializeLessonHtml(lesson, env);
  const { url } = await services.persistence.publishLesson(lesson.id, lesson.title, html);
  return { url, uploaded: assets.uploaded, missing: assets.missing };
}

function dataUrlBytes(url: string): Uint8Array {
  return Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
}

export type ImportFileResult =
  | { ok: true; lesson: OpenLesson; missing: string[] }
  | { ok: false; message: string; details: string[] };

/**
 * Brings a lesson file from outside the library in as a new lesson: an
 * exported file (media inside it) or a lesson.html from another computer
 * (media in the assets folder beside it). Only the embedded JSON is read.
 * The copy always gets a new ID so it never shares drafts or locks with a
 * lesson already in the library. Null if the teacher cancels.
 */
export async function importLessonFile(services: Services): Promise<ImportFileResult | null> {
  const { persistence } = services;
  const picked = await persistence.pickLessonFile();
  if (!picked) return null;
  const parsed = parseLessonHtml(picked.html, services.templates);
  if (!parsed.ok) return { ok: false, message: parsed.message, details: parsed.details };

  const now = new Date().toISOString();
  const doc = produce(parsed.doc, (d) => {
    d.id = newId("l");
    d.metadata = { ...d.metadata, updatedAt: now, appVersion: services.appVersion };
  });
  const location = await persistence.createLessonDir(folderNameFromTitle(doc.title));
  const embedded = readAssetData(picked.html);
  const fromFolder: string[] = [];
  for (const asset of doc.assets) {
    const data = embedded[asset.file];
    if (data) await persistence.writeAsset(location.dir, asset.file, dataUrlBytes(data));
    else fromFolder.push(asset.file);
  }
  const copied = fromFolder.length ? await persistence.copySiblingAssets(location.dir, fromFolder) : [];
  const { hash } = await persistence.writeLesson(location.dir, doc.id, libraryHtml(doc, services), null);
  return {
    ok: true,
    lesson: { dir: location.dir, doc, hash },
    missing: fromFolder.filter((f) => !copied.includes(f)),
  };
}

/** Creates a lesson in the library from slides imported from an AI reply. */
export async function createLessonFromSlides(
  title: string,
  slides: Slide[],
  services: Services,
  themeId?: string,
): Promise<OpenLesson> {
  const doc = { ...createLesson({ title, appVersion: services.appVersion, ...(themeId ? { themeId } : {}) }), slides };
  const location = await services.persistence.createLessonDir(folderNameFromTitle(title));
  const { hash } = await services.persistence.writeLesson(location.dir, doc.id, libraryHtml(doc, services), null);
  return { dir: location.dir, doc, hash };
}

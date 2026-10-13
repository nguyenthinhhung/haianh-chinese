import { produce } from "immer";
import { parseLessonHtml, parseLessonJson, serializeLessonHtml, type ParseResult } from "../core/codec";
import { setTitle, touchUpdatedAt } from "../core/document";
import { folderNameFromTitle } from "../core/fsNames";
import { newId } from "../core/ids";
import type { LessonDocument } from "../core/schema";
import type { LessonLocation } from "../platform/persistence";
import { createFromSample, type SampleId } from "../samples";
import type { Services } from "./services";

/** A lesson opened for editing: where it lives and the file version it came from. */
export interface OpenLesson {
  dir: string;
  doc: LessonDocument;
  /** Hash of `lesson.html` as last read or written, for detecting outside changes. */
  hash: string;
  /** Unsaved edits recovered from a draft; the session starts from these, marked unsaved. */
  recovered?: LessonDocument;
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
): Promise<OpenLesson> {
  const doc = createFromSample(sample, title, services.appVersion);
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

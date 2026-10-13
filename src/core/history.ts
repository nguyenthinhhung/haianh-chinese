import type { LessonDocument } from "./schema";

/**
 * Undo/redo over immutable document snapshots. Commands return new documents
 * built with Immer, so unchanged parts are shared between snapshots and a step
 * costs only what it changed.
 */
export interface History {
  readonly past: readonly LessonDocument[];
  readonly present: LessonDocument;
  readonly future: readonly LessonDocument[];
  /** Key and time of the last recorded step, for merging runs of typing. */
  readonly last?: { key: string; at: number };
}

export const HISTORY_LIMIT = 200;
/** Edits with the same key closer together than this become one undo step. */
export const COALESCE_MS = 1000;

export function createHistory(doc: LessonDocument): History {
  return { past: [], present: doc, future: [] };
}

/**
 * Records `next` as a new step. With `coalesceKey`, an edit that follows
 * another edit of the same key within COALESCE_MS replaces it instead, so
 * typing a word is undone in one go.
 */
export function record(h: History, next: LessonDocument, coalesceKey?: string, now = Date.now()): History {
  if (next === h.present) return h;
  const last = coalesceKey ? { key: coalesceKey, at: now } : undefined;
  if (coalesceKey && h.last?.key === coalesceKey && now - h.last.at < COALESCE_MS && h.future.length === 0) {
    return { ...h, present: next, last };
  }
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [], last };
}

/** Swaps the current snapshot without adding a step (e.g. metadata stamped on save). */
export function replacePresent(h: History, doc: LessonDocument): History {
  return { ...h, present: doc, last: undefined };
}

export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  if (!prev) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  const [next, ...rest] = h.future;
  if (!next) return h;
  return { past: [...h.past, h.present], present: next, future: rest };
}

export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;

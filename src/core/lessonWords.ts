import type { LessonDocument } from "./schema";
import type { EditorFieldSpec } from "./template";
import type { TemplateRegistry } from "./templateRegistry";

/** A word rather than a sentence: Chinese characters only, at most this many. */
const MAX_WORD_CHARS = 6;
const WORD = new RegExp(`^\\p{Script=Han}{1,${MAX_WORD_CHARS}}$`, "u");

function collect(content: unknown, fields: EditorFieldSpec, out: Set<string>): void {
  if (!content || typeof content !== "object" || Array.isArray(content)) return;
  const obj = content as Record<string, unknown>;
  for (const f of fields) {
    const value = obj[f.key];
    if (f.kind === "list" && Array.isArray(value)) value.forEach((item) => collect(item, f.fields, out));
    if (f.kind === "text" && f.lang === "zh" && typeof value === "string" && WORD.test(value.trim())) out.add(value.trim());
  }
}

/**
 * The Chinese words a lesson teaches or uses, in slide order: every Chinese
 * field that holds a short run of characters (vocabulary, cards, summary
 * words…). Sentences, with punctuation or more characters, are left out.
 */
export function lessonWords(doc: LessonDocument, registry: TemplateRegistry): string[] {
  const out = new Set<string>();
  for (const slide of doc.slides) {
    const template = registry.get(slide.type);
    if (template) collect(slide.content, template.editor, out);
  }
  return [...out];
}

/** A word taught somewhere in the lesson, with what the lesson says about it. */
export interface LessonWord {
  hanzi: string;
  pinyin: string;
  meaning: string;
  image?: string;
  audio?: string;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function gather(content: unknown, fields: EditorFieldSpec, out: Map<string, LessonWord>): void {
  if (!content || typeof content !== "object" || Array.isArray(content)) return;
  const obj = content as Record<string, unknown>;
  const hanzi = text(obj.hanzi);
  if (WORD.test(hanzi)) {
    const found: LessonWord = { hanzi, pinyin: text(obj.pinyin), meaning: text(obj.meaning) };
    if (text(obj.image)) found.image = text(obj.image);
    if (text(obj.audio)) found.audio = text(obj.audio);
    const known = out.get(hanzi);
    // The first slide naming a word wins; later ones fill in what it left out.
    out.set(hanzi, known ? { ...found, ...Object.fromEntries(Object.entries(known).filter(([, v]) => v)) } : found);
  }
  for (const f of fields) {
    const value = obj[f.key];
    if (f.kind === "list" && Array.isArray(value)) value.forEach((item) => gather(item, f.fields, out));
  }
}

/**
 * The words of a lesson with their pinyin, meaning, picture and sound, in
 * slide order, leaving out the slide `exceptSlideId` (the one being filled).
 */
export function lessonWordEntries(doc: LessonDocument, registry: TemplateRegistry, exceptSlideId?: string): LessonWord[] {
  const out = new Map<string, LessonWord>();
  for (const slide of doc.slides) {
    if (slide.id === exceptSlideId) continue;
    const template = registry.get(slide.type);
    if (template) gather(slide.content, template.editor, out);
  }
  return [...out.values()];
}

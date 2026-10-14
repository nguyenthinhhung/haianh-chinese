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

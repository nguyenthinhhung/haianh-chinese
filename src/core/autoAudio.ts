import { addAsset, setSlideField } from "./document";
import { getIn, type Path } from "./fields";
import type { LessonDocument, Slide } from "./schema";
import type { EditorFieldSpec } from "./template";
import type { TemplateRegistry } from "./templateRegistry";

/**
 * Pronunciation filled in without the teacher asking for each word: every
 * `autoAudio` slot whose word or sentence has Chinese text gets it read aloud.
 * Unlike pictures there is nothing to choose between, so nothing is marked
 * for review.
 */

export interface AudioJob {
  slideId: string;
  path: Path;
  /** Path of the text that is read; the job is dropped if it changed meanwhile. */
  textPath: Path;
  text: string;
}

const HAN = /\p{Script=Han}/u;

function walk(content: unknown, fields: EditorFieldSpec, base: Path, slideId: string, out: AudioJob[]) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return;
  const obj = content as Record<string, unknown>;
  for (const field of fields) {
    if (field.when && !field.when(obj)) continue;
    if (field.kind === "list" && Array.isArray(obj[field.key])) {
      (obj[field.key] as unknown[]).forEach((item, i) => walk(item, field.fields, [...base, field.key, i], slideId, out));
    }
    if (field.kind !== "asset" || field.assetKind !== "audio" || !field.autoAudio || !field.speakFrom || obj[field.key]) continue;
    const text = obj[field.speakFrom];
    if (typeof text !== "string" || !HAN.test(text)) continue;
    out.push({ slideId, path: [...base, field.key], textPath: [...base, field.speakFrom], text: text.trim() });
  }
}

/** Empty pronunciation slots of `slides`, each with the Chinese text to read. */
export function audioJobs(slides: readonly Slide[], registry: TemplateRegistry): AudioJob[] {
  const out: AudioJob[] = [];
  for (const slide of slides) {
    const template = registry.get(slide.type);
    if (template) walk(slide.content, template.editor, [], slide.id, out);
  }
  return out;
}

/**
 * Puts the recording in its slot. Leaves `doc` as it is when the slot is gone,
 * already has a sound, or its text changed while the recording was made, so
 * it can be applied to every snapshot of the undo history.
 */
export function fillAudioSlot(doc: LessonDocument, job: AudioJob, sound: { file: string; mime: string }): LessonDocument {
  const slide = doc.slides.find((s) => s.id === job.slideId);
  if (!slide || getIn(slide.content, job.path)) return doc;
  const text = getIn(slide.content, job.textPath);
  if (typeof text !== "string" || text.trim() !== job.text) return doc;
  const added = addAsset(doc, { file: sound.file, kind: "audio", mime: sound.mime });
  return setSlideField(added.doc, job.slideId, job.path, added.assetId);
}

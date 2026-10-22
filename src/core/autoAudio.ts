import { addAsset, setSlideField } from "./document";
import { QUESTION_KINDS, setExerciseField } from "./exercise";
import type { Exercise } from "./exerciseSchema";
import { getIn, type Path } from "./fields";
import type { LessonDocument, Slide } from "./schema";
import type { EditorFieldSpec } from "./template";
import type { TemplateRegistry } from "./templateRegistry";

/**
 * Pronunciation filled in without the teacher asking for each word: every
 * `autoAudio` slot whose word or sentence has Chinese text gets it read aloud,
 * and so does every listening part of an exercise whose words are written
 * out. Unlike pictures there is nothing to choose between, so nothing is
 * marked for review.
 */

export interface AudioJob {
  /** Whether the slot is in a slide's content or in an exercise. */
  owner: "slide" | "exercise";
  /** ID of that slide or exercise. */
  ownerId: string;
  path: Path;
  /** Path of the text that is read; the job is dropped if it changed meanwhile. */
  textPath: Path;
  text: string;
}

const HAN = /\p{Script=Han}/u;

/**
 * The words to say: speaker labels opening a turn ("男：", "A:", "王兰：")
 * are left out, since the voice would read them aloud too.
 */
export function speechText(text: string): string {
  return text.replace(/(^|[\n。！？!?]\s*)(?:[A-Z]|\p{Script=Han}{1,3})\s*[：:]\s*/gu, "$1").trim();
}

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
    out.push({ owner: "slide", ownerId: slideId, path: [...base, field.key], textPath: [...base, field.speakFrom], text: text.trim() });
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
 * Recordings an exercise's listening parts lack: the part's own, read from
 * its words, and each question's, read from what its form reads aloud.
 * Reading and writing parts never get one; hearing them would be a hint.
 */
export function exerciseAudioJobs(exercise: Exercise): AudioJob[] {
  const out: AudioJob[] = [];
  const add = (path: Path, textPath: Path, slot: unknown, text: unknown) => {
    if (!slot && typeof text === "string" && HAN.test(text)) out.push({ owner: "exercise", ownerId: exercise.id, path, textPath, text: text.trim() });
  };
  exercise.parts.forEach((part, p) => {
    if (part.skill !== "listening") return;
    add(["parts", p, "audio"], ["parts", p, "transcript"], part.audio, part.transcript);
    part.questions.forEach((q, i) => {
      const field = QUESTION_KINDS[q.type].editor.find((f) => f.kind === "asset" && f.assetKind === "audio");
      if (field?.kind !== "asset" || !field.speakFrom) return;
      const values = q as unknown as Record<string, unknown>;
      const at: Path = ["parts", p, "questions", i];
      add([...at, field.key], [...at, field.speakFrom], values[field.key], values[field.speakFrom]);
    });
  });
  return out;
}

/**
 * Puts the recording in its slot. Leaves `doc` as it is when the slot is gone,
 * already has a sound, or its text changed while the recording was made, so
 * it can be applied to every snapshot of the undo history.
 */
export function fillAudioSlot(doc: LessonDocument, job: AudioJob, sound: { file: string; mime: string }): LessonDocument {
  const holder = job.owner === "slide" ? doc.slides.find((s) => s.id === job.ownerId)?.content : doc.exercises.find((e) => e.id === job.ownerId);
  if (!holder || getIn(holder, job.path)) return doc;
  const text = getIn(holder, job.textPath);
  if (typeof text !== "string" || text.trim() !== job.text) return doc;
  const added = addAsset(doc, { file: sound.file, kind: "audio", mime: sound.mime });
  return job.owner === "slide"
    ? setSlideField(added.doc, job.ownerId, job.path, added.assetId)
    : setExerciseField(added.doc, job.ownerId, job.path, added.assetId);
}

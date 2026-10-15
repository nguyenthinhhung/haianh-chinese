import { produce } from "immer";
import type { LessonDocument } from "./schema";

/**
 * Stroke order for a slide's "write" character is fetched once and kept in
 * the slide (`strokes`, plus `strokesFor` naming the character they belong
 * to), so presenting and exported files never need the network.
 */

export interface StrokeJob {
  slideId: string;
  character: string;
}

interface WithStrokes {
  write?: unknown;
  strokes?: unknown;
  strokesFor?: unknown;
}

const HAN = /^\p{Script=Han}$/u;

/** Slides whose character to write has no strokes yet, or strokes of another character. */
export function strokeJobs(doc: LessonDocument): StrokeJob[] {
  const jobs: StrokeJob[] = [];
  for (const slide of doc.slides) {
    const c = slide.content as WithStrokes | null;
    if (!c || typeof c !== "object" || !("strokes" in c)) continue;
    const character = typeof c.write === "string" ? c.write.trim() : "";
    if (HAN.test(character) && c.strokesFor !== character) jobs.push({ slideId: slide.id, character });
  }
  return jobs;
}

/** Puts fetched strokes in place, unless the slide now asks for another character. */
export function fillStrokes(doc: LessonDocument, job: StrokeJob, strokes: string[]): LessonDocument {
  const index = doc.slides.findIndex((s) => s.id === job.slideId);
  const content = doc.slides[index]?.content as WithStrokes | undefined;
  if (index < 0 || !content || typeof content.write !== "string" || content.write.trim() !== job.character) return doc;
  return produce(doc, (d) => {
    const c = d.slides[index]!.content as WithStrokes;
    c.strokes = strokes;
    c.strokesFor = job.character;
  });
}

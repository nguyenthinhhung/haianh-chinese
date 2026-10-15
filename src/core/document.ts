import { produce, type Draft } from "immer";
import { blankContent } from "./blank";
import { collectAssetRefs, type Path } from "./fields";
import { newId } from "./ids";
import { SCHEMA_VERSION, type Asset, type LessonDocument, type LessonSettings, type Slide } from "./schema";
import type { LessonWordLike } from "./template";
import type { TemplateRegistry } from "./templateRegistry";

/**
 * Commands: every edit to a lesson is one of these pure functions, so the UI
 * never mutates a document and history can record each step.
 */

export interface NewLessonOptions {
  title: string;
  themeId?: string;
  appVersion: string;
  now?: Date;
}

export function createLesson({ title, themeId = "classic", appVersion, now = new Date() }: NewLessonOptions): LessonDocument {
  const ts = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId("l"),
    title,
    script: "simplified",
    theme: { id: themeId },
    settings: { sound: true, animations: true, hanziFont: "sans", pinyin: true },
    slides: [],
    assets: [],
    metadata: { createdAt: ts, updatedAt: ts, appVersion },
  };
}

function slideIndex(doc: LessonDocument | Draft<LessonDocument>, slideId: string): number {
  const i = doc.slides.findIndex((s) => s.id === slideId);
  if (i < 0) throw new Error(`Slide ${slideId} not found`);
  return i;
}

/**
 * Inserts a new slide of `type` after `afterSlideId` (or at the end) and
 * returns its ID. The slide starts empty for the teacher to fill in; `sample`
 * gives it the template's sample content instead.
 */
export function addSlide(
  doc: LessonDocument,
  registry: TemplateRegistry,
  type: string,
  afterSlideId?: string,
  { sample = false }: { sample?: boolean } = {},
): { doc: LessonDocument; slideId: string } {
  const template = registry.require(type);
  const slide: Slide = { id: newId("s"), type, content: sample ? template.defaults() : blankContent(template) };
  const next = produce(doc, (d) => {
    const at = afterSlideId ? slideIndex(d, afterSlideId) + 1 : d.slides.length;
    d.slides.splice(at, 0, slide);
  });
  return { doc: next, slideId: slide.id };
}

/**
 * Adds slides (e.g. imported from an AI reply) as one step: after
 * `afterSlideId`, so a teacher can slot them into the middle of a lesson, or
 * at the end.
 */
export function insertSlides(doc: LessonDocument, slides: Slide[], afterSlideId?: string): LessonDocument {
  if (!slides.length) return doc;
  return produce(doc, (d) => {
    const at = afterSlideId ? slideIndex(d, afterSlideId) + 1 : d.slides.length;
    d.slides.splice(at, 0, ...structuredClone(slides));
  });
}

export function removeSlide(doc: LessonDocument, slideId: string): LessonDocument {
  return produce(doc, (d) => {
    d.slides.splice(slideIndex(d, slideId), 1);
  });
}

export function duplicateSlide(doc: LessonDocument, slideId: string): { doc: LessonDocument; slideId: string } {
  const id = newId("s");
  const next = produce(doc, (d) => {
    const i = slideIndex(d, slideId);
    const copy = structuredClone(doc.slides[i]!);
    d.slides.splice(i + 1, 0, { ...copy, id });
  });
  return { doc: next, slideId: id };
}

export function moveSlide(doc: LessonDocument, slideId: string, toIndex: number): LessonDocument {
  return produce(doc, (d) => {
    const from = slideIndex(d, slideId);
    const to = Math.max(0, Math.min(d.slides.length - 1, toIndex));
    if (from === to) return;
    const [slide] = d.slides.splice(from, 1);
    d.slides.splice(to, 0, slide!);
  });
}

/**
 * Sets one value inside a slide's content; `undefined` removes the key so
 * cleared optional fields leave no trace in the JSON.
 */
export function setSlideField(doc: LessonDocument, slideId: string, path: Path, value: unknown): LessonDocument {
  if (path.length === 0) throw new Error("Empty path");
  return produce(doc, (d) => {
    const slide = d.slides[slideIndex(d, slideId)]!;
    let target = slide.content as Record<string | number, unknown>;
    for (const seg of path.slice(0, -1)) {
      const child = target[seg];
      if (child === null || typeof child !== "object") throw new Error(`Invalid content path ${path.join(".")}`);
      target = child as Record<string | number, unknown>;
    }
    const last = path[path.length - 1]!;
    if (value === undefined && !Array.isArray(target)) delete target[last];
    else target[last] = value;
  });
}

export function setSlideNotes(doc: LessonDocument, slideId: string, notes: string): LessonDocument {
  return produce(doc, (d) => {
    const slide = d.slides[slideIndex(d, slideId)]!;
    if (notes) slide.notes = notes;
    else delete slide.notes;
  });
}

export function setTitle(doc: LessonDocument, title: string): LessonDocument {
  return produce(doc, (d) => {
    d.title = title;
  });
}

export function setTheme(doc: LessonDocument, themeId: string): LessonDocument {
  return produce(doc, (d) => {
    d.theme = { id: themeId };
  });
}

export function setSettings(doc: LessonDocument, settings: Partial<LessonSettings>): LessonDocument {
  return produce(doc, (d) => {
    Object.assign(d.settings, settings);
  });
}

/** Registers an imported file; the same file is only ever listed once. */
export function addAsset(doc: LessonDocument, asset: Omit<Asset, "id">): { doc: LessonDocument; assetId: string } {
  const existing = doc.assets.find((a) => a.file === asset.file);
  if (existing) return { doc, assetId: existing.id };
  const id = newId("a");
  return {
    doc: produce(doc, (d) => {
      d.assets.push({ ...asset, id });
    }),
    assetId: id,
  };
}

/**
 * Drops asset entries no slide refers to any more. Run when a lesson is
 * closed, not while editing: undo may bring a reference back.
 */
export function removeUnusedAssets(doc: LessonDocument, registry: TemplateRegistry): LessonDocument {
  const used = new Set(
    doc.slides.flatMap((s) => collectAssetRefs(s.content, registry.require(s.type).editor).map((r) => r.assetId)),
  );
  if (doc.assets.every((a) => used.has(a.id))) return doc;
  return produce(doc, (d) => {
    d.assets = d.assets.filter((a) => used.has(a.id));
  });
}

export function touchUpdatedAt(doc: LessonDocument, appVersion: string, now = new Date()): LessonDocument {
  return produce(doc, (d) => {
    d.metadata.updatedAt = now.toISOString();
    d.metadata.appVersion = appVersion;
  });
}

/** Replaces a slide's whole content, e.g. with the template's sample or an empty one. */
export function setSlideContent(doc: LessonDocument, slideId: string, content: unknown): LessonDocument {
  return produce(doc, (d) => {
    d.slides[slideIndex(d, slideId)]!.content = structuredClone(content);
  });
}

/**
 * Fills a slide's word list with the lesson's words from other slides: its
 * filled items stay, empty ones give way, and words it already has are not
 * repeated. Returns how many words were added.
 */
export function fillFromLessonWords(
  doc: LessonDocument,
  registry: TemplateRegistry,
  slideId: string,
  words: LessonWordLike[],
): { doc: LessonDocument; added: number } {
  const slide = doc.slides[slideIndex(doc, slideId)]!;
  const template = registry.require(slide.type);
  const spec = template.fromWords;
  const field = template.editor.find((f) => f.key === spec?.list);
  if (!spec || field?.kind !== "list") return { doc, added: 0 };
  const content = slide.content as Record<string, unknown>;
  const current = Array.isArray(content[spec.list]) ? (content[spec.list] as unknown[]) : [];
  // An item still as the "+" button made it holds nothing yet.
  const blank = JSON.stringify(field.newItem());
  const filled = current.filter((item) => JSON.stringify(item) !== blank);
  const present = JSON.stringify(filled);
  const fresh = words.filter((w) => !present.includes(`"${w.hanzi}"`)).map((w) => spec.item(w));
  const next = [...filled, ...fresh].slice(0, spec.max);
  const added = next.length - filled.length;
  if (!added) return { doc, added: 0 };
  return { doc: setSlideField(doc, slideId, [spec.list], next), added };
}

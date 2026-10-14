import { produce } from "immer";
import { addAsset, setSlideField } from "./document";
import { getIn, type Path } from "./fields";
import type { Asset, LessonDocument, Slide } from "./schema";
import type { EditorFieldSpec } from "./template";
import type { TemplateRegistry } from "./templateRegistry";

/**
 * Pictures filled in without the teacher choosing them: after an AI import,
 * or when asked to fill every empty slot. Each one is marked for review until
 * the teacher keeps or swaps it.
 */

/** A picture slot a slide relies on (`autoImage` in the template). */
export interface ImageSlot {
  slideId: string;
  path: Path;
  /** Asset ID in the slot, if any. */
  assetId?: string;
  /** Path and text of the word the picture shows (its first non-empty `searchFrom` field). */
  anchorPath: Path;
  anchor: string;
}

export interface ImageJob {
  slideId: string;
  path: Path;
  anchorPath: Path;
  anchor: string;
  /** Search words: the AI's English keyword when there is one, otherwise the word itself. */
  query: string;
  clipart: boolean;
}

export interface FoundPicture {
  file: string;
  mime: string;
  source?: string;
}

export const slotKey = (slideId: string, path: Path) => `${slideId}:${path.join(".")}`;

function walk(content: unknown, fields: EditorFieldSpec, base: Path, slideContent: unknown, slideId: string, out: ImageSlot[]) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return;
  const obj = content as Record<string, unknown>;
  for (const field of fields) {
    if (field.when && !field.when(obj)) continue;
    if (field.kind === "list" && Array.isArray(obj[field.key])) {
      (obj[field.key] as unknown[]).forEach((item, i) => walk(item, field.fields, [...base, field.key, i], slideContent, slideId, out));
    }
    if (field.kind !== "asset" || field.assetKind !== "image" || !field.autoImage) continue;
    if (typeof field.autoImage === "function" && !field.autoImage(slideContent)) continue;
    const anchorKey = (field.searchFrom ?? []).find((k) => typeof obj[k] === "string" && (obj[k] as string).trim());
    if (!anchorKey) continue;
    const value = obj[field.key];
    out.push({
      slideId,
      path: [...base, field.key],
      ...(typeof value === "string" && value ? { assetId: value } : {}),
      anchorPath: [...base, anchorKey],
      anchor: (obj[anchorKey] as string).trim(),
    });
  }
}

export function imageSlots(slide: Slide, registry: TemplateRegistry): ImageSlot[] {
  const template = registry.get(slide.type);
  const out: ImageSlot[] = [];
  if (template) walk(slide.content, template.editor, [], slide.content, slide.id, out);
  return out;
}

/**
 * Searches to run for the empty slots of `slides`. A keyword the AI wrote for
 * a slot, keyed by `slotKey`, wins over the word itself.
 */
export function imageJobs(
  slides: readonly Slide[],
  registry: TemplateRegistry,
  { queries, clipart }: { queries?: ReadonlyMap<string, string>; clipart: boolean },
): ImageJob[] {
  return slides
    .flatMap((s) => imageSlots(s, registry))
    .filter((slot) => !slot.assetId)
    .map(({ slideId, path, anchorPath, anchor }) => ({
      slideId,
      path,
      anchorPath,
      anchor,
      query: queries?.get(slotKey(slideId, path)) ?? anchor,
      clipart,
    }));
}

/**
 * Puts a found picture in its slot, marked for review. Leaves `doc` as it is
 * when the slot is gone, already has a picture, or now holds another word
 * (the list was reordered or edited while searching), so it can be applied
 * to every snapshot of the undo history.
 */
export function fillImageSlot(doc: LessonDocument, job: ImageJob, picture: FoundPicture): LessonDocument {
  const slide = doc.slides.find((s) => s.id === job.slideId);
  if (!slide || getIn(slide.content, job.path)) return doc;
  const anchor = getIn(slide.content, job.anchorPath);
  if (typeof anchor !== "string" || anchor.trim() !== job.anchor) return doc;
  const asset: Omit<Asset, "id"> = {
    file: picture.file,
    kind: "image",
    mime: picture.mime,
    needsReview: true,
    query: job.query.slice(0, 100),
    ...(picture.source ? { source: picture.source } : {}),
  };
  const added = addAsset(doc, asset);
  return setSlideField(added.doc, job.slideId, job.path, added.assetId);
}

/** Pictures filled in automatically that the teacher has not looked at yet, in slide order. */
export function picturesToReview(doc: LessonDocument, registry: TemplateRegistry): (ImageSlot & { assetId: string; slideIndex: number })[] {
  const pending = new Set(doc.assets.filter((a) => a.needsReview).map((a) => a.id));
  if (!pending.size) return [];
  return doc.slides.flatMap((s, slideIndex) =>
    imageSlots(s, registry)
      .filter((slot): slot is ImageSlot & { assetId: string } => !!slot.assetId && pending.has(slot.assetId))
      .map((slot) => ({ ...slot, slideIndex })),
  );
}

/** Keeps the pictures as they are: they no longer need review. */
export function markReviewed(doc: LessonDocument, assetIds: Iterable<string>): LessonDocument {
  const ids = new Set(assetIds);
  return produce(doc, (d) => {
    for (const a of d.assets) if (ids.has(a.id)) delete a.needsReview;
  });
}

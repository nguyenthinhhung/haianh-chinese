import { describe, expect, it } from "vitest";
import { createFromSample } from "../samples";
import { testEnv } from "../test/env";
import {
  addAsset,
  addSlide,
  duplicateSlide,
  moveSlide,
  removeSlide,
  removeUnusedAssets,
  setSlideField,
  setSlideNotes,
  setTitle,
} from "./document";
import { validateLesson } from "./validate";

const { templates } = testEnv();
const base = () => createFromSample("fruits", "Hoa quả", "0.0.0");

describe("document commands", () => {
  it("never mutate the input document", () => {
    const doc = base();
    const snapshot = structuredClone(doc);
    setTitle(doc, "Khác");
    setSlideField(doc, doc.slides[0]!.id, ["title"], "新");
    removeSlide(doc, doc.slides[0]!.id);
    expect(doc).toEqual(snapshot);
  });

  it("adds a valid slide after the given one", () => {
    const doc = base();
    const { doc: next, slideId } = addSlide(doc, templates, "vocabulary", doc.slides[0]!.id);
    expect(next.slides.map((s) => s.id)).toEqual([doc.slides[0]!.id, slideId, doc.slides[1]!.id]);
    expect(validateLesson(next, templates).ok).toBe(true);
  });

  it("duplicates with a fresh ID and keeps IDs stable when reordering", () => {
    const doc = base();
    const [a, b] = doc.slides;
    const dup = duplicateSlide(doc, a!.id);
    expect(dup.doc.slides.map((s) => s.id)).toEqual([a!.id, dup.slideId, b!.id]);
    expect(dup.doc.slides[1]!.content).toEqual(a!.content);

    const moved = moveSlide(dup.doc, b!.id, 0);
    expect(moved.slides.map((s) => s.id)).toEqual([b!.id, a!.id, dup.slideId]);
    expect(moveSlide(dup.doc, a!.id, 99).slides.at(-1)!.id).toBe(a!.id);
  });

  it("sets nested fields and removes cleared optional ones", () => {
    const doc = base();
    const id = doc.slides[1]!.id;
    const withImage = setSlideField(doc, id, ["words", 2, "image"], "a_img001");
    expect((withImage.slides[1]!.content as any).words[2].image).toBe("a_img001");
    const cleared = setSlideField(withImage, id, ["words", 2, "image"], undefined);
    expect("image" in (cleared.slides[1]!.content as any).words[2]).toBe(false);
  });

  it("stores notes only when present", () => {
    const doc = base();
    const id = doc.slides[0]!.id;
    expect(setSlideNotes(doc, id, "Hỏi cả lớp").slides[0]!.notes).toBe("Hỏi cả lớp");
    expect("notes" in setSlideNotes(doc, id, "").slides[0]!).toBe(false);
  });

  it("registers each asset file once", () => {
    const file = { file: "assets/img-aaaaaaaaaaaa.png", kind: "image" as const, mime: "image/png" };
    const first = addAsset(base(), file);
    const second = addAsset(first.doc, file);
    expect(second.assetId).toBe(first.assetId);
    expect(second.doc.assets).toHaveLength(1);
  });

  it("removes only assets no slide refers to", () => {
    const doc = base();
    const vocab = doc.slides.find((s) => s.type === "vocabulary")!;
    const used = addAsset(doc, { file: "assets/img-aaaaaaaaaaaa.png", kind: "image", mime: "image/png" });
    const unused = addAsset(used.doc, { file: "assets/img-bbbbbbbbbbbb.png", kind: "image", mime: "image/png" });
    const withRef = setSlideField(unused.doc, vocab.id, ["words", 0, "image"], used.assetId);

    const cleaned = removeUnusedAssets(withRef, templates);
    expect(cleaned.assets.map((a) => a.id)).toEqual([used.assetId]);
    expect(removeUnusedAssets(cleaned, templates)).toBe(cleaned);
  });
});

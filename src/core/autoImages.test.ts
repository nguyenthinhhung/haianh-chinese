import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { fillImageSlot, imageJobs, imageSlots, markReviewed, picturesToReview, slotKey } from "./autoImages";
import { createLesson, setSlideField } from "./document";
import { applyEverywhere, createHistory, record, undo } from "./history";
import type { LessonDocument, Slide } from "./schema";
import { validateLesson } from "./validate";

const { templates } = testEnv();

const vocab: Slide = {
  id: "s_vocab",
  type: "vocabulary",
  content: {
    words: [
      { hanzi: "猫", pinyin: "māo", meaning: "con mèo" },
      { hanzi: "狗", pinyin: "gǒu", meaning: "con chó" },
    ],
    hideMeaning: false,
  },
};
const cards = (front: "image" | "hanzi"): Slide => ({
  id: `s_fc_${front}`,
  type: "flashcard",
  content: { front, cards: [{ hanzi: "鱼", pinyin: "yú", meaning: "con cá" }] },
});
const matching: Slide = {
  id: "s_match",
  type: "matching",
  content: { pairs: [{ left: "猫", right: "con mèo" }, { left: "狗", right: "con chó" }] },
};

const lesson = (...slides: Slide[]): LessonDocument => ({ ...createLesson({ title: "Con vật", appVersion: "0" }), slides });
const picture = { file: "assets/img-abc.webp", mime: "image/webp", source: "https://example.com/cat" };

describe("imageSlots / imageJobs", () => {
  it("finds the picture slots a slide relies on, with the word they show", () => {
    expect(imageSlots(vocab, templates).map((s) => [s.path.join("."), s.anchor])).toEqual([
      ["words.0.image", "con mèo"],
      ["words.1.image", "con chó"],
    ]);
  });

  it("leaves out pictures that stand in for text", () => {
    expect(imageSlots(matching, templates)).toEqual([]);
  });

  it("fills flashcard pictures whichever face shows first", () => {
    expect(imageSlots(cards("hanzi"), templates)).toHaveLength(1);
    expect(imageSlots(cards("image"), templates)).toHaveLength(1);
  });

  it("prefers the AI's keyword and skips slots that already have a picture", () => {
    const filled = setSlideField(lesson(vocab), "s_vocab", ["words", 1, "image"], "a_existing");
    const queries = new Map([[slotKey("s_vocab", ["words", 0, "image"]), "cat cartoon"]]);
    const jobs = imageJobs(filled.slides, templates, { queries, clipart: true });
    expect(jobs).toEqual([
      {
        slideId: "s_vocab",
        path: ["words", 0, "image"],
        anchorPath: ["words", 0, "meaning"],
        anchor: "con mèo",
        query: "cat cartoon",
        clipart: true,
      },
    ]);
  });
});

describe("fillImageSlot", () => {
  const job = imageJobs([vocab], templates, { clipart: false })[0]!;

  it("puts the picture in its slot, marked for review, and the lesson stays valid", () => {
    const doc = fillImageSlot(lesson(vocab), job, picture);
    const assetId = (doc.slides[0]!.content as { words: { image?: string }[] }).words[0]!.image!;
    expect(doc.assets.find((a) => a.id === assetId)).toMatchObject({ ...picture, needsReview: true, query: "con mèo" });
    expect(validateLesson(doc, templates).ok).toBe(true);
  });

  it("does nothing when the slot is gone, filled, or now holds another word", () => {
    const base = lesson(vocab);
    const removed = lesson();
    expect(fillImageSlot(removed, job, picture)).toBe(removed);
    const filled = setSlideField(base, "s_vocab", ["words", 0, "image"], "a_mine");
    expect(fillImageSlot(filled, job, picture)).toBe(filled);
    const reordered = setSlideField(base, "s_vocab", ["words", 0, "meaning"], "con chó");
    expect(fillImageSlot(reordered, job, picture)).toBe(reordered);
  });

  it("applied to the whole history, survives undo without adding a step", () => {
    const a = lesson(vocab);
    const b = { ...a, title: "Con vật 2" };
    let h = record(createHistory(a), b);
    h = applyEverywhere(h, (d) => fillImageSlot(d, job, picture));
    expect(h.past).toHaveLength(1);
    const back = undo(h).present;
    expect(back.title).toBe("Con vật");
    expect(picturesToReview(back, templates)).toHaveLength(1);
  });
});

describe("review", () => {
  it("lists automatic pictures until they are kept", () => {
    const doc = fillImageSlot(lesson(vocab), imageJobs([vocab], templates, { clipart: false })[0]!, picture);
    const pending = picturesToReview(doc, templates);
    expect(pending.map((p) => [p.slideIndex, p.anchor])).toEqual([[0, "con mèo"]]);
    expect(picturesToReview(markReviewed(doc, [pending[0]!.assetId]), templates)).toEqual([]);
  });
});

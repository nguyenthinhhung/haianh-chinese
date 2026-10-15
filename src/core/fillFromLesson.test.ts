import { describe, expect, it } from "vitest";
import { createFromSample } from "../samples";
import { testEnv } from "../test/env";
import { blankContent } from "./blank";
import { addSlide, fillFromLessonWords, setSlideContent } from "./document";
import { lessonWordEntries } from "./lessonWords";

const { templates } = testEnv();

/** The fruit sample (苹果, 香蕉, 西瓜, 橙子 with meanings) plus an empty slide of `type`. */
function withEmpty(type: string) {
  const { doc, slideId } = addSlide(createFromSample("fruits", "Hoa quả", "0.0.0"), templates, type);
  return { doc, slideId };
}

describe("taking the lesson's words", () => {
  it("collects each word once with its pinyin and meaning, leaving out the slide being filled", () => {
    const { doc, slideId } = withEmpty("flashcard");
    const words = lessonWordEntries(doc, templates, slideId);
    const hanzi = words.map((w) => w.hanzi);
    expect(hanzi.slice(0, 4)).toEqual(["苹果", "香蕉", "西瓜", "橙子"]);
    expect(new Set(hanzi).size).toBe(hanzi.length);
    expect(words.find((w) => w.hanzi === "苹果")).toMatchObject({ pinyin: "píng guǒ", meaning: "quả táo" });
  });

  it("fills an empty word list, then adds only words it does not have", () => {
    const { doc, slideId } = withEmpty("matching");
    const words = lessonWordEntries(doc, templates, slideId).filter((w) => w.meaning);
    const first = fillFromLessonWords(doc, templates, slideId, words);
    const pairs = (first.doc.slides.at(-1)!.content as { pairs: { left: string; right: string }[] }).pairs;
    // The two empty pairs a new matching slide starts with give way to the words.
    expect(pairs.map((p) => p.left)).toEqual(words.map((w) => w.hanzi).slice(0, 6));
    expect(pairs[0]!.right).toBe(words[0]!.meaning);
    expect(fillFromLessonWords(first.doc, templates, slideId, words).added).toBe(0);
  });

  it("keeps to the list's size and leaves slides without a word list alone", () => {
    const { doc, slideId } = withEmpty("tone-pick");
    const many = Array.from({ length: 10 }, (_, i) => ({ hanzi: `字${i}`, pinyin: "zì", meaning: "" }));
    const r = fillFromLessonWords(doc, templates, slideId, many);
    expect((r.doc.slides.at(-1)!.content as { items: unknown[] }).items).toHaveLength(6);
    const grammar = withEmpty("grammar");
    expect(fillFromLessonWords(grammar.doc, templates, grammar.slideId, many).added).toBe(0);
  });
});

describe("sample and empty content", () => {
  it("puts a template's sample in a slide and clears it again", () => {
    const { doc, slideId } = withEmpty("dialogue");
    const template = templates.require("dialogue");
    const sample = setSlideContent(doc, slideId, template.defaults());
    expect(sample.slides.at(-1)!.content).toEqual(template.defaults());
    const cleared = setSlideContent(sample, slideId, blankContent(template));
    expect(cleared.slides.at(-1)!.content).toEqual(blankContent(template));
  });
});

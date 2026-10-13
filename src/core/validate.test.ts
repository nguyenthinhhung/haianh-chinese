import { describe, expect, it } from "vitest";
import { createFromSample } from "../samples";
import { testEnv } from "../test/env";
import { addAsset, setSlideField } from "./document";
import { formatIssue, validateLesson } from "./validate";

const { templates } = testEnv();

describe("validateLesson", () => {
  it("accepts the samples", () => {
    expect(validateLesson(createFromSample("fruits", "Hoa quả", "0.0.0"), templates).ok).toBe(true);
  });

  it("fills template defaults inside slide content", () => {
    const doc = createFromSample("fruits", "Hoa quả", "0.0.0");
    const raw = structuredClone(doc) as any;
    delete raw.slides[1].content.hideMeaning;
    delete raw.slides[1].content.words[0].meaning;
    const result = validateLesson(raw, templates);
    expect(result.ok && result.doc.slides[1]!.content).toMatchObject({
      hideMeaning: false,
      words: [{ hanzi: "苹果", meaning: "" }, {}, {}, {}],
    });
  });

  it("locates content errors in the teacher's terms", () => {
    const doc = createFromSample("fruits", "Hoa quả", "0.0.0");
    const raw = structuredClone(doc) as any;
    raw.slides[1].content.words[1].hanzi = "  ";
    const result = validateLesson(raw, templates);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]!.path).toEqual(["slides", 1, "content", "words", 1, "hanzi"]);
      expect(formatIssue(result.issues[0]!, raw, templates)).toBe("Slide 2, từ 2, Chữ Hán: Không được để trống");
    }
  });

  it("rejects references to missing assets and assets of the wrong kind", () => {
    let doc = createFromSample("fruits", "Hoa quả", "0.0.0");
    const vocabId = doc.slides[1]!.id;
    const missing = setSlideField(doc, vocabId, ["words", 0, "image"], "a_nothere");
    expect(validateLesson(missing, templates)).toMatchObject({
      ok: false,
      issues: [{ path: ["slides", 1, "content", "words", 0, "image"] }],
    });

    const added = addAsset(doc, { file: "assets/audio-0123456789ab.mp3", kind: "audio", mime: "audio/mpeg" });
    doc = setSlideField(added.doc, vocabId, ["words", 0, "image"], added.assetId);
    expect(validateLesson(doc, templates)).toMatchObject({ ok: false, issues: [{ message: "Cần ảnh" }] });
  });

  it("rejects duplicate slide IDs", () => {
    const doc = createFromSample("fruits", "Hoa quả", "0.0.0");
    const raw = { ...doc, slides: [doc.slides[0], { ...doc.slides[1], id: doc.slides[0]!.id }] };
    expect(validateLesson(raw, templates)).toMatchObject({ ok: false, issues: [{ message: "Trùng ID slide" }] });
  });

  it("accepts colour theme overrides only", () => {
    const doc = createFromSample("blank", "Trống", "0.0.0");
    const ok = { ...doc, theme: { id: "classic", overrides: { "--ls-accent": "#ff0000" } } };
    expect(validateLesson(ok, templates).ok).toBe(true);
    const css = { ...doc, theme: { id: "classic", overrides: { "--ls-accent": "red;background:url(x)" } } };
    expect(validateLesson(css, templates).ok).toBe(false);
    const prop = { ...doc, theme: { id: "classic", overrides: { "background-image": "#fff" } } };
    expect(validateLesson(prop, templates).ok).toBe(false);
  });
});

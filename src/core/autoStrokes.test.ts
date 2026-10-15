import { describe, expect, it } from "vitest";
import { createFromSample } from "../samples";
import { testEnv } from "../test/env";
import { fillStrokes, strokeJobs } from "./autoStrokes";
import type { LessonDocument } from "./schema";

const { templates } = testEnv();

function lesson(write: string, strokesFor = ""): LessonDocument {
  const content = { ...(templates.require("word-study").defaults() as object), write, strokes: strokesFor ? ["M 1 1 Z"] : [], strokesFor };
  return { ...createFromSample("blank", "x", "0"), slides: [{ id: "s_strokes001", type: "word-study", content }] };
}

describe("stroke order", () => {
  it("asks for the strokes of a character that has none, or has another character's", () => {
    expect(strokeJobs(lesson("现"))).toEqual([{ slideId: "s_strokes001", character: "现" }]);
    expect(strokeJobs(lesson("点", "现"))).toEqual([{ slideId: "s_strokes001", character: "点" }]);
    expect(strokeJobs(lesson("现", "现"))).toEqual([]);
    expect(strokeJobs(lesson(""))).toEqual([]);
    expect(strokeJobs(lesson("现在"))).toEqual([]);
  });

  it("keeps the strokes with the character, unless it changed while they were fetched", () => {
    const doc = lesson("现");
    const filled = fillStrokes(doc, { slideId: "s_strokes001", character: "现" }, ["M 0 0 L 9 9 Z"]);
    expect(filled.slides[0]!.content).toMatchObject({ strokes: ["M 0 0 L 9 9 Z"], strokesFor: "现" });
    expect(strokeJobs(filled)).toEqual([]);
    const changed = lesson("点");
    expect(fillStrokes(changed, { slideId: "s_strokes001", character: "现" }, ["M 0 0 Z"])).toBe(changed);
  });

  it("draws the character stroke by stroke once fetched", () => {
    const doc = fillStrokes(lesson("现"), { slideId: "s_strokes001", character: "现" }, ["M 0 0 L 9 9 Z", "M 1 1 L 5 5 Z"]);
    const html = templates.require("word-study").render(doc.slides[0]!.content, {
      slideId: "s_strokes001",
      asset: () => undefined,
      assetUrl: () => undefined,
      script: "simplified",
    });
    expect(html.match(/class="ls-ws-stroke"/g)).toHaveLength(2);
    expect(html).toContain("data-ls-reveal");
  });
});

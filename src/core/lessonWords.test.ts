import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { createLesson } from "./document";
import { lessonWords } from "./lessonWords";
import type { LessonDocument } from "./schema";

const { templates } = testEnv();

describe("lessonWords", () => {
  it("collects the words of a lesson once, in slide order, leaving sentences out", () => {
    const doc: LessonDocument = {
      ...createLesson({ title: "Con vật", appVersion: "0" }),
      slides: [
        { id: "s_cover0001", type: "cover", content: { title: "动物" } },
        { id: "s_vocab0001", type: "vocabulary", content: { words: [{ hanzi: "猫" }, { hanzi: "熊猫" }] } },
        { id: "s_dlg000001", type: "dialogue", content: { lines: [{ speaker: "a", hanzi: "这是猫。" }] } },
        { id: "s_match0001", type: "matching", content: { pairs: [{ left: "狗", right: "con chó" }, { left: "猫", right: "con mèo" }] } },
      ],
    };
    // The cover's title counts: a lesson's topic is usually a word the class met (水果, 动物).
    expect(lessonWords(doc, templates)).toEqual(["动物", "猫", "熊猫", "狗"]);
  });
});

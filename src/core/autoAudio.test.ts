import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { audioJobs, fillAudioSlot } from "./autoAudio";
import { createLesson, setSlideField } from "./document";
import type { LessonDocument, Slide } from "./schema";
import { validateLesson } from "./validate";

const { templates } = testEnv();
const vocab: Slide = {
  id: "s_vocab0001",
  type: "vocabulary",
  content: { words: [{ hanzi: "猫", pinyin: "māo", meaning: "con mèo" }, { hanzi: "狗", pinyin: "gǒu", meaning: "con chó" }], hideMeaning: false },
};
const quiz: Slide = { id: "s_quiz00001", type: "quiz", content: { mode: "choice", hanzi: "猫", options: [{ text: "a" }, { text: "b" }], answer: "a" } };
const lesson = (...slides: Slide[]): LessonDocument => ({ ...createLesson({ title: "Thử", appVersion: "0" }), slides });
const sound = { file: "assets/audio-abc.mp3", mime: "audio/mpeg" };

describe("audioJobs", () => {
  it("reads the words of pronunciation slots, but never makes a quiz a listening question", () => {
    const jobs = audioJobs([vocab, quiz], templates);
    expect(jobs.map((j) => [j.slideId, j.path.join("."), j.text])).toEqual([
      ["s_vocab0001", "words.0.audio", "猫"],
      ["s_vocab0001", "words.1.audio", "狗"],
    ]);
  });

  it("skips slots with a sound already and text without characters", () => {
    const filled = setSlideField(lesson(vocab), "s_vocab0001", ["words", 0, "audio"], "a_mine");
    const latin = setSlideField(filled, "s_vocab0001", ["words", 1, "hanzi"], "OK");
    expect(audioJobs(latin.slides, templates)).toEqual([]);
  });
});

describe("fillAudioSlot", () => {
  const job = audioJobs([vocab], templates)[0]!;

  it("puts the recording in its slot and the lesson stays valid", () => {
    const doc = fillAudioSlot(lesson(vocab), job, sound);
    const id = (doc.slides[0]!.content as { words: { audio?: string }[] }).words[0]!.audio!;
    expect(doc.assets.find((a) => a.id === id)).toMatchObject({ ...sound, kind: "audio" });
    expect(validateLesson(doc, templates).ok).toBe(true);
  });

  it("does nothing when the word changed or the slot was filled meanwhile", () => {
    const changed = setSlideField(lesson(vocab), "s_vocab0001", ["words", 0, "hanzi"], "熊猫");
    expect(fillAudioSlot(changed, job, sound)).toBe(changed);
    const filled = setSlideField(lesson(vocab), "s_vocab0001", ["words", 0, "audio"], "a_mine");
    expect(fillAudioSlot(filled, job, sound)).toBe(filled);
  });
});

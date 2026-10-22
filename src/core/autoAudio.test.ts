import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { audioJobs, exerciseAudioJobs, fillAudioSlot, speechText } from "./autoAudio";
import { createLesson, setSlideField } from "./document";
import { addExercise, newExercise, newPart, QUESTION_KINDS, setExerciseField } from "./exercise";
import type { Exercise } from "./exerciseSchema";
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
    expect(jobs.map((j) => [j.ownerId, j.path.join("."), j.text])).toEqual([
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

describe("listening parts of exercises", () => {
  function listeningExercise(): Exercise {
    const exercise = newExercise("Nghe");
    const listening = exercise.parts[0]!;
    listening.transcript = "男：你好！女：你好！";
    listening.questions = [
      { ...QUESTION_KINDS.choice.blank(), transcript: "我叫王丽。" },
      { ...QUESTION_KINDS["tone-pick"].blank(), prompt: "妈" },
      { ...QUESTION_KINDS.choice.blank(), transcript: "", audio: "a_textbook" },
    ];
    const reading = { ...newPart("reading"), transcript: "不读", questions: [{ ...QUESTION_KINDS.choice.blank(), transcript: "不读" }] };
    return { ...exercise, parts: [listening, reading] };
  }

  it("reads each listening part and question aloud, never reading parts", () => {
    const exercise = listeningExercise();
    expect(exerciseAudioJobs(exercise).map((j) => [j.path.join("."), j.textPath.join("."), j.text])).toEqual([
      ["parts.0.audio", "parts.0.transcript", "男：你好！女：你好！"],
      ["parts.0.questions.0.audio", "parts.0.questions.0.transcript", "我叫王丽。"],
      ["parts.0.questions.1.audio", "parts.0.questions.1.prompt", "妈"],
    ]);
  });

  it("puts the recording into the exercise, unless its words changed", () => {
    const exercise = listeningExercise();
    const { doc } = addExercise(lesson(), exercise);
    const job = exerciseAudioJobs(exercise)[0]!;
    const filled = fillAudioSlot(doc, job, sound);
    const assetId = filled.exercises[0]!.parts[0]!.audio!;
    expect(filled.assets.find((a) => a.id === assetId)).toMatchObject({ ...sound, kind: "audio" });
    const changed = setExerciseField(doc, exercise.id, ["parts", 0, "transcript"], "男：再见！");
    expect(fillAudioSlot(changed, job, sound)).toBe(changed);
  });

  it("leaves speaker labels out of what is read", () => {
    expect(speechText("男：你好！女：你好！")).toBe("你好！你好！");
    expect(speechText("A: 你叫什么名字？\nB: 我叫王丽。")).toBe("你叫什么名字？\n我叫王丽。");
    expect(speechText("王兰：我们走吧。")).toBe("我们走吧。");
    expect(speechText("我们三点见。")).toBe("我们三点见。");
  });
});

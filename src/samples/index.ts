import { createLesson } from "../core/document";
import { newId } from "../core/ids";
import type { LessonDocument } from "../core/schema";
import type { CoverContent } from "../templates/cover";
import type { VocabularyContent } from "../templates/vocabulary";

export type SampleId = "blank" | "fruits";

export const SAMPLES: { id: SampleId; label: string }[] = [
  { id: "fruits", label: "Bài mẫu: Hoa quả" },
  { id: "blank", label: "Bài trống" },
];

export function createFromSample(sample: SampleId, title: string, appVersion: string, themeId?: string): LessonDocument {
  const doc = createLesson({ title, appVersion, ...(themeId ? { themeId } : {}) });
  if (sample === "blank") {
    const content: CoverContent = { title: "新课", pinyin: "xīn kè", subtitle: title };
    return { ...doc, slides: [{ id: newId("s"), type: "cover", content }] };
  }

  const cover: CoverContent = { title: "水果", pinyin: "shuǐ guǒ", subtitle: "Hoa quả" };
  const words: VocabularyContent = {
    heading: "Từ vựng",
    words: [
      { hanzi: "苹果", pinyin: "píng guǒ", meaning: "quả táo", pos: "" },
      { hanzi: "香蕉", pinyin: "xiāng jiāo", meaning: "quả chuối", pos: "" },
      { hanzi: "西瓜", pinyin: "xī guā", meaning: "dưa hấu", pos: "" },
      { hanzi: "橙子", pinyin: "chéng zi", meaning: "quả cam", pos: "" },
    ],
    hideMeaning: true,
  };
  return {
    ...doc,
    slides: [
      { id: newId("s"), type: "cover", content: cover },
      {
        id: newId("s"),
        type: "vocabulary",
        content: words,
        notes: "Chỉ vào từng hình, cả lớp đọc to hai lần rồi mới bấm Tiếp để hiện nghĩa.",
      },
    ],
  };
}

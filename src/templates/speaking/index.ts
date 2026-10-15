import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { autoText, gapText, image, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const cue = z.object({
  text: z.string().regex(/\S/, "Không được để trống").max(16),
  pinyin: z.string().max(40).default(""),
  image: AssetIdRef.optional(),
});

const structure = z.object({ text: z.string().regex(/\S/, "Không được để trống").max(40) });

const schema = z.object({
  heading: z.string().max(60).default(""),
  /** What the class does, in Vietnamese ("Hỏi bạn bên cạnh…", "Kể lại bài khoá theo lời 王静"). */
  task: z.string().max(200).default(""),
  /** Pictures with words to swap into the model dialogue. */
  cues: z.array(cue).max(6, "Tối đa 6 gợi ý").default([]),
  question: z.string().max(60).default(""),
  questionPinyin: z.string().max(160).default(""),
  answer: z.string().max(60).default(""),
  answerPinyin: z.string().max(160).default(""),
  /** Structures to use, listed a, b, c… */
  structures: z.array(structure).max(8, "Tối đa 8 cấu trúc").default([]),
  /** How many of the structures each student must use; "0" for no rule. */
  minUse: z.enum(["0", "1", "2", "3", "4", "5"]).default("0"),
});

export type SpeakingContent = z.output<typeof schema>;

export const speaking: SlideTemplate<SpeakingContent> = {
  type: "speaking",
  label: "Hoạt động nói (对话练习)",
  description: "Gợi ý bằng hình, hội thoại mẫu, cấu trúc phải dùng",
  category: "qa",
  order: 108,
  schema,
  aiSchemaHint:
    'Hoạt động nói theo cặp hoặc nhóm (对话练习, 双人活动, 小组活动) hoặc kể lại bài khoá (复述): hình gợi ý kèm từ để thay vào, một cặp hỏi–đáp mẫu trong bong bóng thoại, và/hoặc danh sách cấu trúc phải dùng. {"heading"?: ví dụ "对话练习", "task"?: yêu cầu bằng tiếng Việt, "cues"?: [{"text": từ/cụm từ chữ Hán để thay vào, "pinyin", "image"?: từ khoá tìm ảnh}] (0–6), "question"?: câu hỏi mẫu chữ Hán, có thể "你几点/什么时候……？", "questionPinyin"?, "answer"?: câu trả lời mẫu, ví dụ "我……。", "answerPinyin"?, "structures"?: [{"text": cấu trúc hoặc cụm từ phải dùng}] (0–8), "minUse"?: "0"–"5" số cấu trúc tối thiểu mỗi người phải dùng}',
  defaults: () => ({
    heading: "对话练习",
    task: "Hỏi và trả lời theo mẫu, thay bằng các hoạt động trong hình.",
    cues: [
      { text: "睡觉", pinyin: "shuìjiào" },
      { text: "去商店", pinyin: "qù shāngdiàn" },
      { text: "去学校", pinyin: "qù xuéxiào" },
      { text: "做饭", pinyin: "zuò fàn" },
    ],
    question: "你几点/什么时候……？",
    questionPinyin: "Nǐ jǐ diǎn / shénme shíhou……?",
    answer: "我……。",
    answerPinyin: "Wǒ……",
    structures: [],
    minUse: "0",
  }),
  limits: {
    heading: { maxChars: 30 },
    task: { maxChars: 110 },
    "cues.*.text": { maxChars: 6 },
    question: { maxChars: 22 },
    answer: { maxChars: 22 },
    "structures.*.text": { maxChars: 24 },
  },
  render(c, ctx) {
    const cues = c.cues.length
      ? `<ul class="ls-sk-cues" data-count="${c.cues.length}">` +
        c.cues
          .map((k) => {
            const img = image(ctx, k.image, "ls-sk-cue-image");
            return (
              `<li class="ls-sk-cue">` +
              (img ? `<span class="ls-sk-cue-media">${img}</span>` : "") +
              (k.pinyin ? pinyin(k.pinyin, "span", "ls-sk-cue-pinyin") : "") +
              zh(k.text, "span", "ls-sk-cue-text") +
              `</li>`
            );
          })
          .join("") +
        `</ul>`
      : "";
    const bubble = (text: string, py: string, side: "q" | "a") =>
      text
        ? `<div class="ls-sk-bubble ls-sk-bubble--${side}">${py ? pinyin(py, "span", "ls-sk-bubble-pinyin") : ""}${gapText(text, "span", "ls-sk-bubble-text")}</div>`
        : "";
    const talk = c.question || c.answer ? `<div class="ls-sk-talk">${bubble(c.question, c.questionPinyin, "q")}${bubble(c.answer, c.answerPinyin, "a")}</div>` : "";
    const structures = c.structures.length
      ? `<div class="ls-sk-structures">` +
        (c.minUse !== "0" ? vi(`Dùng ít nhất ${c.minUse} cấu trúc:`, "p", "ls-sk-rule") : "") +
        `<ol type="a">${c.structures.map((s) => `<li>${autoText(s.text)}</li>`).join("")}</ol></div>`
      : "";
    return (
      (c.heading ? autoText(c.heading, "h2", "ls-heading") : "") +
      (c.task ? vi(c.task, "p", "ls-sk-task") : "") +
      `<div class="ls-sk${structures ? " ls-sk--structures" : ""}"><div class="ls-sk-main">${cues}${talk}</div>${structures}</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "zh", placeholder: "对话练习" },
    { kind: "text", key: "task", label: "Yêu cầu (tiếng Việt)", lang: "vi", multiline: true },
    {
      kind: "list",
      key: "cues",
      label: "Gợi ý bằng hình",
      itemLabel: "gợi ý",
      min: 0,
      max: 6,
      newItem: () => ({ text: "", pinyin: "" }),
      fields: [
        { kind: "text", key: "text", label: "Từ / cụm từ", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["text"], autoImage: true },
      ],
    },
    { kind: "text", key: "question", label: "Câu hỏi mẫu (chỗ thay viết ……)", lang: "zh" },
    { kind: "text", key: "questionPinyin", label: "Pinyin câu hỏi", lang: "pinyin" },
    { kind: "text", key: "answer", label: "Câu trả lời mẫu", lang: "zh" },
    { kind: "text", key: "answerPinyin", label: "Pinyin câu trả lời", lang: "pinyin" },
    {
      kind: "list",
      key: "structures",
      label: "Cấu trúc phải dùng (a, b, c…)",
      itemLabel: "cấu trúc",
      min: 0,
      max: 8,
      newItem: () => ({ text: "" }),
      fields: [{ kind: "text", key: "text", label: "Cấu trúc", lang: "zh" }],
    },
    {
      kind: "select",
      key: "minUse",
      label: "Mỗi người dùng ít nhất",
      options: [
        { value: "0", label: "Không bắt buộc" },
        { value: "1", label: "1 cấu trúc" },
        { value: "2", label: "2 cấu trúc" },
        { value: "3", label: "3 cấu trúc" },
        { value: "4", label: "4 cấu trúc" },
        { value: "5", label: "5 cấu trúc" },
      ],
    },
  ],
};

export default speaking;

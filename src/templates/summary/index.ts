import { z } from "zod";
import type { SlideTemplate } from "../../core/template";
import { pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const point = z.object({
  text: z.string().regex(/\S/, "Không được để trống").max(120),
});

const word = z.object({
  hanzi: z.string().regex(/\S/, "Không được để trống").max(8),
  pinyin: z.string().max(40).default(""),
});

const schema = z
  .object({
    heading: z.string().max(60).default(""),
    points: z.array(point).max(6, "Tối đa 6 ý").default([]),
    words: z.array(word).max(12, "Tối đa 12 từ").default([]),
    stepByStep: z.boolean().default(false),
  })
  .refine((c) => c.points.length + c.words.length > 0, { message: "Cần ít nhất 1 ý hoặc 1 từ", path: ["points"] });

export type SummaryContent = z.output<typeof schema>;

export const summary: SlideTemplate<SummaryContent> = {
  type: "summary",
  label: "Tổng kết",
  description: "Ý cần nhớ và từ chính cuối bài",
  category: "teach",
  order: 70,
  schema,
  aiSchemaHint:
    'Tổng kết bài. {"heading"?: tiêu đề, "points": [{"text": ý cần nhớ, tiếng Việt}] (tối đa 6), "words": [{"hanzi", "pinyin": có dấu thanh}] (từ vựng chính, tối đa 12), "stepByStep"?: true để hiện từng ý khi bấm Tiếp}',
  defaults: () => ({
    heading: "Ghi nhớ",
    points: [{ text: "Chào hỏi: 你好 (nǐ hǎo)" }, { text: "Cảm ơn: 谢谢 (xiè xie)" }],
    words: [
      { hanzi: "你好", pinyin: "nǐ hǎo" },
      { hanzi: "谢谢", pinyin: "xiè xie" },
      { hanzi: "再见", pinyin: "zài jiàn" },
    ],
    stepByStep: false,
  }),
  limits: {
    heading: { maxChars: 40 },
    "points.*.text": { maxChars: 60 },
    "words.*.hanzi": { maxChars: 4 },
    "words.*.pinyin": { maxChars: 16 },
  },
  render(c) {
    const points = c.points
      .map(
        (p) =>
          `<li class="ls-sum-point${c.stepByStep ? " ls-hide" : ""}"${c.stepByStep ? " data-ls-reveal" : ""}>` +
          vi(p.text, "span") +
          `</li>`,
      )
      .join("");
    const words = c.words
      .map(
        (w) =>
          `<li class="ls-sum-word">` +
          zh(w.hanzi, "span", "ls-sum-hanzi") +
          (w.pinyin ? pinyin(w.pinyin, "span", "ls-sum-pinyin") : "") +
          `</li>`,
      )
      .join("");
    const layout = points && words ? "both" : points ? "points" : "words";
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-sum" data-layout="${layout}">` +
      (points ? `<ol class="ls-sum-points">${points}</ol>` : "") +
      (words ? `<ul class="ls-sum-words" data-count="${c.words.length}">${words}</ul>` : "") +
      `</div>`
    );
  },
  css,
  fromWords: { list: "words", max: 12, item: (w) => ({ hanzi: w.hanzi, pinyin: w.pinyin }) },
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "points",
      label: "Ý cần nhớ",
      itemLabel: "ý",
      min: 0,
      max: 6,
      newItem: () => ({ text: "" }),
      fields: [{ kind: "text", key: "text", label: "Nội dung", lang: "vi" }],
    },
    {
      kind: "list",
      key: "words",
      label: "Từ vựng chính",
      itemLabel: "từ",
      min: 0,
      max: 12,
      newItem: () => ({ hanzi: "", pinyin: "" }),
      fields: [
        { kind: "text", key: "hanzi", label: "Chữ Hán", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
      ],
    },
    { kind: "toggle", key: "stepByStep", label: "Hiện từng ý khi bấm Tiếp" },
  ],
};

export default summary;

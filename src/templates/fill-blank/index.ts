import { z } from "zod";
import type { SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { splitParts, stableShuffle, vi } from "../../renderer/helpers";
import css from "./style.css?raw";

/** "我[是]学生" → [{text:"我"}, {text:"是", blank:true}, {text:"学生"}]. */
export function parseBlanks(text: string): { text: string; blank: boolean }[] {
  return text
    .split(/\[([^\]]*)\]/)
    .map((t, i) => ({ text: i % 2 ? t.trim() : t, blank: i % 2 === 1 }))
    .filter((s) => s.blank || s.text);
}

const sentence = z
  .object({
    text: z.string().regex(/\S/, "Không được để trống").max(80),
    pinyin: z.string().max(200).default(""),
    meaning: z.string().max(120).default(""),
  })
  .refine((s) => parseBlanks(s.text).some((p) => p.blank && p.text), {
    message: "Đánh dấu chỗ trống bằng [ ], ví dụ: 我[是]学生",
    path: ["text"],
  });

const schema = z.object({
  heading: z.string().max(60).default(""),
  sentences: z.array(sentence).min(1, "Cần ít nhất 1 câu").max(4, "Tối đa 4 câu"),
  bank: z.boolean().default(true),
  distractors: z.string().max(80).default(""),
});

export type FillBlankContent = z.output<typeof schema>;

export const fillBlank: SlideTemplate<FillBlankContent> = {
  type: "fill-blank",
  label: "Điền chỗ trống",
  category: "qa",
  order: 130,
  schema,
  aiSchemaHint:
    'Câu có chỗ trống, mỗi lần bấm Tiếp điền một chỗ. {"heading"?: tiêu đề, "sentences": [{"text": câu chữ Hán, đặt từ cần điền trong [ ] ví dụ "我[是]学生", "pinyin"?: pinyin, cũng đặt phần trống trong [ ], "meaning"?: nghĩa tiếng Việt}] (1–4 câu), "bank"?: true để hiện ô gợi ý từ, "distractors"?: từ gây nhiễu ngăn bằng " / "}',
  defaults: () => ({
    heading: "Điền từ còn thiếu",
    sentences: [
      { text: "我[是]学生。", pinyin: "wǒ [shì] xué sheng.", meaning: "Tôi là học sinh." },
      { text: "你[叫]什么名字？", pinyin: "nǐ [jiào] shén me míng zi?", meaning: "Bạn tên là gì?" },
    ],
    bank: true,
    distractors: "有",
  }),
  limits: {
    heading: { maxChars: 40 },
    "sentences.*.text": { maxChars: 20 },
    "sentences.*.pinyin": { maxChars: 50 },
    "sentences.*.meaning": { maxChars: 50 },
  },
  render(c, ctx) {
    let step = 0;
    const answers: { word: string; step: number }[] = [];
    const lines = c.sentences
      .map((s) => {
        const steps: number[] = [];
        const hanzi = parseBlanks(s.text)
          .map((p) => {
            if (!p.blank) return esc(p.text);
            const n = ++step;
            steps.push(n);
            answers.push({ word: p.text, step: n });
            return (
              `<span class="ls-fb-blank">` +
              `<span class="ls-fb-answer ls-hide" data-ls-reveal="${n}" data-ls-sound="correct">${esc(p.text)}</span>` +
              `</span>`
            );
          })
          .join("");
        // The k-th blank in the pinyin opens with the k-th blank of the characters.
        let k = 0;
        const py = parseBlanks(s.pinyin)
          .map((p) => {
            if (!p.blank) return esc(p.text);
            const n = steps[k++];
            return n
              ? `<span class="ls-fb-blank ls-fb-blank--pinyin"><span class="ls-fb-answer ls-hide" data-ls-reveal="${n}">${esc(p.text)}</span></span>`
              : esc(p.text);
          })
          .join("");
        return (
          `<li class="ls-fb-sentence">` +
          `<span class="ls-fb-hanzi" lang="zh-CN">${hanzi}</span>` +
          (s.pinyin ? `<span class="ls-pinyin ls-fb-pinyin" lang="zh-Latn-pinyin">${py}</span>` : "") +
          (s.meaning ? vi(s.meaning, "span", "ls-fb-meaning") : "") +
          `</li>`
        );
      })
      .join("");

    const words = [...answers, ...splitParts(c.distractors).map((word) => ({ word, step: 0 }))];
    const bank = c.bank
      ? `<ul class="ls-fb-bank">` +
        stableShuffle(words.length, ctx.slideId)
          .map((i) => {
            const w = words[i]!;
            return `<li class="ls-fb-chip"${w.step ? ` data-ls-reveal="${w.step}"` : ""} lang="zh-CN">${esc(w.word)}</li>`;
          })
          .join("") +
        `</ul>`
      : "";

    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-fb" data-ls-complete>${bank}<ol class="ls-fb-sentences" data-count="${c.sentences.length}">${lines}</ol></div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "sentences",
      label: "Câu (đặt từ cần điền trong [ ])",
      itemLabel: "câu",
      min: 1,
      max: 4,
      newItem: () => ({ text: "", pinyin: "", meaning: "" }),
      fields: [
        { kind: "text", key: "text", label: "Câu (chữ Hán)", lang: "zh", placeholder: "我[是]学生。" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin", placeholder: "wǒ [shì] xué sheng." },
        { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
      ],
    },
    { kind: "toggle", key: "bank", label: "Hiện ô gợi ý từ" },
    {
      kind: "text",
      key: "distractors",
      label: "Từ gây nhiễu trong ô gợi ý (ngăn bằng /)",
      lang: "zh",
      placeholder: "有 / 很",
      when: (c) => c.bank,
    },
  ],
};

export default fillBlank;

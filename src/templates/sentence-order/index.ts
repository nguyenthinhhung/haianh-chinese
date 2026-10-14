import { z } from "zod";
import type { SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { splitParts, stableShuffle, vi } from "../../renderer/helpers";
import css from "./style.css?raw";

const schema = z
  .object({
    heading: z.string().max(60).default(""),
    words: z.string().regex(/\S/, "Không được để trống").max(80),
    pinyin: z.string().max(200).default(""),
    meaning: z.string().max(120).default(""),
    allAtOnce: z.boolean().default(false),
  })
  .refine((c) => splitParts(c.words).length >= 2, {
    message: "Cần ít nhất 2 thẻ, ngăn bằng /, ví dụ: 我 / 是 / 学生",
    path: ["words"],
  })
  .refine((c) => splitParts(c.words).length <= 8, { message: "Tối đa 8 thẻ", path: ["words"] });

export type SentenceOrderContent = z.output<typeof schema>;

export const sentenceOrder: SlideTemplate<SentenceOrderContent> = {
  type: "sentence-order",
  label: "Sắp xếp câu",
  category: "qa",
  order: 140,
  schema,
  aiSchemaHint:
    'Các thẻ từ bị xáo trộn, trẻ đọc lại câu đúng. {"heading"?: tiêu đề, "words": câu đúng, các thẻ ngăn bằng " / " ví dụ "我 / 是 / 学生", "pinyin"?: pinyin ngăn bằng " / " tương ứng, "meaning"?: nghĩa tiếng Việt, "allAtOnce"?: true để hiện cả câu một lần thay vì từng thẻ}',
  defaults: () => ({
    heading: "Sắp xếp thành câu đúng",
    words: "我 / 喜欢 / 吃 / 苹果",
    pinyin: "wǒ / xǐ huan / chī / píng guǒ",
    meaning: "Tôi thích ăn táo.",
    allAtOnce: false,
  }),
  limits: { heading: { maxChars: 40 }, words: { maxChars: 24 }, meaning: { maxChars: 50 } },
  render(c, ctx) {
    const words = splitParts(c.words);
    const pys = splitParts(c.pinyin);
    // Word i is step i + 1 (or everything is step 1); its card and its slot share it.
    const stepOf = (i: number) => (c.allAtOnce ? 1 : i + 1);
    const card = (i: number) =>
      `<span class="ls-so-hanzi" lang="zh-CN">${esc(words[i]!)}</span>` +
      (pys[i] ? `<span class="ls-pinyin ls-so-pinyin" lang="zh-Latn-pinyin">${esc(pys[i]!)}</span>` : "");
    const pool = stableShuffle(words.length, ctx.slideId)
      .map((i) => `<li class="ls-so-card" data-ls-reveal="${stepOf(i)}">${card(i)}</li>`)
      .join("");
    const slots = words
      .map(
        (_, i) =>
          `<li class="ls-so-slot"><span class="ls-so-card ls-so-placed ls-hide" data-ls-reveal="${stepOf(i)}">${card(i)}</span></li>`,
      )
      .join("");
    const last = stepOf(words.length - 1);
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-so" data-count="${words.length}" data-ls-complete>` +
      `<ul class="ls-so-pool">${pool}</ul>` +
      `<span class="ls-so-arrow" aria-hidden="true">▼</span>` +
      `<ol class="ls-so-answer">${slots}</ol>` +
      (c.meaning ? `<p class="ls-so-meaning ls-hide" data-ls-reveal="${last}" lang="vi">${esc(c.meaning)}</p>` : "") +
      `</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    { kind: "text", key: "words", label: "Câu đúng (ngăn các thẻ bằng /)", lang: "zh", placeholder: "我 / 是 / 学生" },
    { kind: "text", key: "pinyin", label: "Pinyin (ngăn bằng / tương ứng)", lang: "pinyin", placeholder: "wǒ / shì / xué sheng" },
    { kind: "text", key: "meaning", label: "Nghĩa (hiện khi xong)", lang: "vi" },
    { kind: "toggle", key: "allAtOnce", label: "Hiện cả câu một lần (thay vì từng thẻ)" },
  ],
};

export default sentenceOrder;

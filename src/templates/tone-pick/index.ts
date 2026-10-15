import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { audioButton, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

export type Tone = 0 | 1 | 2 | 3 | 4;

const MARKS: Record<string, Tone> = {};
for (const [tone, letters] of [
  [1, "āēīōūǖĀĒĪŌŪǕ"],
  [2, "áéíóúǘÁÉÍÓÚǗ"],
  [3, "ǎěǐǒǔǚǍĚǏǑǓǙ"],
  [4, "àèìòùǜÀÈÌÒÙǛ"],
] as const) {
  for (const ch of letters) MARKS[ch] = tone;
}

/**
 * Tone of each syllable, from tone marks ("nǐ hǎo" → [3, 3]) or trailing
 * digits ("ni3 hao3"); 0 is the neutral tone. Syllables are separated by
 * spaces, so "píngguǒ" written without one counts as one syllable.
 */
export function tonesOf(text: string): Tone[] {
  return text
    .normalize("NFC")
    .split(/\s+/)
    .map((s) => s.replace(/[^\p{L}\d]/gu, ""))
    .filter(Boolean)
    .map((syllable) => {
      const digit = /([0-5])$/.exec(syllable);
      if (digit) return (Number(digit[1]) % 5) as Tone;
      for (const ch of syllable) if (MARKS[ch]) return MARKS[ch]!;
      return 0;
    });
}

/** Pitch contours on a 5-level scale (Chao numbers 55, 35, 214, 51). */
const CONTOURS: Record<Tone, string> = {
  1: '<path d="M14 18 H86"/>',
  2: '<path d="M14 54 L86 18"/>',
  3: '<path d="M14 66 Q42 98 58 80 T86 34"/>',
  4: '<path d="M14 18 L86 86"/>',
  0: '<circle cx="50" cy="60" r="8" class="ls-tp-dot"/>',
};

function contour(tone: Tone): string {
  return (
    `<span class="ls-tp-tone ls-tp-t${tone}">` +
    `<svg viewBox="0 0 100 100" aria-hidden="true"><path class="ls-tp-lines" d="M8 18 H92 M8 52 H92 M8 86 H92"/>${CONTOURS[tone]}</svg>` +
    `<span class="ls-tp-number">${tone || "·"}</span>` +
    `</span>`
  );
}

const LEGEND = [
  [1, "ā"],
  [2, "á"],
  [3, "ǎ"],
  [4, "à"],
] as const;

const item = z.object({
  hanzi: z.string().regex(/\S/, "Không được để trống").max(8),
  pinyin: z.string().regex(/\S/, "Cần pinyin có dấu thanh").max(40),
  audio: AssetIdRef.optional(),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  items: z.array(item).min(1, "Cần ít nhất 1 chữ").max(6, "Tối đa 6 chữ"),
  legend: z.boolean().default(true),
});

export type TonePickContent = z.output<typeof schema>;

export const tonePick: SlideTemplate<TonePickContent> = {
  type: "tone-pick",
  label: "Chọn thanh điệu",
  description: "Nghe hoặc nhìn chữ, giơ ngón tay chọn thanh điệu",
  category: "qa",
  order: 150,
  schema,
  aiSchemaHint:
    'Nghe hoặc nhìn chữ, trẻ giơ 1–4 ngón tay chọn thanh điệu; bấm Tiếp hiện thanh đúng. {"heading"?: tiêu đề, "items": [{"hanzi", "pinyin": có dấu thanh, mỗi âm tiết cách nhau bằng dấu cách}] (1–6), "legend"?: true để hiện bảng 4 thanh}',
  defaults: () => ({
    heading: "Thanh mấy?",
    items: [
      { hanzi: "妈", pinyin: "mā" },
      { hanzi: "麻", pinyin: "má" },
      { hanzi: "马", pinyin: "mǎ" },
      { hanzi: "骂", pinyin: "mà" },
    ],
    legend: true,
  }),
  limits: { heading: { maxChars: 40 }, "items.*.hanzi": { maxChars: 3 } },
  render(c, ctx) {
    const cards = c.items
      .map(
        (it, i) =>
          `<li class="ls-tp-card">` +
          zh(it.hanzi, "span", "ls-tp-hanzi") +
          `<div class="ls-tp-answer ls-hide" data-ls-reveal data-ls-sound="correct">` +
          pinyin(it.pinyin, "span", "ls-tp-pinyin") +
          `<span class="ls-tp-tones">${tonesOf(it.pinyin).map(contour).join("")}</span>` +
          `</div>` +
          audioButton(ctx, it.audio, `${ctx.slideId}-audio-${i}`, `Nghe ${it.hanzi}`) +
          `</li>`,
      )
      .join("");
    const legend = c.legend
      ? `<ol class="ls-tp-legend" aria-label="Bốn thanh">` +
        LEGEND.map(
          ([t, mark]) =>
            `<li class="ls-tp-t${t}"><span class="ls-tp-finger">${t}</span>` +
            `<svg viewBox="0 0 100 100" aria-hidden="true">${CONTOURS[t]}</svg>` +
            `<span class="ls-pinyin" lang="zh-Latn-pinyin">${mark}</span></li>`,
        ).join("") +
        `</ol>`
      : "";
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<ul class="ls-tp-grid" data-count="${c.items.length}">${cards}</ul>` +
      legend
    );
  },
  css,
  fromWords: { list: "items", max: 6, item: (w) => ({ hanzi: w.hanzi, pinyin: w.pinyin }) },
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "items",
      label: "Chữ (thanh điệu lấy từ dấu trong pinyin)",
      itemLabel: "chữ",
      min: 1,
      max: 6,
      newItem: () => ({ hanzi: "", pinyin: "" }),
      fields: [
        { kind: "text", key: "hanzi", label: "Chữ Hán", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin có dấu thanh", lang: "pinyin", placeholder: "mǎ" },
        { kind: "asset", key: "audio", label: "Âm thanh", assetKind: "audio", speakFrom: "hanzi", autoAudio: true },
      ],
    },
    { kind: "toggle", key: "legend", label: "Hiện bảng 4 thanh (giơ 1–4 ngón tay)" },
  ],
};

export default tonePick;

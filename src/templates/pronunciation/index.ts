import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { audioButton, autoText, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const item = z.object({
  hanzi: z.string().max(40).default(""),
  /** Syllables separated by spaces, so one can carry the stress dot. */
  pinyin: z.string().regex(/\S/, "Không được để trống").max(120),
  meaning: z.string().max(60).default(""),
  /** Which syllable is stressed (1-based); "0" for none. */
  stress: z.enum(["0", "1", "2", "3", "4"]).default("0"),
  /** The sentence's intonation at its end. */
  intonation: z.enum(["none", "up", "down"]).default("none"),
  audio: AssetIdRef.optional(),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  /** The rule being practised, in Vietnamese. */
  rule: z.string().max(200).default(""),
  items: z.array(item).min(1, "Cần ít nhất 1 dòng").max(8, "Tối đa 8 dòng"),
});

export type PronunciationContent = z.output<typeof schema>;

const ARROW = { none: "", up: "↗", down: "↘" } as const;

export const pronunciation: SlideTemplate<PronunciationContent> = {
  type: "pronunciation",
  label: "Ngữ âm (语音)",
  description: "Nghe và đọc theo: trọng âm, ngữ điệu, cặp âm dễ nhầm",
  category: "qa",
  order: 155,
  schema,
  aiSchemaHint:
    'Phần 语音 của giáo trình: một quy tắc ngữ âm và các dòng để nghe và đọc theo. Trọng âm từ (HSK 2: chấm đỏ dưới âm tiết được nhấn), ngữ điệu câu (mũi tên lên/xuống cuối câu), thanh nhẹ, biến điệu, hoặc cặp âm dễ nhầm (bàng — pàng). {"heading"?: ví dụ "语音：词重音", "rule"?: quy tắc bằng tiếng Việt, "items": [{"hanzi"?: chữ Hán, "pinyin": pinyin có dấu, các âm tiết cách nhau bằng dấu cách (cặp âm thì viết "bàng — pàng"), "meaning"?: nghĩa, "stress"?: "1"–"4" âm tiết được nhấn, "intonation"?: "up" hoặc "down"}] (1–8)}',
  defaults: () => ({
    heading: "语音：词重音",
    rule: "Từ hai âm tiết thường nhấn vào âm tiết thứ hai; từ có thanh nhẹ thì nhấn âm tiết thứ nhất.",
    items: [
      { hanzi: "冰箱", pinyin: "bīng xiāng", meaning: "tủ lạnh", stress: "2", intonation: "none" },
      { hanzi: "东西", pinyin: "dōng xi", meaning: "đồ vật", stress: "1", intonation: "none" },
      { hanzi: "你去哪儿？", pinyin: "nǐ qù nǎr?", meaning: "Bạn đi đâu?", stress: "0", intonation: "down" },
    ],
  }),
  limits: {
    heading: { maxChars: 30 },
    rule: { maxChars: 140 },
    "items.*.hanzi": { maxChars: 16 },
  },
  render(c, ctx) {
    const rows = c.items
      .map((it, i) => {
        const stressed = Number(it.stress);
        const syllables = it.pinyin
          .trim()
          .split(/\s+/)
          .map((s, k) => `<span class="ls-pr-syllable${k + 1 === stressed ? " ls-pr-stress" : ""}">${esc(s)}</span>`)
          .join(" ");
        const arrow = ARROW[it.intonation];
        return (
          `<li class="ls-pr-item">` +
          `<span class="ls-pr-sound"><span class="ls-pinyin ls-pr-pinyin" lang="zh-Latn-pinyin">${syllables}</span>` +
          (arrow ? `<span class="ls-pr-arrow ls-pr-arrow--${it.intonation}" aria-label="${it.intonation === "up" ? "lên giọng" : "xuống giọng"}">${arrow}</span>` : "") +
          `</span>` +
          (it.hanzi ? zh(it.hanzi, "span", "ls-pr-hanzi") : "") +
          (it.meaning ? vi(it.meaning, "span", "ls-pr-meaning") : "") +
          audioButton(ctx, it.audio, `${ctx.slideId}-audio-${i}`, `Nghe dòng ${i + 1}`) +
          `</li>`
        );
      })
      .join("");
    return (
      (c.heading ? autoText(c.heading, "h2", "ls-heading") : "") +
      (c.rule ? vi(c.rule, "p", "ls-pr-rule") : "") +
      `<ol class="ls-pr" data-count="${c.items.length}">${rows}</ol>`
    );
  },
  css,
  blankHeading: "语音",
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "zh", placeholder: "语音：词重音" },
    { kind: "text", key: "rule", label: "Quy tắc (tiếng Việt)", lang: "vi", multiline: true },
    {
      kind: "list",
      key: "items",
      label: "Dòng đọc theo",
      itemLabel: "dòng",
      min: 1,
      max: 8,
      newItem: () => ({ hanzi: "", pinyin: "", meaning: "", stress: "0", intonation: "none" }),
      fields: [
        { kind: "text", key: "hanzi", label: "Chữ Hán", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin (âm tiết cách nhau bằng dấu cách)", lang: "pinyin" },
        { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
        {
          kind: "select",
          key: "stress",
          label: "Trọng âm",
          options: [
            { value: "0", label: "Không đánh dấu" },
            { value: "1", label: "Âm tiết 1" },
            { value: "2", label: "Âm tiết 2" },
            { value: "3", label: "Âm tiết 3" },
            { value: "4", label: "Âm tiết 4" },
          ],
        },
        {
          kind: "select",
          key: "intonation",
          label: "Ngữ điệu cuối câu",
          options: [
            { value: "none", label: "Không đánh dấu" },
            { value: "up", label: "Lên giọng ↗" },
            { value: "down", label: "Xuống giọng ↘" },
          ],
        },
        { kind: "asset", key: "audio", label: "Âm thanh", assetKind: "audio", speakFrom: "hanzi", autoAudio: true },
      ],
    },
  ],
};

export default pronunciation;

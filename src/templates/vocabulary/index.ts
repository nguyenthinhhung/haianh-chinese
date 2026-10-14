import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { audioButton, image, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const word = z.object({
  hanzi: z.string().regex(/\S/, "Không được để trống").max(16),
  pinyin: z.string().max(60).default(""),
  meaning: z.string().max(80).default(""),
  /** Part of speech for older learners: "động từ", "danh từ"… */
  pos: z.string().max(16).default(""),
  image: AssetIdRef.optional(),
  audio: AssetIdRef.optional(),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  words: z.array(word).min(1, "Cần ít nhất 1 từ").max(8, "Tối đa 8 từ"),
  hideMeaning: z.boolean().default(false),
});

export type VocabularyContent = z.output<typeof schema>;
type Word = VocabularyContent["words"][number];

const newWord = (): Word => ({ hanzi: "字", pinyin: "zì", meaning: "chữ", pos: "" });

export const vocabulary: SlideTemplate<VocabularyContent> = {
  type: "vocabulary",
  label: "Từ vựng",
  description: "1–8 từ kèm hình, pinyin và nghĩa",
  category: "teach",
  order: 20,
  schema,
  aiSchemaHint:
    '1–8 từ. {"heading"?: tiêu đề tiếng Việt, "words": [{"hanzi", "pinyin": có dấu thanh, "meaning": nghĩa tiếng Việt, "pos"?: từ loại ngắn bằng tiếng Việt (động từ, danh từ…), chỉ cho học sinh từ 9 tuổi}], "hideMeaning"?: true để hiện nghĩa từng từ khi bấm Tiếp}',
  defaults: () => ({
    heading: "Từ vựng",
    words: [
      { hanzi: "你好", pinyin: "nǐ hǎo", meaning: "xin chào", pos: "" },
      { hanzi: "谢谢", pinyin: "xiè xie", meaning: "cảm ơn", pos: "" },
    ],
    hideMeaning: false,
  }),
  limits: {
    heading: { maxChars: 40 },
    "words.*.hanzi": { maxChars: 4 },
    "words.*.pinyin": { maxChars: 20 },
    "words.*.meaning": { maxChars: 24 },
    "words.*.pos": { maxChars: 12 },
  },
  render(c, ctx) {
    const cards = c.words
      .map((w, i) => {
        const img = image(ctx, w.image, "ls-vocab-image");
        const audioId = `${ctx.slideId}-audio-${i}`;
        return (
          `<li class="ls-vocab-card${img ? " ls-vocab-card--image" : ""}">` +
          (img ? `<div class="ls-vocab-media">${img}</div>` : "") +
          zh(w.hanzi, "span", "ls-vocab-hanzi") +
          (w.pinyin ? pinyin(w.pinyin, "span", "ls-vocab-pinyin") : "") +
          (w.pos ? vi(w.pos, "span", "ls-pos") : "") +
          (w.meaning
            ? `<span class="ls-vocab-meaning${c.hideMeaning ? " ls-hide" : ""}"${c.hideMeaning ? " data-ls-reveal" : ""} lang="vi">${esc(w.meaning)}</span>`
            : "") +
          audioButton(ctx, w.audio, audioId, `Nghe ${w.hanzi}`) +
          `</li>`
        );
      })
      .join("");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<ul class="ls-vocab-grid" data-count="${c.words.length}">${cards}</ul>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "words",
      label: "Từ",
      itemLabel: "từ",
      min: 1,
      max: 8,
      newItem: newWord,
      fields: [
        { kind: "text", key: "hanzi", label: "Chữ Hán", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
        { kind: "text", key: "pos", label: "Từ loại (nếu cần)", lang: "vi", placeholder: "động từ" },
        { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["meaning", "hanzi"], autoImage: true },
        { kind: "asset", key: "audio", label: "Âm thanh", assetKind: "audio", speakFrom: "hanzi" },
      ],
    },
    { kind: "toggle", key: "hideMeaning", label: "Ẩn nghĩa, bấm Tiếp để hiện từng từ" },
  ],
};

export default vocabulary;

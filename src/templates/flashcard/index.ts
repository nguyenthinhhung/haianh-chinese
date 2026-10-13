import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { audioButton, image, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const card = z.object({
  hanzi: z.string().regex(/\S/, "Không được để trống").max(8),
  pinyin: z.string().max(40).default(""),
  meaning: z.string().max(60).default(""),
  image: AssetIdRef.optional(),
  audio: AssetIdRef.optional(),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  front: z.enum(["image", "hanzi"]).default("image"),
  cards: z.array(card).min(1, "Cần ít nhất 1 thẻ").max(6, "Tối đa 6 thẻ"),
});

export type FlashcardContent = z.output<typeof schema>;
type Card = FlashcardContent["cards"][number];

const newCard = (): Card => ({ hanzi: "字", pinyin: "zì", meaning: "chữ" });

export const flashcard: SlideTemplate<FlashcardContent> = {
  type: "flashcard",
  label: "Thẻ lật",
  category: "teach",
  order: 40,
  schema,
  aiSchemaHint:
    '1–6 thẻ lật; mỗi lần bấm Tiếp lật một thẻ. {"heading"?: tiêu đề tiếng Việt, "front": "image" (mặt trước là ảnh) hoặc "hanzi" (mặt trước là chữ Hán), "cards": [{"hanzi", "pinyin": có dấu thanh, "meaning": nghĩa tiếng Việt}]}',
  defaults: () => ({
    heading: "Đoán xem",
    front: "hanzi",
    cards: [
      { hanzi: "猫", pinyin: "māo", meaning: "con mèo" },
      { hanzi: "狗", pinyin: "gǒu", meaning: "con chó" },
      { hanzi: "鱼", pinyin: "yú", meaning: "con cá" },
    ],
  }),
  limits: {
    heading: { maxChars: 40 },
    "cards.*.hanzi": { maxChars: 4 },
    "cards.*.pinyin": { maxChars: 20 },
    "cards.*.meaning": { maxChars: 24 },
  },
  render(c, ctx) {
    const cards = c.cards
      .map((k, i) => {
        const img = c.front === "image" ? image(ctx, k.image, "ls-fc-image") : "";
        // A card set to show its picture first but without one falls back to the characters.
        const front = img || zh(k.hanzi, "span", "ls-fc-hanzi");
        const back =
          (img ? zh(k.hanzi, "span", "ls-fc-hanzi ls-fc-hanzi--back") : "") +
          (k.pinyin ? pinyin(k.pinyin, "span", "ls-fc-pinyin") : "") +
          (k.meaning ? vi(k.meaning, "span", "ls-fc-meaning") : "");
        return (
          `<li class="ls-fc-card" data-ls-reveal data-ls-sound="flip">` +
          `<div class="ls-fc-inner">` +
          `<div class="ls-fc-face ls-fc-front">${front}</div>` +
          `<div class="ls-fc-face ls-fc-back">${back}</div>` +
          `</div>` +
          audioButton(ctx, k.audio, `${ctx.slideId}-audio-${i}`, `Nghe ${k.hanzi}`) +
          `</li>`
        );
      })
      .join("");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<ul class="ls-fc-grid" data-count="${c.cards.length}">${cards}</ul>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "select",
      key: "front",
      label: "Mặt trước",
      options: [
        { value: "image", label: "Ảnh (lật ra chữ Hán, pinyin, nghĩa)" },
        { value: "hanzi", label: "Chữ Hán (lật ra pinyin, nghĩa)" },
      ],
    },
    {
      kind: "list",
      key: "cards",
      label: "Thẻ",
      itemLabel: "thẻ",
      min: 1,
      max: 6,
      newItem: newCard,
      fields: [
        { kind: "text", key: "hanzi", label: "Chữ Hán", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
        { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["meaning", "hanzi"] },
        { kind: "asset", key: "audio", label: "Âm thanh", assetKind: "audio", speakFrom: "hanzi" },
      ],
    },
  ],
};

export default flashcard;

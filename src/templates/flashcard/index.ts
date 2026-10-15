import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { audioButton, image, pinyin, vi, zh } from "../../renderer/helpers";
import interaction from "./interaction.js?raw";
import css from "./style.css?raw";

const card = z.object({
  hanzi: z.string().regex(/\S/, "Không được để trống").max(8),
  pinyin: z.string().max(40).default(""),
  meaning: z.string().max(60).default(""),
  /** Part of speech for older learners: "động từ", "danh từ"… */
  pos: z.string().max(16).default(""),
  image: AssetIdRef.optional(),
  audio: AssetIdRef.optional(),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  /** "blank": cards lie face down showing only their number, as for reviewing last lesson's words. */
  front: z.enum(["image", "hanzi", "blank"]).default("image"),
  cards: z.array(card).min(1, "Cần ít nhất 1 thẻ").max(8, "Tối đa 8 thẻ"),
});

export type FlashcardContent = z.output<typeof schema>;
type Card = FlashcardContent["cards"][number];

// Empty, so the teacher types straight in; the form shows hints instead.
const newCard = (): Card => ({ hanzi: "", pinyin: "", meaning: "", pos: "" });

export const flashcard: SlideTemplate<FlashcardContent> = {
  type: "flashcard",
  label: "Thẻ lật",
  description: "Thẻ lật chữ ↔ hình; lật lần lượt hoặc bấm thẻ bất kỳ",
  category: "teach",
  order: 40,
  schema,
  aiSchemaHint:
    '1–8 thẻ lật; bấm Tiếp lật lần lượt, hoặc giáo viên bấm vào thẻ bất kỳ để lật. {"heading"?: tiêu đề tiếng Việt, "front": "image" (mặt trước là ảnh, lật ra chữ), "hanzi" (mặt trước là chữ Hán, lật ra ảnh) hoặc "blank" (thẻ úp chỉ có số, lật ra chữ Hán và pinyin; để ôn từ bài trước), "cards": [{"hanzi", "pinyin": có dấu thanh, "meaning": nghĩa tiếng Việt, "pos"?: từ loại ngắn bằng tiếng Việt (động từ, danh từ…), chỉ cho học sinh từ 9 tuổi}]}',
  defaults: () => ({
    heading: "Đoán xem",
    front: "hanzi",
    cards: [
      { hanzi: "猫", pinyin: "māo", meaning: "con mèo", pos: "" },
      { hanzi: "狗", pinyin: "gǒu", meaning: "con chó", pos: "" },
      { hanzi: "鱼", pinyin: "yú", meaning: "con cá", pos: "" },
    ],
  }),
  limits: {
    heading: { maxChars: 40 },
    "cards.*.hanzi": { maxChars: 4 },
    "cards.*.pinyin": { maxChars: 20 },
    "cards.*.meaning": { maxChars: 24 },
    "cards.*.pos": { maxChars: 12 },
  },
  render(c, ctx) {
    const cards = c.cards
      .map((k, i) => {
        const img = image(ctx, k.image, "ls-fc-image");
        // A card set to show its picture first but without one falls back to the characters.
        const pictureFirst = c.front === "image" && img;
        const blank = c.front === "blank";
        const front = blank ? "" : pictureFirst ? img : zh(k.hanzi, "span", "ls-fc-hanzi");
        const back =
          (pictureFirst || blank
            ? zh(k.hanzi, "span", "ls-fc-hanzi ls-fc-hanzi--back")
            : img
              ? `<span class="ls-fc-media">${img}</span>`
              : "") +
          (k.pinyin ? pinyin(k.pinyin, "span", "ls-fc-pinyin") : "") +
          (k.pos ? vi(k.pos, "span", "ls-pos") : "") +
          (k.meaning ? vi(k.meaning, "span", "ls-fc-meaning") : "");
        // The number lets the teacher flip a card by typing it.
        const number = c.cards.length > 1 || blank ? `<span class="ls-fc-num">${i + 1}</span>` : "";
        return (
          `<li class="ls-fc-card${blank ? " ls-fc-card--blank" : ""}">` +
          `<div class="ls-fc-inner">` +
          `<div class="ls-fc-face ls-fc-front">${number}${front}</div>` +
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
  blankHeading: "Thẻ lật",
  interaction: { source: interaction },
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "select",
      key: "front",
      label: "Mặt trước",
      options: [
        { value: "image", label: "Ảnh (lật ra chữ Hán, pinyin, nghĩa)" },
        { value: "hanzi", label: "Chữ Hán (lật ra ảnh, pinyin, nghĩa)" },
        { value: "blank", label: "Úp, chỉ có số (lật ra chữ Hán, pinyin) — ôn từ bài trước" },
      ],
    },
    {
      kind: "list",
      key: "cards",
      label: "Thẻ",
      itemLabel: "thẻ",
      min: 1,
      max: 8,
      newItem: newCard,
      fields: [
        { kind: "text", key: "hanzi", label: "Chữ Hán", lang: "zh", placeholder: "苹果" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi", placeholder: "quả táo" },
        { kind: "text", key: "pos", label: "Từ loại (nếu cần)", lang: "vi", placeholder: "động từ" },
        {
          kind: "asset",
          key: "image",
          label: "Ảnh",
          assetKind: "image",
          searchFrom: ["meaning", "hanzi"],
          autoImage: true,
        },
        { kind: "asset", key: "audio", label: "Âm thanh", assetKind: "audio", speakFrom: "hanzi", autoAudio: true },
      ],
    },
  ],
};

export default flashcard;

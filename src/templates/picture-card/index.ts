import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { audioButton, image, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const schema = z.object({
  hanzi: z.string().regex(/\S/, "Không được để trống").max(8),
  pinyin: z.string().max(40).default(""),
  meaning: z.string().max(60).default(""),
  image: AssetIdRef.optional(),
  audio: AssetIdRef.optional(),
  hideWord: z.boolean().default(true),
});

export type PictureCardContent = z.output<typeof schema>;

export const pictureCard: SlideTemplate<PictureCardContent> = {
  type: "picture-card",
  label: "Thẻ hình",
  description: "Một từ với hình lớn cả slide",
  category: "teach",
  order: 30,
  schema,
  aiSchemaHint:
    'Một từ chiếm cả slide, hình lớn. {"hanzi", "pinyin": có dấu thanh, "meaning": nghĩa tiếng Việt, "hideWord"?: true để hiện hình trước, bấm Tiếp mới hiện chữ}',
  defaults: () => ({ hanzi: "苹果", pinyin: "píng guǒ", meaning: "quả táo", hideWord: true }),
  limits: {
    hanzi: { maxChars: 4 },
    pinyin: { maxChars: 24 },
    meaning: { maxChars: 30 },
  },
  render(c, ctx) {
    const img = image(ctx, c.image, "ls-pc-image");
    // With no picture there is nothing to guess from, so the word always shows.
    const hide = c.hideWord && !!img;
    return (
      `<div class="ls-pc${img ? " ls-pc--image" : ""}">` +
      (img ? `<div class="ls-pc-media">${img}</div>` : "") +
      `<div class="ls-pc-word${hide ? " ls-hide" : ""}"${hide ? " data-ls-reveal" : ""}>` +
      zh(c.hanzi, "span", "ls-pc-hanzi") +
      (c.pinyin ? pinyin(c.pinyin, "span", "ls-pc-pinyin") : "") +
      (c.meaning ? vi(c.meaning, "span", "ls-pc-meaning") : "") +
      `</div>` +
      audioButton(ctx, c.audio, `${ctx.slideId}-audio`, `Nghe ${c.hanzi}`) +
      `</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "hanzi", label: "Chữ Hán", lang: "zh" },
    { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
    { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
    { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["meaning", "hanzi"], autoImage: true },
    { kind: "asset", key: "audio", label: "Âm thanh", assetKind: "audio", speakFrom: "hanzi" },
    { kind: "toggle", key: "hideWord", label: "Hiện hình trước, bấm Tiếp mới hiện chữ" },
  ],
};

export default pictureCard;

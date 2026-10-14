import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { audioButton, autoText, image, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const schema = z.object({
  hanzi: z.string().regex(/\S/, "Không được để trống").max(8),
  pinyin: z.string().max(40).default(""),
  meaning: z.string().max(60).default(""),
  /** Part of speech for older learners: "động từ", "giới từ"… */
  pos: z.string().max(16).default(""),
  /** How the word combines, e.g. "往 + nơi chốn / phương hướng". */
  usage: z.string().max(80).default(""),
  examples: z
    .array(
      z.object({
        hanzi: z.string().regex(/\S/, "Không được để trống").max(30),
        pinyin: z.string().max(90).default(""),
        meaning: z.string().max(80).default(""),
      }),
    )
    .max(2, "Tối đa 2 câu ví dụ")
    .default([]),
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
    `Một từ chiếm cả slide, hình lớn. {"hanzi", "pinyin": có dấu thanh, "meaning": nghĩa tiếng Việt, "pos"?: từ loại ngắn bằng tiếng Việt (động từ, danh từ…), chỉ cho học sinh từ 9 tuổi, "usage"?: cách dùng/kết hợp ngắn, ví dụ "往 + nơi chốn", "examples"?: [{"hanzi": câu ví dụ, "pinyin", "meaning"}] (tối đa 2; dùng cho học sinh lớn), "hideWord"?: true để hiện hình trước, bấm Tiếp mới hiện chữ}`,
  defaults: () => ({ hanzi: "苹果", pinyin: "píng guǒ", meaning: "quả táo", pos: "", usage: "", examples: [], hideWord: true }),
  limits: {
    hanzi: { maxChars: 4 },
    pinyin: { maxChars: 24 },
    meaning: { maxChars: 30 },
    pos: { maxChars: 12 },
    usage: { maxChars: 40 },
    "examples.*.hanzi": { maxChars: 16 },
    "examples.*.meaning": { maxChars: 40 },
  },
  render(c, ctx) {
    const img = image(ctx, c.image, "ls-pc-image");
    // With no picture there is nothing to guess from, so the word always shows.
    const hide = c.hideWord && !!img;
    const detail = !!c.usage.trim() || c.examples.length > 0;
    // Shown next to the word; when the word is guessed first, usage and examples come one step later.
    const panel = detail
      ? `<div class="ls-pc-detail${hide ? " ls-hide" : ""}"${hide ? ' data-ls-reveal="2"' : ""}>` +
        (c.usage.trim() ? autoText(c.usage, "p", "ls-pc-usage") : "") +
        (c.examples.length
          ? `<ol class="ls-pc-examples">${c.examples
              .map(
                (e) =>
                  `<li>${zh(e.hanzi, "span", "ls-pc-ex-hanzi")}` +
                  (e.pinyin ? pinyin(e.pinyin, "span", "ls-pc-ex-pinyin") : "") +
                  (e.meaning ? vi(e.meaning, "span", "ls-pc-ex-meaning") : "") +
                  `</li>`,
              )
              .join("")}</ol>`
          : "") +
        `</div>`
      : "";
    return (
      `<div class="ls-pc${img ? " ls-pc--image" : ""}${detail ? " ls-pc--detail" : ""}">` +
      `<div class="ls-pc-main">` +
      (img ? `<div class="ls-pc-media">${img}</div>` : "") +
      `<div class="ls-pc-word${hide ? " ls-hide" : ""}"${hide ? ' data-ls-reveal="1"' : ""}>` +
      zh(c.hanzi, "span", "ls-pc-hanzi") +
      (c.pinyin ? pinyin(c.pinyin, "span", "ls-pc-pinyin") : "") +
      (c.pos ? vi(c.pos, "span", "ls-pos") : "") +
      (c.meaning ? vi(c.meaning, "span", "ls-pc-meaning") : "") +
      `</div>` +
      `</div>` +
      panel +
      audioButton(ctx, c.audio, `${ctx.slideId}-audio`, `Nghe ${c.hanzi}`) +
      `</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "hanzi", label: "Chữ Hán", lang: "zh" },
    { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
    { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
    { kind: "text", key: "pos", label: "Từ loại (nếu cần)", lang: "vi", placeholder: "động từ" },
    { kind: "text", key: "usage", label: "Cách dùng (nếu cần)", placeholder: "往 + nơi chốn / phương hướng" },
    {
      kind: "list",
      key: "examples",
      label: "Câu ví dụ (nếu cần)",
      itemLabel: "câu",
      min: 0,
      max: 2,
      newItem: () => ({ hanzi: "", pinyin: "", meaning: "" }),
      fields: [
        { kind: "text", key: "hanzi", label: "Câu (chữ Hán)", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
      ],
    },
    { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["meaning", "hanzi"], autoImage: true },
    { kind: "asset", key: "audio", label: "Âm thanh", assetKind: "audio", speakFrom: "hanzi", autoAudio: true },
    { kind: "toggle", key: "hideWord", label: "Hiện hình trước, bấm Tiếp mới hiện chữ" },
  ],
};

export default pictureCard;

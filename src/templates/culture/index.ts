import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { autoText, image, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const schema = z.object({
  heading: z.string().max(60).default(""),
  image: AssetIdRef.optional(),
  /** A saying (俗语) shown large, with its pinyin. */
  saying: z.string().max(30).default(""),
  sayingPinyin: z.string().max(100).default(""),
  /** The reading in Chinese, and its translation, shown on Next. */
  text: z.string().max(300).default(""),
  meaning: z.string().max(400).default(""),
});

export type CultureContent = z.output<typeof schema>;

export const culture: SlideTemplate<CultureContent> = {
  type: "culture",
  label: "Văn hoá / 俗语",
  description: "Trang văn hoá hoặc câu tục ngữ, có ảnh và bản dịch",
  category: "teach",
  order: 68,
  schema,
  aiSchemaHint:
    'Trang văn hoá (文化) hoặc câu tục ngữ (俗语) như cuối bài giáo trình: ảnh, câu tục ngữ kèm pinyin và/hoặc một đoạn đọc ngắn bằng chữ Hán; bấm Tiếp hiện bản dịch / giải thích tiếng Việt. {"heading"?: ví dụ "文化" hoặc "俗语", "image"?: từ khoá tìm ảnh, "saying"?: câu tục ngữ, "sayingPinyin"?, "text"?: đoạn đọc chữ Hán (tối đa 300 ký tự), "meaning"?: bản dịch hoặc giải thích tiếng Việt}',
  defaults: () => ({
    heading: "俗语",
    saying: "百闻不如一见",
    sayingPinyin: "bǎi wén bù rú yí jiàn",
    text: "",
    meaning: "Trăm nghe không bằng một thấy: nghe người khác kể nhiều lần cũng không bằng tự mình nhìn thấy.",
  }),
  limits: {
    heading: { maxChars: 30 },
    saying: { maxChars: 14 },
    text: { maxChars: 200 },
    meaning: { maxChars: 260 },
  },
  render(c, ctx) {
    const img = image(ctx, c.image, "ls-cu-image");
    const words =
      (c.saying ? `<div class="ls-cu-saying">${c.sayingPinyin ? pinyin(c.sayingPinyin, "span", "ls-cu-saying-pinyin") : ""}${zh(c.saying, "span", "ls-cu-saying-text")}</div>` : "") +
      (c.text ? zh(c.text, "p", "ls-cu-text") : "") +
      (c.meaning ? `<div class="ls-cu-meaning ls-hide" data-ls-reveal>${vi(c.meaning, "p")}</div>` : "");
    return (
      (c.heading ? autoText(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-cu${img ? " ls-cu--image" : ""}">${img ? `<div class="ls-cu-media">${img}</div>` : ""}<div class="ls-cu-words">${words}</div></div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "zh", placeholder: "文化 / 俗语" },
    { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["meaning", "saying"] },
    { kind: "text", key: "saying", label: "Câu tục ngữ (nếu có)", lang: "zh" },
    { kind: "text", key: "sayingPinyin", label: "Pinyin câu tục ngữ", lang: "pinyin" },
    { kind: "text", key: "text", label: "Đoạn đọc (chữ Hán)", lang: "zh", multiline: true },
    { kind: "text", key: "meaning", label: "Bản dịch / giải thích (hiện khi bấm Tiếp)", lang: "vi", multiline: true },
  ],
};

export default culture;

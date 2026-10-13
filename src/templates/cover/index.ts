import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { image, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const schema = z.object({
  title: z.string().regex(/\S/, "Không được để trống").max(60),
  pinyin: z.string().max(120).default(""),
  subtitle: z.string().max(120).default(""),
  image: AssetIdRef.optional(),
});

export type CoverContent = z.output<typeof schema>;

export const cover: SlideTemplate<CoverContent> = {
  type: "cover",
  label: "Trang bìa",
  category: "teach",
  order: 10,
  schema,
  aiSchemaHint:
    'Trang tiêu đề hoặc mở đầu một phần. {"title": chữ Hán, "pinyin"?: pinyin có dấu thanh, "subtitle"?: tiếng Việt}',
  defaults: () => ({ title: "新课", pinyin: "xīn kè", subtitle: "Bài mới" }),
  limits: {
    title: { maxChars: 12 },
    pinyin: { maxChars: 40 },
    subtitle: { maxChars: 50 },
  },
  render(c, ctx) {
    const img = image(ctx, c.image, "ls-cover-image");
    return (
      `<div class="ls-cover${img ? " ls-cover--image" : ""}">` +
      (img ? `<div class="ls-cover-media">${img}</div>` : "") +
      `<div class="ls-cover-text">` +
      zh(c.title, "h1", "ls-cover-title") +
      (c.pinyin ? pinyin(c.pinyin, "p", "ls-cover-pinyin") : "") +
      (c.subtitle ? vi(c.subtitle, "p", "ls-cover-subtitle") : "") +
      `</div></div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "title", label: "Tiêu đề (chữ Hán)", lang: "zh" },
    { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin", placeholder: "píng guǒ" },
    { kind: "text", key: "subtitle", label: "Phụ đề (tiếng Việt)", lang: "vi" },
    { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["subtitle", "title"] },
  ],
};

export default cover;

import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { audioButton, autoText, image, vi } from "../../renderer/helpers";
import css from "./style.css?raw";

const schema = z.object({
  heading: z.string().max(60).default(""),
  /** A page or part of a page of the textbook, or any picture shown large. */
  image: AssetIdRef.optional(),
  caption: z.string().max(160).default(""),
  /** The textbook's recording for this page. */
  track: AssetIdRef.optional(),
});

export type BookPageContent = z.output<typeof schema>;

export const bookPage: SlideTemplate<BookPageContent> = {
  type: "book-page",
  label: "Trang sách / Ảnh lớn",
  description: "Ảnh chụp trang giáo trình hoặc một ảnh lớn, kèm file nghe",
  category: "teach",
  order: 15,
  schema,
  aiSchemaHint:
    'Một ảnh lớn chiếm cả slide, thường là ảnh chụp trang giáo trình do giáo viên tự chèn sau; chỉ dùng khi giáo viên yêu cầu. {"heading"?: tiêu đề tiếng Việt, "caption"?: chú thích ngắn}',
  defaults: () => ({ heading: "", caption: "" }),
  limits: {
    heading: { maxChars: 40 },
    caption: { maxChars: 80 },
  },
  render(c, ctx) {
    const img = image(ctx, c.image, "ls-bp-image");
    const play = audioButton(ctx, c.track, `${ctx.slideId}-track`, "Nghe");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-page">` +
      `<div class="ls-page-media">${img || `<span class="ls-page-empty" lang="vi">Dán ảnh trang sách vào ô Ảnh (Ctrl+V)</span>`}</div>` +
      (c.caption || play
        ? `<div class="ls-page-foot">${play}${c.caption ? autoText(c.caption, "p", "ls-page-caption") : ""}</div>`
        : "") +
      `</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    { kind: "asset", key: "image", label: "Ảnh (chụp màn hình trang sách rồi Ctrl+V)", assetKind: "image" },
    { kind: "text", key: "caption", label: "Chú thích", lang: "vi" },
    { kind: "asset", key: "track", label: "File nghe của trang này", assetKind: "audio" },
  ],
};

export default bookPage;

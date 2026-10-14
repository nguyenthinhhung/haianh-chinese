import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { RenderContext, SlideTemplate } from "../../core/template";
import { autoText, image, stableShuffle, vi } from "../../renderer/helpers";
import interaction from "./interaction.js?raw";
import css from "./style.css?raw";

const pair = z
  .object({
    a: z.string().max(20).default(""),
    aImage: AssetIdRef.optional(),
    b: z.string().max(20).default(""),
    bImage: AssetIdRef.optional(),
  })
  .refine((p) => p.a.trim() || p.aImage, { message: "Cần chữ hoặc ảnh", path: ["a"] });

const schema = z.object({
  heading: z.string().max(60).default(""),
  pairs: z.array(pair).min(2, "Cần ít nhất 2 cặp").max(8, "Tối đa 8 cặp"),
});

export type MemoryContent = z.output<typeof schema>;
type Pair = MemoryContent["pairs"][number];

function face(ctx: RenderContext, text: string, imageId: string | undefined): string {
  const img = image(ctx, imageId, "ls-mm-image");
  return (img ? `<span class="ls-mm-media">${img}</span>` : "") + (text ? autoText(text, "span", "ls-mm-text") : "");
}

/** The two cards of a pair; a pair with no second side is two identical cards. */
function sides(ctx: RenderContext, p: Pair): [string, string] {
  const first = face(ctx, p.a, p.aImage);
  const second = p.b.trim() || p.bImage ? face(ctx, p.b, p.bImage) : first;
  return [first, second];
}

export const memory: SlideTemplate<MemoryContent> = {
  type: "memory",
  label: "Lật cặp",
  category: "game",
  order: 250,
  schema,
  aiSchemaHint:
    'Trò lật thẻ tìm cặp: thẻ úp đánh số, trẻ gọi hai số, giáo viên lật; trùng cặp thì giữ mở. {"heading"?: tiêu đề, "pairs": [{"a": chữ Hán, "b"?: nghĩa tiếng Việt (bỏ trống thì hai thẻ giống nhau)}] (2–8 cặp)}',
  defaults: () => ({
    heading: "Tìm cặp",
    pairs: [
      { a: "猫", b: "con mèo" },
      { a: "狗", b: "con chó" },
      { a: "鱼", b: "con cá" },
      { a: "鸟", b: "con chim" },
      { a: "马", b: "con ngựa" },
      { a: "牛", b: "con bò" },
    ],
  }),
  limits: { heading: { maxChars: 40 }, "pairs.*.a": { maxChars: 6 }, "pairs.*.b": { maxChars: 12 } },
  render(c, ctx) {
    const cards = c.pairs.flatMap((p, i) => sides(ctx, p).map((html) => ({ html, pair: i })));
    const grid = stableShuffle(cards.length, ctx.slideId)
      .map((k, pos) => {
        const card = cards[k]!;
        return (
          `<li><button type="button" class="ls-mm-card" data-pair="${card.pair}" data-n="${pos + 1}">` +
          `<span class="ls-mm-back">${pos + 1}</span>` +
          `<span class="ls-mm-face">${card.html}</span>` +
          `</button></li>`
        );
      })
      .join("");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<ul class="ls-mm-grid" data-count="${cards.length}">${grid}</ul>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "pairs",
      label: "Các cặp (bỏ trống mặt thứ hai thì hai thẻ giống nhau)",
      itemLabel: "cặp",
      min: 2,
      max: 8,
      newItem: () => ({ a: "", b: "" }),
      fields: [
        { kind: "text", key: "a", label: "Thẻ thứ nhất (chữ)" },
        { kind: "asset", key: "aImage", label: "hoặc ảnh", assetKind: "image", searchFrom: ["b", "a"] },
        { kind: "text", key: "b", label: "Thẻ thứ hai (chữ)" },
        { kind: "asset", key: "bImage", label: "hoặc ảnh", assetKind: "image", searchFrom: ["b", "a"] },
      ],
    },
  ],
  interaction: { source: interaction },
};

export default memory;

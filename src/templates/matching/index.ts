import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { autoText, image, pinyin, stableShuffle, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const pair = z
  .object({
    left: z.string().regex(/\S/, "Không được để trống").max(12),
    leftPinyin: z.string().max(40).default(""),
    right: z.string().max(40).default(""),
    rightImage: AssetIdRef.optional(),
  })
  .refine((p) => p.right.trim() || p.rightImage, { message: "Cần nghĩa hoặc ảnh", path: ["right"] });

const schema = z.object({
  heading: z.string().max(60).default(""),
  /** "image": the right column shows pictures only, found from the meaning. */
  rightAs: z.enum(["text", "image"]).default("text"),
  pairs: z.array(pair).min(2, "Cần ít nhất 2 cặp").max(6, "Tối đa 6 cặp"),
});

export type MatchingContent = z.output<typeof schema>;

export const matching: SlideTemplate<MatchingContent> = {
  type: "matching",
  label: "Ghép cặp",
  description: "Nối chữ Hán với nghĩa hoặc với hình",
  category: "qa",
  order: 120,
  schema,
  aiSchemaHint:
    'Hai cột để ghép; cột phải tự xáo trộn, mỗi lần bấm Tiếp nối một cặp. {"heading"?: tiêu đề, "rightAs"?: "image" để cột phải là hình thay cho nghĩa (ghép chữ với hình, hợp với trẻ nhỏ), "pairs": [{"left": chữ Hán, "leftPinyin"?: pinyin, "right": nghĩa tiếng Việt (vẫn ghi khi cột phải là hình)}] (2–6 cặp)}',
  defaults: () => ({
    heading: "Ghép chữ với nghĩa",
    rightAs: "text",
    pairs: [
      { left: "红", leftPinyin: "hóng", right: "màu đỏ" },
      { left: "绿", leftPinyin: "lǜ", right: "màu xanh lá" },
      { left: "白", leftPinyin: "bái", right: "màu trắng" },
      { left: "黑", leftPinyin: "hēi", right: "màu đen" },
    ],
  }),
  limits: {
    heading: { maxChars: 40 },
    "pairs.*.left": { maxChars: 5 },
    "pairs.*.right": { maxChars: 18 },
  },
  render(c, ctx) {
    // Pair i is step i + 1; both of its items share the colour and the number.
    const badge = (i: number) => `<span class="ls-mt-badge">${i + 1}</span>`;
    const left = c.pairs
      .map(
        (p, i) =>
          `<li class="ls-mt-item ls-mt-c${(i % 6) + 1}" data-ls-reveal="${i + 1}" data-ls-sound="correct">` +
          zh(p.left, "span", "ls-mt-hanzi") +
          (p.leftPinyin ? pinyin(p.leftPinyin, "span", "ls-mt-pinyin") : "") +
          badge(i) +
          `</li>`,
      )
      .join("");
    const right = stableShuffle(c.pairs.length, ctx.slideId)
      .map((i) => {
        const p = c.pairs[i]!;
        const img = image(ctx, p.rightImage, "ls-mt-image");
        // Pictures only when asked for and found; otherwise the meaning stays.
        const text = p.right && !(c.rightAs === "image" && img) ? autoText(p.right, "span", "ls-mt-text") : "";
        return (
          `<li class="ls-mt-item ls-mt-c${(i % 6) + 1}${img ? " ls-mt-item--image" : ""}" data-ls-reveal="${i + 1}">` +
          badge(i) +
          (img ? `<span class="ls-mt-media">${img}</span>` : "") +
          text +
          `</li>`
        );
      })
      .join("");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-mt" data-count="${c.pairs.length}" data-ls-complete>` +
      `<ol class="ls-mt-col ls-mt-left">${left}</ol>` +
      `<ol class="ls-mt-col ls-mt-right">${right}</ol>` +
      `</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "select",
      key: "rightAs",
      label: "Cột phải",
      options: [
        { value: "text", label: "Nghĩa (chữ)" },
        { value: "image", label: "Hình (ghép chữ với hình)" },
      ],
    },
    {
      kind: "list",
      key: "pairs",
      label: "Các cặp (cột phải sẽ tự xáo trộn)",
      itemLabel: "cặp",
      min: 2,
      max: 6,
      newItem: () => ({ left: "", leftPinyin: "", right: "" }),
      fields: [
        { kind: "text", key: "left", label: "Bên trái (chữ Hán)", lang: "zh" },
        { kind: "text", key: "leftPinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "text", key: "right", label: "Bên phải (nghĩa)", lang: "vi" },
        {
          kind: "asset",
          key: "rightImage",
          label: "Ảnh bên phải",
          assetKind: "image",
          searchFrom: ["right", "left"],
          autoImage: (c: MatchingContent) => c.rightAs === "image",
        },
      ],
    },
  ],
};

export default matching;

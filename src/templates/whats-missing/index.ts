import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { image, pinyin, vi, zh } from "../../renderer/helpers";
import interaction from "./interaction.js?raw";
import css from "./style.css?raw";

const item = z.object({
  hanzi: z.string().regex(/\S/, "Không được để trống").max(8),
  pinyin: z.string().max(40).default(""),
  image: AssetIdRef.optional(),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  items: z.array(item).min(4, "Cần ít nhất 4 hình").max(8, "Tối đa 8 hình"),
  rounds: z.enum(["1", "2", "3", "4", "5"]).default("3"),
});

export type WhatsMissingContent = z.output<typeof schema>;

export const whatsMissing: SlideTemplate<WhatsMissingContent> = {
  type: "whats-missing",
  label: "Cái gì biến mất?",
  category: "game",
  order: 210,
  schema,
  aiSchemaHint:
    'Trò "What\'s missing": hiện 4–8 từ, bấm Tiếp một từ biến mất cho trẻ đoán, bấm Tiếp hiện lại. {"heading"?: tiêu đề, "items": [{"hanzi", "pinyin"?}] (4–8), "rounds": "1"–"5" số vòng}',
  defaults: () => ({
    heading: "少了什么？",
    items: [
      { hanzi: "苹果", pinyin: "píng guǒ" },
      { hanzi: "香蕉", pinyin: "xiāng jiāo" },
      { hanzi: "西瓜", pinyin: "xī guā" },
      { hanzi: "橙子", pinyin: "chéng zi" },
      { hanzi: "葡萄", pinyin: "pú tao" },
      { hanzi: "草莓", pinyin: "cǎo méi" },
    ],
    rounds: "3",
  }),
  limits: { heading: { maxChars: 40 }, "items.*.hanzi": { maxChars: 4 } },
  render(c, ctx) {
    const cards = c.items
      .map((it) => {
        const img = image(ctx, it.image, "ls-wm-image");
        return (
          `<li class="ls-wm-card${img ? " ls-wm-card--image" : ""}">` +
          `<div class="ls-wm-face">` +
          (img ? `<span class="ls-wm-media">${img}</span>` : "") +
          zh(it.hanzi, "span", "ls-wm-hanzi") +
          (it.pinyin ? pinyin(it.pinyin, "span", "ls-wm-pinyin") : "") +
          `</div>` +
          `<span class="ls-wm-mystery" aria-hidden="true">?</span>` +
          `</li>`
        );
      })
      .join("");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<ul class="ls-wm-grid" data-count="${c.items.length}" data-rounds="${Number(c.rounds) || 3}">${cards}</ul>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "items",
      label: "Hình / từ",
      itemLabel: "hình",
      min: 4,
      max: 8,
      newItem: () => ({ hanzi: "", pinyin: "" }),
      fields: [
        { kind: "text", key: "hanzi", label: "Chữ Hán", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["hanzi"], autoImage: true },
      ],
    },
    {
      kind: "select",
      key: "rounds",
      label: "Số vòng (mỗi vòng: một hình biến mất rồi hiện lại)",
      options: ["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: `${n} vòng` })),
    },
  ],
  interaction: { source: interaction },
};

export default whatsMissing;

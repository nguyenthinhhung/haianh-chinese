import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { image, pinyin, vi, zh } from "../../renderer/helpers";
import interaction from "./interaction.js?raw";
import css from "./style.css?raw";

const MODES = ["flash", "zoom", "blur", "tiles"] as const;
const FOCUS = ["center", "top-left", "top-right", "bottom-left", "bottom-right"] as const;

const schema = z.object({
  heading: z.string().max(60).default(""),
  image: AssetIdRef.optional(),
  hanzi: z.string().max(12).default(""),
  pinyin: z.string().max(40).default(""),
  meaning: z.string().max(60).default(""),
  mode: z.enum(MODES).default("tiles"),
  grid: z.enum(["3", "4"]).default("3"),
  focus: z.enum(FOCUS).default("center"),
});

export type GuessPictureContent = z.output<typeof schema>;

export const guessPicture: SlideTemplate<GuessPictureContent> = {
  type: "guess-picture",
  label: "Đoán hình",
  description: "Đoán từ qua hình bị che, làm mờ hoặc mở từng ô",
  category: "game",
  order: 220,
  schema,
  aiSchemaHint:
    'Đoán từ qua hình bị che. {"heading"?: tiêu đề, "hanzi": đáp án chữ Hán, "pinyin"?, "meaning"?: nghĩa tiếng Việt, "mode": "flash" (chớp nhanh) | "zoom" (phóng to rồi thu dần) | "blur" (mờ dần rõ) | "tiles" (mở từng ô), "grid"?: "3" hoặc "4" ô mỗi cạnh khi "tiles"}',
  defaults: () => ({
    heading: "Đây là gì?",
    hanzi: "熊猫",
    pinyin: "xióng māo",
    meaning: "gấu trúc",
    mode: "tiles",
    grid: "3",
    focus: "center",
  }),
  limits: { heading: { maxChars: 40 }, hanzi: { maxChars: 6 }, meaning: { maxChars: 30 } },
  render(c, ctx) {
    const img = image(ctx, c.image, "ls-gp-image");
    const mode = (MODES as readonly string[]).includes(c.mode) ? c.mode : "tiles";
    const size = c.grid === "4" ? 4 : 3;
    const tiles =
      mode === "tiles"
        ? `<ol class="ls-gp-tiles" style="--n:${size}">` +
          Array.from({ length: size * size }, (_, i) => `<li><button type="button" class="ls-gp-tile" data-n="${i + 1}">${i + 1}</button></li>`).join("") +
          `</ol>`
        : "";
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-gp" data-mode="${mode}" data-focus="${(FOCUS as readonly string[]).includes(c.focus) ? c.focus : "center"}">` +
      `<div class="ls-gp-frame">` +
      (img || vi("Thêm ảnh để chơi", "span", "ls-gp-empty")) +
      tiles +
      (mode === "flash" ? `<div class="ls-gp-cover" aria-hidden="true">?</div>` : "") +
      `</div>` +
      `<div class="ls-gp-answer ls-hide">` +
      (c.hanzi ? zh(c.hanzi, "span", "ls-gp-hanzi") : "") +
      (c.pinyin ? pinyin(c.pinyin, "span", "ls-gp-pinyin") : "") +
      (c.meaning ? vi(c.meaning, "span", "ls-gp-meaning") : "") +
      `</div>` +
      `</div>`
    );
  },
  css,
  blankHeading: "Đây là gì?",
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    { kind: "asset", key: "image", label: "Ảnh cần đoán", assetKind: "image", searchFrom: ["meaning", "hanzi"], autoImage: true },
    { kind: "text", key: "hanzi", label: "Đáp án (chữ Hán)", lang: "zh" },
    { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
    { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
    {
      kind: "select",
      key: "mode",
      label: "Cách chơi",
      options: [
        { value: "tiles", label: "Mở từng ô (gọi số ô)" },
        { value: "zoom", label: "Phóng to rồi thu dần" },
        { value: "blur", label: "Mờ dần rõ" },
        { value: "flash", label: "Chớp nhanh" },
      ],
    },
    {
      kind: "select",
      key: "grid",
      label: "Số ô",
      options: [
        { value: "3", label: "3 × 3 (9 ô)" },
        { value: "4", label: "4 × 4 (16 ô)" },
      ],
      when: (c) => c.mode === "tiles",
    },
    {
      kind: "select",
      key: "focus",
      label: "Phóng to vào",
      options: [
        { value: "center", label: "Giữa ảnh" },
        { value: "top-left", label: "Góc trên trái" },
        { value: "top-right", label: "Góc trên phải" },
        { value: "bottom-left", label: "Góc dưới trái" },
        { value: "bottom-right", label: "Góc dưới phải" },
      ],
      when: (c) => c.mode === "zoom",
    },
  ],
  interaction: { source: interaction },
};

export default guessPicture;

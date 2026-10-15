import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { audioButton, image, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const word = z.object({
  hanzi: z.string().regex(/\S/, "Không được để trống").max(8),
  pinyin: z.string().max(40).default(""),
  pos: z.string().max(16).default(""),
  meaning: z.string().max(60).default(""),
  audio: AssetIdRef.optional(),
});

const schema = z.object({
  heading: z.string().max(40).default(""),
  words: z.array(word).min(1, "Cần ít nhất 1 từ").max(2, "Tối đa 2 từ"),
  /** One character written stroke by stroke in a 田字格 box. */
  write: z.string().max(2).default(""),
  /** Its strokes as SVG paths (filled in by the app), and the character they belong to. */
  strokes: z
    .array(z.string().regex(/^[0-9 MLQCZ.-]{1,4000}$/, "Nét viết không hợp lệ"))
    .max(64)
    .default([]),
  strokesFor: z.string().max(2).default(""),
  example: z.string().max(40).default(""),
  examplePinyin: z.string().max(120).default(""),
  exampleMeaning: z.string().max(100).default(""),
  image: AssetIdRef.optional(),
});

export type WordStudyContent = z.output<typeof schema>;

/** The 田字格 box: frame, dashed centre lines and diagonals, on the 1024-unit grid of the stroke data. */
const GRID =
  `<rect class="ls-ws-frame" x="8" y="8" width="1008" height="1008"/>` +
  `<path class="ls-ws-guide" d="M 512 8 L 512 1016 M 8 512 L 1016 512 M 8 8 L 1016 1016 M 1016 8 L 8 1016"/>`;

export const wordStudy: SlideTemplate<WordStudyContent> = {
  type: "word-study",
  label: "Từ mới kèm cách viết",
  description: "1–2 từ, một chữ viết theo thứ tự nét, câu ví dụ",
  category: "teach",
  order: 32,
  schema,
  aiSchemaHint:
    'Dạy từ mới như slide 生词 của giáo viên: 1–2 từ (pinyin, từ loại, nghĩa), một chữ Hán viết theo thứ tự nét trong ô 田字格 (ứng dụng tự lấy nét viết; bấm Tiếp để viết), một câu ví dụ. {"heading"?: "生词", "words": [{"hanzi", "pinyin", "pos"?: từ loại tiếng Việt như "danh từ", "meaning"}] (1–2), "write": một chữ Hán khó viết trong các từ này, "example"?: câu ví dụ chữ Hán, "examplePinyin"?, "exampleMeaning"?, "image"?: từ khoá tìm ảnh minh hoạ câu ví dụ}',
  defaults: () => ({
    heading: "生词",
    words: [
      { hanzi: "现在", pinyin: "xiànzài", pos: "danh từ", meaning: "bây giờ, hiện tại" },
    ],
    write: "现",
    strokes: [],
    strokesFor: "",
    example: "现在几点？",
    examplePinyin: "Xiànzài jǐ diǎn?",
    exampleMeaning: "Bây giờ là mấy giờ?",
  }),
  limits: {
    heading: { maxChars: 20 },
    "words.*.hanzi": { maxChars: 4 },
    "words.*.meaning": { maxChars: 30 },
    example: { maxChars: 20 },
  },
  render(c, ctx) {
    const cards = c.words
      .map(
        (w, i) =>
          `<div class="ls-ws-card">` +
          (w.pinyin ? pinyin(w.pinyin, "span", "ls-ws-pinyin") : "") +
          zh(w.hanzi, "span", "ls-ws-hanzi") +
          (w.pos ? vi(`(${w.pos})`, "span", "ls-ws-pos") : "") +
          (w.meaning ? vi(w.meaning, "span", "ls-ws-meaning") : "") +
          audioButton(ctx, w.audio, `${ctx.slideId}-audio-${i}`, `Nghe ${w.hanzi}`) +
          `</div>`,
      )
      .join("");
    const ready = c.strokes.length > 0 && c.strokesFor === c.write.trim();
    // Paths are y-up on a 1024 square with the baseline at 900, as the stroke data has them.
    const strokes = ready
      ? `<g transform="scale(1,-1) translate(0,-900)">` +
        `<g class="ls-ws-ghost">${c.strokes.map((d) => `<path d="${esc(d)}"/>`).join("")}</g>` +
        `<g class="ls-ws-strokes ls-hide" data-ls-reveal data-ls-sound="flip">${c.strokes
          .map((d, i) => `<path class="ls-ws-stroke" style="--i:${i}" d="${esc(d)}"/>`)
          .join("")}</g>` +
        `</g>`
      : "";
    const box = c.write.trim()
      ? `<div class="ls-ws-box">` +
        (ready
          ? `<svg viewBox="0 0 1024 1024" role="img" aria-label="${esc(c.write)}">${GRID}${strokes}</svg>`
          : `<svg viewBox="0 0 1024 1024" aria-hidden="true">${GRID}</svg>${zh(c.write, "span", "ls-ws-plain")}`) +
        `</div>`
      : "";
    const pic = image(ctx, c.image, "ls-ws-image");
    const example = c.example
      ? `<div class="ls-ws-example">` +
        `<div class="ls-ws-example-text">` +
        (c.examplePinyin ? pinyin(c.examplePinyin, "span", "ls-ws-example-pinyin") : "") +
        zh(c.example, "span", "ls-ws-example-hanzi") +
        (c.exampleMeaning ? vi(c.exampleMeaning, "span", "ls-ws-example-meaning") : "") +
        `</div>` +
        (pic ? `<div class="ls-ws-media">${pic}</div>` : "") +
        `</div>`
      : pic
        ? `<div class="ls-ws-example"><div class="ls-ws-media">${pic}</div></div>`
        : "";
    return (
      (c.heading ? zh(c.heading, "h2", "ls-heading ls-ws-heading") : "") +
      `<div class="ls-ws"><div class="ls-ws-top">${cards}${box}</div>${example}</div>`
    );
  },
  css,
  managedKeys: ["strokes", "strokesFor"],
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "zh", placeholder: "生词" },
    {
      kind: "list",
      key: "words",
      label: "Từ",
      itemLabel: "từ",
      min: 1,
      max: 2,
      newItem: () => ({ hanzi: "", pinyin: "", pos: "", meaning: "" }),
      fields: [
        { kind: "text", key: "hanzi", label: "Chữ Hán", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "text", key: "pos", label: "Từ loại", lang: "vi", placeholder: "danh từ" },
        { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
        { kind: "asset", key: "audio", label: "Âm thanh", assetKind: "audio", speakFrom: "hanzi", autoAudio: true },
      ],
    },
    { kind: "text", key: "write", label: "Chữ tập viết (một chữ; nét viết tự tải về khi có mạng)", lang: "zh", placeholder: "现" },
    { kind: "text", key: "example", label: "Câu ví dụ", lang: "zh" },
    { kind: "text", key: "examplePinyin", label: "Pinyin câu ví dụ", lang: "pinyin" },
    { kind: "text", key: "exampleMeaning", label: "Nghĩa câu ví dụ", lang: "vi" },
    { kind: "asset", key: "image", label: "Ảnh minh hoạ", assetKind: "image", searchFrom: ["exampleMeaning", "example"] },
  ],
};

export default wordStudy;

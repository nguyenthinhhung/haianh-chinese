import { z } from "zod";
import type { SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { vi } from "../../renderer/helpers";
import interaction from "./interaction.js?raw";
import css from "./style.css?raw";

const schema = z.object({
  heading: z.string().max(60).default(""),
  segments: z
    .array(z.object({ text: z.string().regex(/\S/, "Không được để trống").max(16) }))
    .min(2, "Cần ít nhất 2 ô")
    .max(12, "Tối đa 12 ô"),
});

export type LuckyWheelContent = z.output<typeof schema>;

const R = 96;
const point = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180;
  return `${(r * Math.sin(rad)).toFixed(2)} ${(-r * Math.cos(rad)).toFixed(2)}`;
};

/** One wedge of the wheel, clockwise from 12 o'clock, with its label. */
function wedge(text: string, i: number, n: number): string {
  const a = 360 / n;
  const from = i * a;
  const to = from + a;
  const mid = from + a / 2;
  const size = n <= 4 ? 13 : n <= 6 ? 11 : n <= 9 ? 9 : 7.5;
  const lang = /\p{Script=Han}/u.test(text) && !/\p{Script=Latin}/u.test(text) ? "zh-CN" : "vi";
  return (
    `<g class="ls-lw-seg ls-lw-c${(i % 6) + 1}" data-index="${i}">` +
    `<path d="M0 0 L${point(from, R)} A${R} ${R} 0 ${a > 180 ? 1 : 0} 1 ${point(to, R)} Z"/>` +
    `<text transform="rotate(${mid.toFixed(2)}) translate(0 ${-R * 0.6})" font-size="${size}" lang="${lang}">${esc(text)}</text>` +
    `</g>`
  );
}

export const luckyWheel: SlideTemplate<LuckyWheelContent> = {
  type: "lucky-wheel",
  label: "Vòng quay may mắn",
  category: "game",
  order: 240,
  schema,
  aiSchemaHint:
    'Vòng quay: mỗi lần bấm Tiếp quay một lần và dừng ở một ô chưa trúng (từ, câu hỏi hoặc tên đội/học sinh). {"heading"?: tiêu đề, "segments": [{"text"}] (2–12 ô, mỗi ô ngắn)}',
  defaults: () => ({
    heading: "Quay nào!",
    segments: ["苹果", "香蕉", "西瓜", "橙子", "葡萄", "草莓"].map((text) => ({ text })),
  }),
  limits: { heading: { maxChars: 40 }, "segments.*.text": { maxChars: 8 } },
  render(c) {
    const n = c.segments.length;
    const wedges = c.segments.map((s, i) => wedge(s.text, i, n)).join("");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-lw" data-count="${n}">` +
      `<svg class="ls-lw-wheel" viewBox="-100 -112 200 212" role="img" aria-label="Vòng quay">` +
      `<g class="ls-lw-rotor">${wedges}</g>` +
      `<circle class="ls-lw-hub" r="11"/>` +
      `<path class="ls-lw-pointer" d="M-9 -110 L9 -110 L0 -88 Z"/>` +
      `</svg>` +
      `<div class="ls-lw-result" aria-live="polite"></div>` +
      `</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "segments",
      label: "Các ô (mỗi lần Tiếp quay đến một ô chưa trúng)",
      itemLabel: "ô",
      min: 2,
      max: 12,
      newItem: () => ({ text: "" }),
      fields: [{ kind: "text", key: "text", label: "Chữ" }],
    },
  ],
  interaction: { source: interaction },
};

export default luckyWheel;

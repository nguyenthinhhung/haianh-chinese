import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { RenderContext, SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { audioButton, image, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const line = z.object({
  speaker: z.enum(["a", "b"]).default("a"),
  hanzi: z.string().regex(/\S/, "Không được để trống").max(60),
  pinyin: z.string().max(200).default(""),
  meaning: z.string().max(160).default(""),
  audio: AssetIdRef.optional(),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  /** Where it happens, as textbooks label each scene: 在饭馆. */
  scene: z.string().max(30).default(""),
  /** One recording of the whole dialogue, e.g. the textbook's track. */
  track: AssetIdRef.optional(),
  nameA: z.string().max(20).default(""),
  imageA: AssetIdRef.optional(),
  nameB: z.string().max(20).default(""),
  imageB: AssetIdRef.optional(),
  lines: z.array(line).min(1, "Cần ít nhất 1 câu").max(8, "Tối đa 8 câu"),
  stepByStep: z.boolean().default(true),
});

export type DialogueContent = z.output<typeof schema>;
type Line = DialogueContent["lines"][number];

const newLine = (): Line => ({ speaker: "a", hanzi: "你好！", pinyin: "nǐ hǎo!", meaning: "Xin chào!" });

/**
 * The character shown in place of a picture: the first one of the name, except
 * that 小/大/老 prefixes are skipped, so 小明 and 小红 show 明 and 红.
 */
export function initialOf(name: string): string | undefined {
  const chars = [...name.trim()];
  return chars.length > 1 && /^[小大老]$/.test(chars[0]!) ? chars[1] : chars[0];
}

function avatar(ctx: RenderContext, name: string, assetId: string | undefined, side: "a" | "b"): string {
  const img = image(ctx, assetId, "ls-dlg-avatar-img");
  const initial = initialOf(name) ?? side.toUpperCase();
  return `<div class="ls-dlg-avatar">${img || `<span class="ls-dlg-initial">${esc(initial)}</span>`}</div>`;
}

export const dialogue: SlideTemplate<DialogueContent> = {
  type: "dialogue",
  label: "Hội thoại",
  description: "Hội thoại hai nhân vật, hiện từng câu",
  category: "teach",
  order: 50,
  schema,
  aiSchemaHint:
    'Hội thoại 2 nhân vật, 1–8 câu (HSK 3–4: 6–8 lượt, câu dài hơn). {"heading"?: tiêu đề tiếng Việt, "scene"?: nơi diễn ra bằng chữ Hán như giáo trình ghi (ví dụ "在饭馆"), "nameA": tên nhân vật A, "nameB": tên nhân vật B, "lines": [{"speaker": "a" hoặc "b", "hanzi", "pinyin": có dấu thanh, "meaning": nghĩa tiếng Việt}], "stepByStep"?: true để hiện từng câu khi bấm Tiếp}',
  defaults: () => ({
    heading: "Hội thoại",
    scene: "",
    nameA: "小明",
    nameB: "小红",
    lines: [
      { speaker: "a", hanzi: "你好！", pinyin: "nǐ hǎo!", meaning: "Xin chào!" },
      { speaker: "b", hanzi: "你叫什么名字？", pinyin: "nǐ jiào shén me míng zi?", meaning: "Bạn tên là gì?" },
      { speaker: "a", hanzi: "我叫小明。", pinyin: "wǒ jiào xiǎo míng.", meaning: "Mình tên là Tiểu Minh." },
    ],
    stepByStep: true,
  }),
  limits: {
    heading: { maxChars: 40 },
    scene: { maxChars: 12 },
    nameA: { maxChars: 10 },
    nameB: { maxChars: 10 },
    "lines.*.hanzi": { maxChars: 30 },
    "lines.*.pinyin": { maxChars: 90 },
    "lines.*.meaning": { maxChars: 80 },
  },
  render(c, ctx) {
    const people = {
      a: { name: c.nameA, avatar: avatar(ctx, c.nameA, c.imageA, "a") },
      b: { name: c.nameB, avatar: avatar(ctx, c.nameB, c.imageB, "b") },
    };
    const lines = c.lines
      .map((l, i) => {
        const side = l.speaker === "b" ? "b" : "a";
        const who = people[side];
        return (
          `<li class="ls-dlg-line ls-dlg-line--${side}${c.stepByStep ? " ls-hide" : ""}"${c.stepByStep ? " data-ls-reveal" : ""}>` +
          who.avatar +
          `<div class="ls-dlg-bubble">` +
          (who.name ? zh(who.name, "span", "ls-dlg-name") : "") +
          zh(l.hanzi, "span", "ls-dlg-hanzi") +
          (l.pinyin ? pinyin(l.pinyin, "span", "ls-dlg-pinyin") : "") +
          (l.meaning ? vi(l.meaning, "span", "ls-dlg-meaning") : "") +
          `</div>` +
          audioButton(ctx, l.audio, `${ctx.slideId}-audio-${i}`, `Nghe câu ${i + 1}`) +
          `</li>`
        );
      })
      .join("");
    const track = audioButton(ctx, c.track, `${ctx.slideId}-track`, "Nghe cả bài hội thoại");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      (c.scene || track
        ? `<div class="ls-dlg-scene">${c.scene ? zh(c.scene, "span", "ls-dlg-place") : ""}${track}</div>`
        : "") +
      `<ol class="ls-dlg-lines" data-count="${c.lines.length}">${lines}</ol>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    { kind: "text", key: "scene", label: "Nơi diễn ra (như giáo trình ghi)", lang: "zh", placeholder: "在饭馆" },
    { kind: "asset", key: "track", label: "File nghe cả bài (ví dụ bài nghe của giáo trình)", assetKind: "audio" },
    { kind: "text", key: "nameA", label: "Tên nhân vật A", lang: "zh", placeholder: "小明" },
    { kind: "asset", key: "imageA", label: "Ảnh nhân vật A", assetKind: "image", searchFrom: ["nameA"] },
    { kind: "text", key: "nameB", label: "Tên nhân vật B", lang: "zh", placeholder: "小红" },
    { kind: "asset", key: "imageB", label: "Ảnh nhân vật B", assetKind: "image", searchFrom: ["nameB"] },
    {
      kind: "list",
      key: "lines",
      label: "Câu thoại",
      itemLabel: "câu",
      min: 1,
      max: 8,
      newItem: newLine,
      fields: [
        {
          kind: "select",
          key: "speaker",
          label: "Người nói",
          options: [
            { value: "a", label: "Nhân vật A (bên trái)" },
            { value: "b", label: "Nhân vật B (bên phải)" },
          ],
        },
        { kind: "text", key: "hanzi", label: "Câu (chữ Hán)", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
        { kind: "asset", key: "audio", label: "Âm thanh", assetKind: "audio", speakFrom: "hanzi", autoAudio: true },
      ],
    },
    { kind: "toggle", key: "stepByStep", label: "Hiện từng câu khi bấm Tiếp" },
  ],
};

export default dialogue;

import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { audioButton, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const word = z.object({
  hanzi: z.string().regex(/\S/, "Không được để trống").max(12),
  pinyin: z.string().max(40).default(""),
  meaning: z.string().max(40).default(""),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  /** The text: one paragraph per line, or one dialogue turn per line ("王静：…"). */
  text: z.string().regex(/\S/, "Không được để trống").max(400),
  pinyin: z.string().max(1600).default(""),
  meaning: z.string().max(900).default(""),
  /** The textbook's recording of this text. */
  track: AssetIdRef.optional(),
  /** New words of this text, shown beside it as in the textbook's 生词 box. */
  words: z.array(word).max(10, "Tối đa 10 từ").default([]),
});

export type PassageContent = z.output<typeof schema>;

const lines = (text: string) =>
  text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

/** "王静：你好" → speaker and words, so dialogue turns can show who speaks. */
function turn(line: string): { speaker: string; said: string } {
  const m = /^([^：:]{1,8})[：:]\s*(.+)$/.exec(line);
  return m ? { speaker: m[1]!, said: m[2]! } : { speaker: "", said: line };
}

export const passage: SlideTemplate<PassageContent> = {
  type: "passage",
  label: "Bài khoá / Đoạn văn",
  description: "Bài khoá dài (đoạn văn hoặc hội thoại) kèm 生词",
  category: "teach",
  order: 55,
  schema,
  aiSchemaHint:
    'Bài khoá dài như trong giáo trình HSK 3–4: một đoạn văn, hoặc hội thoại nhiều lượt. Bấm Tiếp hiện pinyin, bấm nữa hiện bản dịch, mỗi lần thay cho chữ Hán. {"heading"?: tên bài khoá như sách ghi (ví dụ "课文 4"), "text": chữ Hán, tối đa 400 ký tự; đoạn văn thì mỗi đoạn một dòng, hội thoại thì mỗi lượt một dòng dạng "王静：……", "pinyin"?: pinyin có dấu, xuống dòng giống "text", "meaning"?: bản dịch tiếng Việt, xuống dòng giống "text", "words"?: [{"hanzi", "pinyin", "meaning"}] từ mới của bài khoá này (tối đa 10)}',
  defaults: () => ({
    heading: "课文",
    text: "现在网上购物变得越来越流行了，年轻人尤其喜欢在网上买东西。在网上几乎什么都可以买到。",
    pinyin: "Xiànzài wǎngshang gòuwù biàn de yuè lái yuè liúxíng le, niánqīngrén yóuqí xǐhuan zài wǎngshang mǎi dōngxi. Zài wǎngshang jīhū shénme dōu kěyǐ mǎi dào.",
    meaning: "Bây giờ mua sắm trên mạng ngày càng phổ biến, người trẻ đặc biệt thích mua đồ trên mạng. Trên mạng hầu như cái gì cũng mua được.",
    words: [
      { hanzi: "购物", pinyin: "gòuwù", meaning: "mua sắm" },
      { hanzi: "尤其", pinyin: "yóuqí", meaning: "đặc biệt là" },
    ],
  }),
  limits: {
    heading: { maxChars: 30 },
    text: { maxChars: 260 },
  },
  render(c, ctx) {
    const play = audioButton(ctx, c.track, `${ctx.slideId}-track`, "Nghe bài khoá");
    const body = (text: string, kind: "hanzi" | "pinyin" | "meaning") =>
      lines(text)
        .map((l) => {
          const { speaker, said } = turn(l);
          const who = speaker ? `<span class="ls-ps-speaker">${kind === "meaning" ? vi(speaker) : kind === "pinyin" ? pinyin(speaker) : zh(speaker)}：</span>` : "";
          const words = kind === "hanzi" ? zh(said) : kind === "pinyin" ? pinyin(said) : vi(said);
          return `<p class="ls-ps-line${speaker ? " ls-ps-turn" : ""}">${who}${words}</p>`;
        })
        .join("");
    // The pinyin and the translation each take the place of what was shown before.
    let step = 0;
    const view = (text: string, kind: "hanzi" | "pinyin" | "meaning") => {
      if (kind === "hanzi") return `<div class="ls-ps-view ls-ps-view--hanzi">${body(text, kind)}</div>`;
      step += 1;
      return `<div class="ls-ps-view ls-ps-view--${kind} ls-hide" data-ls-reveal="${step}">${body(text, kind)}</div>`;
    };
    const views =
      view(c.text, "hanzi") + (c.pinyin.trim() ? view(c.pinyin, "pinyin") : "") + (c.meaning.trim() ? view(c.meaning, "meaning") : "");
    const words = c.words.length
      ? `<aside class="ls-ps-words"><h3 class="ls-ps-words-title" lang="zh-CN">生词</h3><ol>` +
        c.words
          .map(
            (w) =>
              `<li>${zh(w.hanzi, "span", "ls-ps-word")}${w.pinyin ? pinyin(w.pinyin, "span", "ls-ps-word-pinyin") : ""}${w.meaning ? vi(w.meaning, "span", "ls-ps-word-meaning") : ""}</li>`,
          )
          .join("") +
        `</ol></aside>`
      : "";
    const size = [...c.text].length > 180 ? "long" : [...c.text].length > 100 ? "medium" : "short";
    return (
      (c.heading || play ? `<div class="ls-ps-head">${c.heading ? zh(c.heading, "h2", "ls-heading") : ""}${play}</div>` : "") +
      `<div class="ls-ps${words ? " ls-ps--words" : ""}" data-size="${size}"><div class="ls-ps-text">${views}</div>${words}</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề (như sách ghi, ví dụ 课文 4)", lang: "zh" },
    { kind: "asset", key: "track", label: "File nghe của bài khoá", assetKind: "audio", speakFrom: "text" },
    { kind: "text", key: "text", label: "Bài khoá (mỗi đoạn hoặc mỗi lượt lời một dòng, ví dụ 王静：……)", lang: "zh", multiline: true },
    { kind: "text", key: "pinyin", label: "Pinyin (hiện khi bấm Tiếp)", lang: "pinyin", multiline: true },
    { kind: "text", key: "meaning", label: "Bản dịch (hiện khi bấm Tiếp lần nữa)", lang: "vi", multiline: true },
    {
      kind: "list",
      key: "words",
      label: "生词 của bài khoá",
      itemLabel: "từ",
      min: 0,
      max: 10,
      newItem: () => ({ hanzi: "", pinyin: "", meaning: "" }),
      fields: [
        { kind: "text", key: "hanzi", label: "Từ", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
      ],
    },
  ],
};

export default passage;

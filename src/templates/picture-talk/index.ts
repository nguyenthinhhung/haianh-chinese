import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { autoText, gapText, image, pinyin } from "../../renderer/helpers";
import css from "./style.css?raw";

const item = z.object({
  image: AssetIdRef.optional(),
  /** The sentence about the picture, with "____" where the class speaks. */
  text: z.string().regex(/\S/, "Không được để trống").max(80),
  pinyin: z.string().max(200).default(""),
  answer: z.string().max(60).default(""),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  items: z.array(item).min(1, "Cần ít nhất 1 tranh").max(4, "Tối đa 4 tranh"),
});

export type PictureTalkContent = z.output<typeof schema>;

export const pictureTalk: SlideTemplate<PictureTalkContent> = {
  type: "picture-talk",
  label: "Mô tả tranh",
  description: "1–4 tranh, mỗi tranh một câu có chỗ trống",
  category: "qa",
  order: 137,
  schema,
  aiSchemaHint:
    'Dùng từ và ngữ pháp vừa học để nói về tranh, như bài "用本课新学的语言点和词语描述图片" (HSK 2–3): mỗi tranh một câu hoặc một cặp hỏi–đáp có chỗ trống, bấm Tiếp hiện đáp án. {"heading"?: tiêu đề, "items": [{"image": từ khoá tìm ảnh, "text": câu chữ Hán có chỗ trống "____" (đối thoại thì "A：… B：…" trên một dòng), "pinyin"?: pinyin của câu, "answer": phần điền vào chỗ trống}] (1–4)}',
  defaults: () => ({
    heading: "看图说话",
    items: [
      { text: "她____在学校。", pinyin: "Tā ____ zài xuéxiào.", answer: "下午三点" },
      { text: "他们很忙，星期六也____。", pinyin: "Tāmen hěn máng, xīngqīliù yě ____.", answer: "工作" },
    ],
  }),
  limits: {
    heading: { maxChars: 30 },
    "items.*.text": { maxChars: 24 },
    "items.*.answer": { maxChars: 16 },
  },
  render(c, ctx) {
    const items = c.items
      .map((it, i) => {
        const img = image(ctx, it.image, "ls-pt-image");
        return (
          `<li class="ls-pt-item">` +
          `<div class="ls-pt-media">${img || `<span class="ls-pt-empty" lang="vi">Ảnh ${i + 1}</span>`}</div>` +
          `<div class="ls-pt-bubble">` +
          (it.pinyin ? pinyin(it.pinyin, "span", "ls-pt-pinyin") : "") +
          gapText(it.text, "span", "ls-pt-text") +
          (it.answer ? `<span class="ls-pt-answer ls-hide" data-ls-reveal="${i + 1}" data-ls-sound="correct">${autoText(it.answer)}</span>` : "") +
          `</div>` +
          `</li>`
        );
      })
      .join("");
    return (c.heading ? autoText(c.heading, "h2", "ls-heading") : "") + `<ol class="ls-pt" data-count="${c.items.length}">${items}</ol>`;
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "zh", placeholder: "看图说话" },
    {
      kind: "list",
      key: "items",
      label: "Tranh",
      itemLabel: "tranh",
      min: 1,
      max: 4,
      newItem: () => ({ text: "", pinyin: "", answer: "" }),
      fields: [
        { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["answer", "text"], autoImage: true },
        { kind: "text", key: "text", label: "Câu (chỗ trống viết ____)", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "text", key: "answer", label: "Đáp án", lang: "zh" },
      ],
    },
  ],
};

export default pictureTalk;

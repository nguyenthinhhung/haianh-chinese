import { z } from "zod";
import type { SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { autoText, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const point = z.object({
  text: z.string().regex(/\S/, "Không được để trống").max(160),
  example: z.string().max(80).default(""),
});

const check = z.object({
  /** A sentence with a gap ("____") that one or both words can fill. */
  sentence: z.string().regex(/\S/, "Không được để trống").max(80),
  fits: z.enum(["a", "b", "both"]).default("a"),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  wordA: z.string().regex(/\S/, "Không được để trống").max(10),
  wordB: z.string().regex(/\S/, "Không được để trống").max(10),
  same: z.string().max(200).default(""),
  sameExample: z.string().max(80).default(""),
  differences: z.array(point).max(3, "Tối đa 3 điểm khác").default([]),
  checks: z.array(check).max(5, "Tối đa 5 câu").default([]),
});

export type CompareContent = z.output<typeof schema>;

const gap = (text: string) =>
  `<span lang="zh-CN">${text
    .split(/_{2,}|＿{2,}/)
    .map(esc)
    .join(`<span class="ls-cmp-gap"></span>`)}</span>`;

const mark = (on: boolean) => `<span class="ls-cmp-mark ls-cmp-mark--${on ? "yes" : "no"}">${on ? "✓" : "✗"}</span>`;

export const compare: SlideTemplate<CompareContent> = {
  type: "compare",
  label: "So sánh (比一比)",
  description: "Phân biệt hai từ: giống, khác, rồi chọn từ cho từng câu",
  category: "teach",
  order: 65,
  schema,
  aiSchemaHint:
    'Phân biệt hai từ dễ nhầm, như "比一比" trong giáo trình HSK 4 (ví dụ 尤其—特别, 几—多少). Mỗi lần bấm Tiếp hiện một điểm khác, rồi đáp án từng câu trong bảng. {"heading"?: tiêu đề, "wordA", "wordB": hai từ, "same"?: điểm giống nhau (tiếng Việt), "sameExample"?: câu ví dụ dùng được cả hai, viết "尤其/特别", "differences": [{"text": điểm khác (tiếng Việt), "example"?: câu ví dụ chữ Hán}] (1–3), "checks": [{"sentence": câu chữ Hán có chỗ trống "____", "fits": "a" nếu chỉ wordA đúng, "b" nếu chỉ wordB đúng, "both" nếu cả hai}] (0–5)}',
  defaults: () => ({
    heading: "比一比",
    wordA: "尤其",
    wordB: "特别",
    same: "Đều làm phó từ, nghĩa là “nhất là”, chỉ phần nổi bật nhất trong tổng thể; thường đứng ở vế sau.",
    sameExample: "我对音乐很感兴趣，尤其/特别是贝多芬的音乐。",
    differences: [
      { text: "特别 còn có nghĩa “rất, vô cùng”; 尤其 không có nghĩa này.", example: "这个故事让人特别感动。" },
      { text: "特别 còn làm tính từ: “đặc biệt, khác thường”.", example: "你有什么特别要求吗？" },
    ],
    checks: [
      { sentence: "她从来没有见过这么大的雪，____高兴。", fits: "b" },
      { sentence: "现在对历史感兴趣的人越来越少了，____是年轻人。", fits: "both" },
    ],
  }),
  limits: {
    heading: { maxChars: 30 },
    same: { maxChars: 120 },
    "differences.*.text": { maxChars: 90 },
    "checks.*.sentence": { maxChars: 28 },
  },
  render(c) {
    let step = 0;
    const differences = c.differences
      .map(
        (d) =>
          `<li class="ls-cmp-diff ls-hide" data-ls-reveal="${++step}">${vi(d.text, "span", "ls-cmp-text")}` +
          (d.example ? zh(d.example, "span", "ls-cmp-example") : "") +
          `</li>`,
      )
      .join("");
    const rows = c.checks
      .map((k) => {
        const n = ++step;
        const cell = (on: boolean) =>
          `<td class="ls-cmp-cell"><span class="ls-hide" data-ls-reveal="${n}" data-ls-sound="correct">${mark(on)}</span></td>`;
        return `<tr><td class="ls-cmp-sentence">${gap(k.sentence)}</td>${cell(k.fits !== "b")}${cell(k.fits !== "a")}</tr>`;
      })
      .join("");
    const explain =
      `<div class="ls-cmp-explain">` +
      (c.same
        ? `<section class="ls-cmp-box ls-cmp-box--same"><h3 class="ls-cmp-label" lang="vi">Giống nhau</h3>${vi(c.same, "p", "ls-cmp-text")}` +
          (c.sameExample ? zh(c.sameExample, "p", "ls-cmp-example") : "") +
          `</section>`
        : "") +
      (differences
        ? `<section class="ls-cmp-box ls-cmp-box--diff"><h3 class="ls-cmp-label" lang="vi">Khác nhau</h3><ol class="ls-cmp-diffs">${differences}</ol></section>`
        : "") +
      `</div>`;
    const table = rows
      ? `<table class="ls-cmp-table"><thead><tr><th lang="vi">Chọn từ</th><th lang="zh-CN">${esc(c.wordA)}</th><th lang="zh-CN">${esc(c.wordB)}</th></tr></thead><tbody>${rows}</tbody></table>`
      : "";
    return (
      (c.heading ? autoText(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-cmp-words">${zh(c.wordA, "span", "ls-cmp-word ls-cmp-word--a")}<span class="ls-cmp-vs">—</span>${zh(c.wordB, "span", "ls-cmp-word ls-cmp-word--b")}</div>` +
      `<div class="ls-cmp${table ? " ls-cmp--table" : ""}">${explain}${table}</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    { kind: "text", key: "wordA", label: "Từ thứ nhất", lang: "zh", placeholder: "尤其" },
    { kind: "text", key: "wordB", label: "Từ thứ hai", lang: "zh", placeholder: "特别" },
    { kind: "text", key: "same", label: "Giống nhau", lang: "vi", multiline: true },
    { kind: "text", key: "sameExample", label: "Ví dụ dùng được cả hai (viết 尤其/特别)", lang: "zh" },
    {
      kind: "list",
      key: "differences",
      label: "Khác nhau (hiện từng ý khi bấm Tiếp)",
      itemLabel: "ý",
      min: 0,
      max: 3,
      newItem: () => ({ text: "", example: "" }),
      fields: [
        { kind: "text", key: "text", label: "Điểm khác", lang: "vi" },
        { kind: "text", key: "example", label: "Ví dụ", lang: "zh" },
      ],
    },
    {
      kind: "list",
      key: "checks",
      label: "做一做: câu chọn từ (chỗ trống viết ____)",
      itemLabel: "câu",
      min: 0,
      max: 5,
      newItem: () => ({ sentence: "", fits: "a" }),
      fields: [
        { kind: "text", key: "sentence", label: "Câu", lang: "zh" },
        {
          kind: "select",
          key: "fits",
          label: "Từ đúng",
          options: [
            { value: "a", label: "Chỉ từ thứ nhất" },
            { value: "b", label: "Chỉ từ thứ hai" },
            { value: "both", label: "Cả hai" },
          ],
        },
      ],
    },
  ],
};

export default compare;

import { z } from "zod";
import type { SlideTemplate } from "../../core/template";
import { autoText, gapText, vi } from "../../renderer/helpers";
import css from "./style.css?raw";

const row = z.object({
  /** The row's cells, separated by "|"; an empty cell is left for the class to fill in. */
  cells: z.string().max(300).default(""),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  /** Header cells, separated by "|". */
  columns: z.string().max(200).default(""),
  rows: z.array(row).min(1, "Cần ít nhất 1 hàng").max(8, "Tối đa 8 hàng"),
  /** Each Next shows the next row's cells after the first column. */
  revealRows: z.boolean().default(false),
  note: z.string().max(160).default(""),
});

export type TableContent = z.output<typeof schema>;

const cellsOf = (text: string) => text.split("|").map((c) => c.trim());

export const table: SlideTemplate<TableContent> = {
  type: "table",
  label: "Bảng",
  description: "Bảng ngữ pháp, bảng khảo sát 运用, bảng số / giờ",
  category: "teach",
  order: 62,
  schema,
  aiSchemaHint:
    'Một bảng: bảng ngữ pháp kiểu sách (cột Chủ ngữ | Trạng ngữ | Vị ngữ, mỗi hàng một câu ví dụ), bảng khảo sát / lịch cho hoạt động 运用 (ô để trống để cả lớp điền), hoặc bảng tra cứu (số đếm, giờ, tiền). {"heading"?: tiêu đề, "columns": các ô tiêu đề ngăn bằng "|", "rows": [{"cells": các ô ngăn bằng "|", ô trống để học sinh điền}] (1–8), "revealRows"?: true để bấm Tiếp hiện từng hàng (trừ cột đầu), "note"?: một dòng ghi chú tiếng Việt}',
  defaults: () => ({
    heading: "时间词做状语",
    columns: "Chủ ngữ | Trạng ngữ thời gian | Vị ngữ",
    rows: [{ cells: "妈妈 | 六点 | 做饭。" }, { cells: "李老师 | 上午八点 | 去学校。" }, { cells: "我 | 星期一 | 去北京。" }],
    revealRows: false,
    note: "",
  }),
  limits: {
    heading: { maxChars: 40 },
    "rows.*.cells": { maxChars: 80 },
  },
  render(c) {
    const head = cellsOf(c.columns).filter((h, i, all) => h || i < all.length - 1);
    const rows = c.rows.map((r) => cellsOf(r.cells));
    const width = Math.max(head.length, ...rows.map((r) => r.length));
    const body = rows
      .map(
        (cells, i) =>
          `<tr>` +
          Array.from({ length: width }, (_, k) => {
            const text = cells[k] ?? "";
            const hidden = c.revealRows && k > 0 && text;
            const inner = text ? gapText(text) : "";
            return `<td>${hidden ? `<span class="ls-hide" data-ls-reveal="${i + 1}">${inner}</span>` : inner}</td>`;
          }).join("") +
          `</tr>`,
      )
      .join("");
    return (
      (c.heading ? autoText(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-tbl-wrap"><table class="ls-tbl" data-rows="${c.rows.length}">` +
      (head.length ? `<thead><tr>${Array.from({ length: width }, (_, k) => `<th>${head[k] ? autoText(head[k]!) : ""}</th>`).join("")}</tr></thead>` : "") +
      `<tbody>${body}</tbody></table></div>` +
      (c.note ? vi(c.note, "p", "ls-tbl-note") : "")
    );
  },
  css,
  blankHeading: "",
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    { kind: "text", key: "columns", label: "Tiêu đề cột (ngăn bằng |)", lang: "vi", placeholder: "Chủ ngữ | Trạng ngữ | Vị ngữ" },
    {
      kind: "list",
      key: "rows",
      label: "Hàng",
      itemLabel: "hàng",
      min: 1,
      max: 8,
      newItem: () => ({ cells: "" }),
      fields: [{ kind: "text", key: "cells", label: "Các ô (ngăn bằng |; để trống ô cho lớp điền)", lang: "zh" }],
    },
    { kind: "toggle", key: "revealRows", label: "Bấm Tiếp hiện từng hàng (trừ cột đầu)" },
    { kind: "text", key: "note", label: "Ghi chú dưới bảng", lang: "vi" },
  ],
};

export default table;

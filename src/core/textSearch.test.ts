import { describe, expect, it } from "vitest";
import { matchesQuery, stripMarks } from "./textSearch";

describe("stripMarks", () => {
  it("drops Vietnamese marks and keeps everything else", () => {
    expect(stripMarks("Hoa quả đỏ – Lớp 2")).toBe("Hoa qua do – Lop 2");
    expect(stripMarks("Đồ vật 水果")).toBe("Do vat 水果");
  });
});

describe("matchesQuery", () => {
  it("matches every word, ignoring case and marks, in any order", () => {
    expect(matchesQuery("Hoa quả – lớp 2", "hoa qua")).toBe(true);
    expect(matchesQuery("Hoa quả – lớp 2", "LỚP 2 hoa")).toBe(true);
    expect(matchesQuery("Hoa quả – lớp 2", "hoa lop 3")).toBe(false);
    expect(matchesQuery("动物 Con vật", "动物")).toBe(true);
  });

  it("matches everything for an empty query", () => {
    expect(matchesQuery("Hoa quả", "  ")).toBe(true);
  });
});

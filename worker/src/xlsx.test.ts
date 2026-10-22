import { describe, expect, it } from "vitest";
import { columnName, crc32, xlsx } from "./xlsx";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("xlsx", () => {
  it("names columns like Excel", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });

  it("checksums like zip", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("packs a sheet with text kept as text and numbers as numbers", () => {
    const book = xlsx("Bảng điểm: lớp A", [
      ["Học viên", "Điểm"],
      ["=Lan <Anh>", 6],
      ["", 0],
    ]);
    // A zip: local header first, end record last.
    expect([...book.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect([...book.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
    const all = text(book);
    expect(all).toContain('<sheet name="Bảng điểm  lớp A"');
    expect(all).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">=Lan &lt;Anh&gt;</t></is></c><c r="B2"><v>6</v></c>');
    expect(all).toContain('<c r="A1" s="1" t="inlineStr">');
    expect(all).toContain('<c r="A3"/>');
  });
});

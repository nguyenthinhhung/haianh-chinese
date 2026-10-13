import { describe, expect, it } from "vitest";
import { folderNameFromTitle, uniqueFolderName } from "./fsNames";

describe("folderNameFromTitle", () => {
  it("strips Vietnamese diacritics into an ASCII slug", () => {
    expect(folderNameFromTitle("Hoa quả")).toBe("Hoa-qua");
    expect(folderNameFromTitle("Hoa quả".normalize("NFD"))).toBe("Hoa-qua");
    expect(folderNameFromTitle("Đồ dùng học tập")).toBe("Do-dung-hoc-tap");
  });

  it("turns any other characters into single hyphens", () => {
    expect(folderNameFromTitle('Bài 1: <Màu> "sắc" / a\\b | c? *')).toBe("Bai-1-Mau-sac-a-b-c");
    expect(folderNameFromTitle("..hidden.  ")).toBe("hidden");
  });

  it("falls back when nothing ASCII is left", () => {
    expect(folderNameFromTitle("水果")).toBe("Bai-hoc");
    expect(folderNameFromTitle(" ?*: ")).toBe("Bai-hoc");
  });

  it("avoids Windows reserved device names", () => {
    expect(folderNameFromTitle("CON")).toBe("CON-Bai-hoc");
    expect(folderNameFromTitle("Console")).toBe("Console");
  });

  it("limits length", () => {
    expect(folderNameFromTitle("a".repeat(200))).toHaveLength(80);
  });
});

describe("uniqueFolderName", () => {
  it("appends a counter, comparing case-insensitively", () => {
    expect(uniqueFolderName("Hoa-qua", [])).toBe("Hoa-qua");
    expect(uniqueFolderName("Hoa-qua", ["HOA-QUA", "Hoa-qua-2"])).toBe("Hoa-qua-3");
  });
});

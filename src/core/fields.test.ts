import { describe, expect, it } from "vitest";
import { checkLimits, collectAssetRefs, describeContentPath } from "./fields";
import type { EditorFieldSpec } from "./template";

const spec: EditorFieldSpec = [
  { kind: "asset", key: "image", label: "Ảnh", assetKind: "image" },
  {
    kind: "list",
    key: "words",
    label: "Từ",
    itemLabel: "từ",
    min: 1,
    max: 8,
    newItem: () => ({}),
    fields: [
      { kind: "text", key: "hanzi", label: "Chữ Hán" },
      { kind: "asset", key: "audio", label: "Âm thanh", assetKind: "audio" },
    ],
  },
];

describe("fields", () => {
  it("collects asset references through lists", () => {
    const content = { image: "a_1111", words: [{ audio: "a_2222" }, {}, { audio: "a_3333" }] };
    expect(collectAssetRefs(content, spec)).toEqual([
      { assetId: "a_1111", assetKind: "image", path: ["image"] },
      { assetId: "a_2222", assetKind: "audio", path: ["words", 0, "audio"] },
      { assetId: "a_3333", assetKind: "audio", path: ["words", 2, "audio"] },
    ]);
  });

  it("describes paths with editor labels", () => {
    expect(describeContentPath(["words", 3, "hanzi"], spec)).toEqual(["từ 4", "Chữ Hán"]);
    expect(describeContentPath(["words"], spec)).toEqual(["Từ"]);
    expect(describeContentPath(["unknown", 1], spec)).toEqual(["unknown", "1"]);
  });

  it("warns about content over the soft limits, counting code points", () => {
    const content = { words: [{ hanzi: "苹果" }, { hanzi: "火龙果汁" }, { hanzi: "𠀋𠀋𠀋" }] };
    const warnings = checkLimits(content, { words: { maxItems: 2 }, "words.*.hanzi": { maxChars: 3 } });
    expect(warnings.map((w) => w.path)).toEqual([["words"], ["words", 1, "hanzi"]]);
  });
});

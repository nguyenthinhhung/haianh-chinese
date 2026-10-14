import { misreadCharacters } from "./pinyin";
import type { Slide } from "./schema";
import type { TemplateRegistry } from "./templateRegistry";

/**
 * Catches pinyin that cannot match its characters: one syllable per Chinese
 * character, written apart, and each syllable one of the readings its
 * character has. A reading that exists but does not fit the word (还 read
 * hái in 还书) is not caught.
 */

/** Pinyin field → the field holding the characters it spells, in order of preference. */
const PAIRS: [string, string[]][] = [
  ["pinyin", ["hanzi", "title", "text", "words"]],
  ["leftPinyin", ["left"]],
];

const HAN = /\p{Script=Han}/gu;
// Only text made of characters, spaces, punctuation and the "/" and "[ ]" markers
// some templates use is checked; anything with Latin letters or digits is skipped.
const CHECKABLE = /^[\p{Script=Han}\p{P}\s/[\]]*$/u;

function syllables(pinyin: string): string[] {
  return pinyin
    .split(/[\s/]+/)
    .map((s) => s.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
}

function mismatch(hanzi: string, pinyin: string): string | null {
  if (!pinyin.trim() || !CHECKABLE.test(hanzi)) return null;
  const chars = hanzi.match(HAN) ?? [];
  const sounds = syllables(pinyin);
  if (!chars.length) return null;
  if (sounds.length === chars.length) {
    const wrong = misreadCharacters(hanzi, pinyin);
    if (!wrong.length) return null;
    const detail = wrong.map((w) => `${w.char} ghi "${w.wrote}"${w.expected ? `, thường đọc là ${w.expected}` : ""}`).join("; ");
    return `pinyin của "${hanzi}" có âm không khớp chữ: ${detail}`;
  }
  // 儿 after another character is usually read together with it (哪儿 nǎr).
  const erhua = chars.filter((c, i) => c === "儿" && i > 0).length;
  if (erhua && sounds.length === chars.length - erhua) return null;
  return `"${hanzi}" có ${chars.length} chữ nhưng pinyin "${pinyin}" có ${sounds.length} âm tiết (các âm tiết cần cách nhau bằng dấu cách)`;
}

function walk(value: unknown, found: string[]): void {
  if (Array.isArray(value)) {
    for (const v of value) walk(v, found);
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  for (const [pinyinKey, hanziKeys] of PAIRS) {
    const pinyin = obj[pinyinKey];
    const hanziKey = hanziKeys.find((k) => typeof obj[k] === "string" && obj[k]);
    if (typeof pinyin === "string" && hanziKey) {
      const problem = mismatch(obj[hanziKey] as string, pinyin);
      if (problem) found.push(problem);
    }
  }
  for (const v of Object.values(obj)) if (v && typeof v === "object") walk(v, found);
}

export function pinyinWarnings(slides: Slide[], registry: TemplateRegistry): string[] {
  return slides.flatMap((s, i) => {
    const found: string[] = [];
    walk(s.content, found);
    const label = registry.get(s.type)?.label ?? s.type;
    return found.map((f) => `Slide ${i + 1} (${label}): ${f}.`);
  });
}

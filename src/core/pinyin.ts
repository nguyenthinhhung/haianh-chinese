import { customPinyin, pinyin } from "pinyin-pro";
import type { EditorFieldSpec } from "./template";

/**
 * Pinyin from Chinese characters, offline. Used to fill pinyin fields and to
 * check pinyin written by AI tools; the teacher can always edit the result.
 */

// Readings children's textbooks write differently from the library: neutral
// tones in common words, and the 儿 suffix merged into the syllable before it.
customPinyin({
  朋友: "péng you",
  东西: "dōng xi",
  学生: "xué sheng",
  谢谢: "xiè xie",
  名字: "míng zi",
  先生: "xiān sheng",
  知道: "zhī dao",
  时候: "shí hou",
  舒服: "shū fu",
  告诉: "gào su",
  爷爷: "yé ye",
  奶奶: "nǎi nai",
  姐姐: "jiě jie",
  弟弟: "dì di",
  妹妹: "mèi mei",
  月亮: "yuè liang",
  星星: "xīng xing",
  眉毛: "méi mao",
  葡萄: "pú tao",
  窗户: "chuāng hu",
  骆驼: "luò tuo",
  明白: "míng bai",
  清楚: "qīng chu",
  客气: "kè qi",
  关系: "guān xi",
  意思: "yì si",
  早上: "zǎo shang",
  晚上: "wǎn shang",
  地方: "dì fang",
  哪儿: "nǎr",
  这儿: "zhèr",
  那儿: "nàr",
  一点儿: "yì diǎnr",
  一会儿: "yí huìr",
  玩儿: "wánr",
});

const HAN = /\p{Script=Han}/u;

// 子 after another character is a neutral-tone suffix (桌子, 饺子) except in these words.
const FULL_TONE_ZI = new Set(["孔子", "女子", "男子", "电子", "原子", "分子", "君子", "王子", "太子", "天子", "才子", "莲子", "瓜子", "鱼子"]);

/** Pinyin of a run of characters, converted together so words pick the right reading (长城, 长大). */
function runToPinyin(run: string): string {
  const chars = pinyin(run, { type: "all" }) as { origin: string; pinyin: string }[];
  return chars
    .map((c, i) => (c.origin === "子" && i > 0 && !FULL_TONE_ZI.has(chars[i - 1]!.origin + "子") ? "zi" : c.pinyin))
    .filter(Boolean) // 儿 merged into the syllable before it comes back empty
    .join(" ");
}

const PUNCTUATION: Record<string, string> = {
  "，": ",",
  "。": ".",
  "！": "!",
  "？": "?",
  "：": ":",
  "；": ";",
  "、": ",",
  "“": '"',
  "”": '"',
  "（": "(",
  "）": ")",
  "…": "...",
};

/**
 * Pinyin for text as teachers write it: syllables apart, tone marks, and the
 * markers some templates use kept in place, so "我[是]学生。" gives
 * "wǒ [shì] xué sheng." and "我 / 是 / 学生" gives "wǒ / shì / xué sheng".
 */
export function hanziToPinyin(text: string): string {
  if (!HAN.test(text)) return "";
  let out = "";
  const space = () => {
    if (out && !/[\s[(/"]$/.test(out)) out += " ";
  };
  for (const part of text.match(/\p{Script=Han}+|_+|[^\p{Script=Han}]/gu) ?? []) {
    if (HAN.test(part)) {
      space();
      out += runToPinyin(part);
    } else if (part.startsWith("_")) {
      // A gap to fill in stands apart from the words around it.
      space();
      out += `${part} `;
    } else if (/\s/.test(part)) {
      if (out && !out.endsWith(" ")) out += " ";
    } else {
      const ch = PUNCTUATION[part] ?? part;
      if (ch === "[" || ch === "(" || ch === "/") space();
      out += ch;
      if (ch === "/") out += " ";
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Readings a character may take, with and without its tone mark (neutral tone). */
function readings(char: string): Set<string> {
  const all = pinyin(char, { multiple: true, type: "array" }) as string[];
  const out = new Set<string>();
  for (const r of all) {
    out.add(r);
    out.add(stripTone(r));
  }
  // Tone changes textbooks mark: 一 before other tones, 不 before a fourth tone.
  if (char === "一") ["yí", "yì"].forEach((r) => out.add(r));
  if (char === "不") out.add("bú");
  return out;
}

export function stripTone(syllable: string): string {
  return syllable
    .normalize("NFD")
    .replace(/[\u0300-\u0304\u030C]/g, "")
    .normalize("NFC");
}

/** "lv" and "lu:" for "lǜ"-style input; everything lower case and NFC. */
function normalizeSyllable(s: string): string {
  return s.toLowerCase().normalize("NFC").replace(/u:/g, "ü").replace(/v/g, "ü");
}

/**
 * Characters whose pinyin cannot be right: the syllable is none of the
 * readings the character has. Only checked when there is one syllable per
 * character; the count itself is checked elsewhere.
 */
export function misreadCharacters(hanzi: string, written: string): { char: string; wrote: string; expected: string }[] {
  const chars = hanzi.match(/\p{Script=Han}/gu) ?? [];
  const syllables = written
    .split(/[\s/]+/)
    .map((s) => normalizeSyllable(s.replace(/[^\p{L}:]/gu, "")))
    .filter(Boolean);
  if (!chars.length || chars.length !== syllables.length) return [];
  const suggested = (hanziToPinyin(chars.join("")).match(/\S+/g) ?? []).map(normalizeSyllable);
  const out: { char: string; wrote: string; expected: string }[] = [];
  chars.forEach((char, i) => {
    const wrote = syllables[i]!;
    if (!readings(char).has(wrote)) out.push({ char, wrote, expected: suggested[i] ?? "" });
  });
  return out;
}

/**
 * Whether written pinyin can be right for the characters: one syllable per
 * character (儿 may merge into the one before) and each a reading of its
 * character. Differences that are not errors, such as a neutral tone written
 * with or without its mark, still fit.
 */
export function pinyinFits(hanzi: string, written: string): boolean {
  const chars = hanzi.match(/\p{Script=Han}/gu) ?? [];
  if (!chars.length) return true;
  const count = written.split(/[\s/]+/).filter((s) => /\p{L}/u.test(s)).length;
  if (count === chars.length) return misreadCharacters(hanzi, written).length === 0;
  const erhua = chars.filter((c, i) => c === "儿" && i > 0).length;
  return erhua > 0 && count === chars.length - erhua;
}

/**
 * Pinyin fields paired with the Chinese field they spell: by convention a
 * template puts a pinyin field ("lang": "pinyin") right after its Chinese one.
 */
export function pinyinPairs(fields: EditorFieldSpec): { hanzi: string; pinyin: string }[] {
  const out: { hanzi: string; pinyin: string }[] = [];
  fields.forEach((f, i) => {
    const prev = fields[i - 1];
    if (f.kind === "text" && f.lang === "pinyin" && prev?.kind === "text" && prev.lang === "zh") out.push({ hanzi: prev.key, pinyin: f.key });
  });
  return out;
}

/**
 * Fills pinyin fields left empty next to Chinese text, through lists too.
 * Returns the same object when nothing was missing.
 */
export function fillMissingPinyin(content: unknown, fields: EditorFieldSpec): unknown {
  if (!content || typeof content !== "object" || Array.isArray(content)) return content;
  const obj = content as Record<string, unknown>;
  let out: Record<string, unknown> | null = null;
  const set = (key: string, value: unknown) => {
    out ??= { ...obj };
    out[key] = value;
  };
  for (const { hanzi, pinyin: key } of pinyinPairs(fields)) {
    const h = obj[hanzi];
    if (typeof h === "string" && HAN.test(h) && !(typeof obj[key] === "string" && (obj[key] as string).trim())) set(key, hanziToPinyin(h));
  }
  for (const f of fields) {
    if (f.kind !== "list" || !Array.isArray(obj[f.key])) continue;
    const items = obj[f.key] as unknown[];
    const filled = items.map((item) => fillMissingPinyin(item, f.fields));
    if (filled.some((item, i) => item !== items[i])) set(f.key, filled);
  }
  return out ?? content;
}

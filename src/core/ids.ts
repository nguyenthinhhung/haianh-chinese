const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Lesson, slide, asset; exercise, part, question, option. */
export type IdPrefix = "l" | "s" | "a" | "e" | "p" | "q" | "o";

/** Random, URL- and filename-safe ID such as `s_k3f9a0x2mq`. */
export function newId(prefix: IdPrefix, length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}

export const ID_PATTERNS = {
  lesson: /^l_[a-z0-9]{4,32}$/,
  slide: /^s_[a-z0-9]{4,32}$/,
  asset: /^a_[a-z0-9]{4,32}$/,
  exercise: /^e_[a-z0-9]{4,32}$/,
  part: /^p_[a-z0-9]{4,32}$/,
  question: /^q_[a-z0-9]{4,32}$/,
  option: /^o_[a-z0-9]{4,32}$/,
} as const;

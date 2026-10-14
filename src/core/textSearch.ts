/** Vietnamese text without tone and vowel marks: "Hoa quả đỏ" → "Hoa qua do". */
export function stripMarks(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFC");
}

/**
 * Whether every word of `query` appears in `text`, ignoring case and marks,
 * so a teacher typing "hoa qua" finds "Hoa quả – lớp 2". An empty query matches.
 */
export function matchesQuery(text: string, query: string): boolean {
  const fold = (s: string) => stripMarks(s).toLowerCase();
  const haystack = fold(text);
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

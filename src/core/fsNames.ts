const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const MAX_LENGTH = 80;
const FALLBACK = "Bai-hoc";

/**
 * ASCII folder name for a new lesson: "Hoa quả" → "Hoa-qua". Plain ASCII sidesteps
 * the NFC/NFD mismatch macOS introduces for accented names and is valid on
 * every file system and sync service.
 */
export function folderNameFromTitle(title: string): string {
  const name = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .slice(0, MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
  if (!name) return FALLBACK;
  return WINDOWS_RESERVED.test(name) ? `${name}-${FALLBACK}` : name;
}

/** Both file systems compare names case-insensitively by default. */
export function folderKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/** `name`, or `name-2`, `name-3`… — the first that is not taken. */
export function uniqueFolderName(name: string, existing: Iterable<string>): string {
  const taken = new Set([...existing].map(folderKey));
  if (!taken.has(folderKey(name))) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name}-${n}`;
    if (!taken.has(folderKey(candidate))) return candidate;
  }
}

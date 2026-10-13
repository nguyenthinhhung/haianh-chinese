import { isSafeAssetPath } from "../core/schema";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text for element content and quoted attribute values alike. */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/**
 * JSON for a `<script type="application/json">` block. Escaping `<` keeps
 * `</script>` and `<!--` in user text from ending or confusing the block.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** Only these URL shapes ever reach `src` attributes. */
export function isSafeUrl(url: string): boolean {
  return (
    isSafeAssetPath(url) ||
    /^data:(image|audio)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(url) ||
    /^(blob:|https?:\/\/asset\.localhost\/|asset:\/\/)[^\s"'<>]+$/.test(url)
  );
}

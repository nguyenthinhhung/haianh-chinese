import type { AgeBand } from "./ages";

export interface Theme {
  id: string;
  /** Name shown to the teacher. */
  label: string;
  /** Ages the look suits; the theme picker shows them as a hint, never a restriction. */
  ages: AgeBand[];
  /**
   * CSS scoped under `.ls-deck[data-theme="<id>"]`: the `--ls-*` variables plus
   * decorations. Decorative images are inline SVG data URIs so a lesson never
   * depends on files outside itself.
   */
  css: string;
}

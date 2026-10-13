export interface Theme {
  id: string;
  /** Name shown to the teacher. */
  label: string;
  /**
   * CSS scoped under `.ls-deck[data-theme="<id>"]`: the `--ls-*` variables plus
   * decorations. Decorative images are inline SVG data URIs so a lesson never
   * depends on files outside itself.
   */
  css: string;
}

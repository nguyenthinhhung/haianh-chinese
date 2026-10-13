/** Inline SVG as a CSS `url()`, so theme decorations travel inside the lesson file. */
export function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}")`;
}

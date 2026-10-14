import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a flower spray and a tuft of grass.
const flowers = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <g transform="translate(70 70)">
    <g fill="#f7a8b8">
      <circle cx="0" cy="-26" r="20"/><circle cx="25" cy="-8" r="20"/><circle cx="15" cy="22" r="20"/>
      <circle cx="-15" cy="22" r="20"/><circle cx="-25" cy="-8" r="20"/>
    </g>
    <circle r="14" fill="#f6c453"/>
  </g>
  <g transform="translate(160 150) scale(0.7)">
    <g fill="#c9b6f2">
      <circle cx="0" cy="-26" r="20"/><circle cx="25" cy="-8" r="20"/><circle cx="15" cy="22" r="20"/>
      <circle cx="-15" cy="22" r="20"/><circle cx="-25" cy="-8" r="20"/>
    </g>
    <circle r="14" fill="#f6c453"/>
  </g>
  <path d="M112 110 Q150 104 170 70" fill="none" stroke="#7fb77e" stroke-width="7" stroke-linecap="round"/>
  <ellipse cx="160" cy="84" rx="16" ry="8" transform="rotate(-40 160 84)" fill="#9ccc8a"/>
</svg>`);

const grass = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120">
  <g fill="none" stroke-linecap="round" stroke-width="9">
    <path d="M30 118 Q36 70 20 30" stroke="#7fb77e"/>
    <path d="M60 118 Q62 60 84 20" stroke="#9ccc8a"/>
    <path d="M96 118 Q92 80 70 56" stroke="#7fb77e"/>
    <path d="M150 118 Q160 64 140 18" stroke="#9ccc8a"/>
    <path d="M190 118 Q188 74 214 40" stroke="#7fb77e"/>
    <path d="M236 118 Q244 84 230 60" stroke="#9ccc8a"/>
    <path d="M270 118 Q266 70 286 34" stroke="#7fb77e"/>
  </g>
  <circle cx="140" cy="18" r="11" fill="#f7a8b8"/>
  <circle cx="214" cy="40" r="9" fill="#f6c453"/>
</svg>`);

export const garden: Theme = {
  id: "garden",
  label: "Vườn hoa",
  css: css.replace("var(--decor-flowers)", flowers).replace("var(--decor-grass)", grass),
};

export default garden;

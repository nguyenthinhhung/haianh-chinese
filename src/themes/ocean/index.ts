import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a little fish with bubbles, and waves.
const fish = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200">
  <g transform="translate(60 110)">
    <path d="M0 0 Q50 -50 100 0 Q50 50 0 0 Z" fill="#f08a4b"/>
    <path d="M96 0 L134 -28 L128 0 L134 28 Z" fill="#f4a36f"/>
    <path d="M38 -22 Q46 0 38 22" fill="none" stroke="#fbd0b0" stroke-width="5" stroke-linecap="round"/>
    <circle cx="20" cy="-6" r="7" fill="#fff"/><circle cx="18" cy="-6" r="3.5" fill="#1b3a4b"/>
  </g>
  <g fill="none" stroke="#7cc4e4" stroke-width="5">
    <circle cx="40" cy="60" r="10"/><circle cx="62" cy="30" r="14"/><circle cx="26" cy="22" r="7"/>
  </g>
</svg>`);

const waves = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 90">
  <path d="M0 40 Q37 10 75 40 T150 40 T225 40 T300 40 V90 H0 Z" fill="#9ed6ee"/>
  <path d="M0 62 Q37 34 75 62 T150 62 T225 62 T300 62 V90 H0 Z" fill="#5fb3dc"/>
</svg>`);

export const ocean: Theme = {
  id: "ocean",
  label: "Đại dương",
  ages: ["lower-primary", "upper-primary"],
  css: css.replace("var(--decor-fish)", fish).replace("var(--decor-waves)", waves),
};

export default ocean;

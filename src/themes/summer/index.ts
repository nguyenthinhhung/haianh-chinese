import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a smiling sun and a slice of watermelon.
const sun = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g stroke="#f7a325" stroke-width="10" stroke-linecap="round">
    <path d="M100 8 V34"/><path d="M100 166 V192"/><path d="M8 100 H34"/><path d="M166 100 H192"/>
    <path d="M35 35 L53 53"/><path d="M147 147 L165 165"/><path d="M165 35 L147 53"/><path d="M53 147 L35 165"/>
  </g>
  <circle cx="100" cy="100" r="52" fill="#ffc93c"/>
  <circle cx="82" cy="92" r="6" fill="#5a3b12"/><circle cx="118" cy="92" r="6" fill="#5a3b12"/>
  <path d="M80 114 Q100 132 120 114" fill="none" stroke="#5a3b12" stroke-width="6" stroke-linecap="round"/>
  <circle cx="70" cy="110" r="7" fill="#ff9f6e"/><circle cx="130" cy="110" r="7" fill="#ff9f6e"/>
</svg>`);

const melon = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 130">
  <path d="M10 10 A110 110 0 0 0 230 10 Z" fill="#3fa34d"/>
  <path d="M24 10 A96 96 0 0 0 216 10 Z" fill="#c8eec0"/>
  <path d="M32 10 A88 88 0 0 0 208 10 Z" fill="#ff5a6e"/>
  <g fill="#2b2b2b">
    <ellipse cx="80" cy="40" rx="5" ry="8"/><ellipse cx="120" cy="58" rx="5" ry="8"/>
    <ellipse cx="160" cy="40" rx="5" ry="8"/><ellipse cx="100" cy="28" rx="4" ry="7"/><ellipse cx="140" cy="28" rx="4" ry="7"/>
  </g>
</svg>`);

export const summer: Theme = {
  id: "summer",
  label: "Mùa hè",
  ages: ["preschool", "lower-primary", "upper-primary"],
  css: css.replace("var(--decor-sun)", sun).replace("var(--decor-melon)", melon),
};

export default summer;

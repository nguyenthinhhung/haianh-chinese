import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: snowflakes and a snowman with a red scarf.
const flake = (x: number, y: number, s: number) => `
  <g transform="translate(${x} ${y}) scale(${s})" stroke="#8cc3e8" stroke-width="5" stroke-linecap="round">
    <path d="M0 -24 V24"/><path d="M-21 -12 L21 12"/><path d="M-21 12 L21 -12"/>
    <path d="M-6 -18 L0 -12 L6 -18"/><path d="M-6 18 L0 12 L6 18"/>
  </g>`;

const flakes = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 160">
  ${flake(40, 40, 1)}
  ${flake(120, 30, 0.7)}
  ${flake(90, 110, 0.85)}
  ${flake(180, 90, 0.6)}
</svg>`);

const snowman = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 220">
  <ellipse cx="80" cy="214" rx="74" ry="8" fill="#dbeaf6"/>
  <circle cx="80" cy="160" r="52" fill="#ffffff" stroke="#c9dcec" stroke-width="4"/>
  <circle cx="80" cy="76" r="38" fill="#ffffff" stroke="#c9dcec" stroke-width="4"/>
  <rect x="50" y="28" width="60" height="14" rx="6" fill="#2b4c7e"/>
  <rect x="60" y="2" width="40" height="32" rx="6" fill="#2b4c7e"/>
  <circle cx="68" cy="70" r="5" fill="#1c2b3a"/><circle cx="92" cy="70" r="5" fill="#1c2b3a"/>
  <path d="M80 80 L104 88 L80 90 Z" fill="#f08a24"/>
  <path d="M44 108 Q80 124 116 108 L116 120 Q80 136 44 120 Z" fill="#c0392b"/>
  <rect x="98" y="116" width="14" height="34" rx="4" fill="#c0392b"/>
  <g fill="#1c2b3a"><circle cx="80" cy="146" r="5"/><circle cx="80" cy="168" r="5"/><circle cx="80" cy="190" r="5"/></g>
</svg>`);

export const winter: Theme = {
  id: "winter",
  label: "Mùa đông",
  ages: ["preschool", "lower-primary", "upper-primary"],
  css: css.replace("var(--decor-flakes)", flakes).replace("var(--decor-snowman)", snowman),
};

export default winter;

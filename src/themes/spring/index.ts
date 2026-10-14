import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a peach-blossom branch and a red lantern, for Tết.
const blossom = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 200">
  <path d="M0 40 Q70 40 120 80 T250 130" fill="none" stroke="#7a4a32" stroke-width="9" stroke-linecap="round"/>
  <path d="M110 74 Q130 40 170 30" fill="none" stroke="#7a4a32" stroke-width="6" stroke-linecap="round"/>
  <g fill="#f4a3b4">
    <g transform="translate(60 36)"><circle cx="0" cy="-14" r="11"/><circle cx="13" cy="-4" r="11"/><circle cx="8" cy="12" r="11"/><circle cx="-8" cy="12" r="11"/><circle cx="-13" cy="-4" r="11"/></g>
    <g transform="translate(170 30)"><circle cx="0" cy="-14" r="11"/><circle cx="13" cy="-4" r="11"/><circle cx="8" cy="12" r="11"/><circle cx="-8" cy="12" r="11"/><circle cx="-13" cy="-4" r="11"/></g>
    <g transform="translate(200 118) scale(0.8)"><circle cx="0" cy="-14" r="11"/><circle cx="13" cy="-4" r="11"/><circle cx="8" cy="12" r="11"/><circle cx="-8" cy="12" r="11"/><circle cx="-13" cy="-4" r="11"/></g>
  </g>
  <g fill="#d62839"><circle cx="60" cy="36" r="5"/><circle cx="170" cy="30" r="5"/><circle cx="200" cy="118" r="4"/></g>
  <g fill="#f9c6d0"><circle cx="118" cy="96" r="7"/><circle cx="240" cy="140" r="6"/></g>
</svg>`);

const lantern = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 200">
  <path d="M60 0 V22" stroke="#7a4a32" stroke-width="4"/>
  <rect x="38" y="20" width="44" height="12" rx="3" fill="#e0a526"/>
  <ellipse cx="60" cy="86" rx="50" ry="56" fill="#d62839"/>
  <g fill="none" stroke="#b81f2f" stroke-width="4">
    <ellipse cx="60" cy="86" rx="24" ry="56"/>
    <path d="M60 30 V142"/>
  </g>
  <rect x="38" y="140" width="44" height="12" rx="3" fill="#e0a526"/>
  <g stroke="#e0a526" stroke-width="4" stroke-linecap="round">
    <path d="M50 152 V190"/><path d="M60 152 V196"/><path d="M70 152 V190"/>
  </g>
</svg>`);

export const spring: Theme = {
  id: "spring",
  label: "Mùa xuân (Tết)",
  ages: ["preschool", "lower-primary", "upper-primary"],
  css: css.replace("var(--decor-blossom)", blossom).replace("var(--decor-lantern)", lantern),
};

export default spring;

import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a blue-and-white vase and a scrolling cloud, in cobalt.
const vase = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 180">
  <path d="M46 6 H74 V22 Q74 30 82 38 Q112 66 106 118 Q100 164 60 174 Q20 164 14 118 Q8 66 38 38 Q46 30 46 22 Z" fill="#fbfdff" stroke="#1f4e9c" stroke-width="5"/>
  <path d="M40 6 H80" stroke="#1f4e9c" stroke-width="6" stroke-linecap="round"/>
  <path d="M30 56 H90" stroke="#1f4e9c" stroke-width="4"/>
  <path d="M18 140 H102" stroke="#1f4e9c" stroke-width="4"/>
  <g fill="none" stroke="#2f6cad" stroke-width="4" stroke-linecap="round">
    <path d="M40 100 Q40 80 60 80 Q80 80 80 100 Q80 116 60 116 Q46 116 46 102 Q46 92 58 92"/>
    <path d="M24 96 Q30 84 38 90"/><path d="M96 96 Q90 84 82 90"/>
  </g>
  <g fill="#2f6cad"><circle cx="38" cy="126" r="4"/><circle cx="60" cy="128" r="4"/><circle cx="82" cy="126" r="4"/></g>
</svg>`);

const scroll = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 90">
  <g fill="none" stroke="#1f4e9c" stroke-width="6" stroke-linecap="round">
    <path d="M10 60 Q10 30 40 30 Q66 30 66 54 Q66 70 50 70 Q36 70 36 58 Q36 48 46 48"/>
    <path d="M66 54 Q80 20 118 22 Q154 24 154 54 Q154 72 136 72 Q122 72 122 60 Q122 50 132 50"/>
    <path d="M154 54 Q168 36 190 40 Q210 44 208 62"/>
  </g>
  <path d="M10 80 H210" stroke="#6a8fc8" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 10"/>
</svg>`);

export const porcelain: Theme = {
  id: "porcelain",
  label: "Sứ Thanh Hoa",
  ages: ["upper-primary", "secondary", "adult"],
  css: css.replace("var(--decor-vase)", vase).replace("var(--decor-scroll)", scroll),
};

export default porcelain;

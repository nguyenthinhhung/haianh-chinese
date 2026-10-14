import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a clay teapot with steam, and a sprig of tea leaves.
const teapot = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150">
  <g fill="none" stroke="#b9c7ad" stroke-width="5" stroke-linecap="round">
    <path d="M86 30 Q76 18 86 8"/><path d="M104 30 Q94 16 104 4"/>
  </g>
  <path d="M40 80 Q20 70 10 54" fill="none" stroke="#8b5e3c" stroke-width="10" stroke-linecap="round"/>
  <path d="M150 70 Q182 70 176 96 Q170 116 146 112" fill="none" stroke="#8b5e3c" stroke-width="9"/>
  <ellipse cx="95" cy="98" rx="62" ry="44" fill="#a0694a"/>
  <path d="M45 86 Q95 104 145 86" fill="none" stroke="#7a4b2f" stroke-width="5"/>
  <ellipse cx="95" cy="54" rx="34" ry="9" fill="#7a4b2f"/>
  <circle cx="95" cy="42" r="8" fill="#7a4b2f"/>
  <ellipse cx="95" cy="142" rx="44" ry="6" fill="#7a4b2f"/>
</svg>`);

const leaves = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 110">
  <path d="M10 100 Q70 70 160 20" fill="none" stroke="#6b8f4e" stroke-width="5" stroke-linecap="round"/>
  <g fill="#5b8c3a">
    <path d="M60 76 Q50 40 80 30 Q90 62 60 76 Z"/>
    <path d="M100 54 Q120 24 150 34 Q126 62 100 54 Z"/>
    <path d="M40 88 Q20 70 28 50 Q50 66 40 88 Z"/>
  </g>
  <g fill="#8dbb6a"><path d="M130 36 Q140 14 164 14 Q154 36 130 36 Z"/></g>
</svg>`);

export const tea: Theme = {
  id: "tea",
  label: "Trà",
  ages: ["upper-primary", "secondary"],
  css: css.replace("var(--decor-teapot)", teapot).replace("var(--decor-leaves)", leaves),
};

export default tea;

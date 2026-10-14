import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a lattice corner and a row of dots.
const corner = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <g fill="none" stroke="#d64545" stroke-width="6" stroke-linecap="round" opacity="0.85">
    <path d="M12 200 V12 H200"/>
    <path d="M36 150 V36 H150"/>
    <path d="M36 92 H92 V36"/>
  </g>
  <circle cx="92" cy="92" r="9" fill="#e9b949"/>
</svg>`);

const dots = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 24">
  <circle cx="12" cy="12" r="8" fill="#d64545"/>
  <circle cx="48" cy="12" r="8" fill="#e9b949"/>
  <circle cx="84" cy="12" r="8" fill="#2a6f97"/>
</svg>`);

export const classic: Theme = {
  id: "classic",
  label: "Cổ điển",
  ages: ["upper-primary", "secondary"],
  css: css.replace("var(--decor-corner)", corner).replace("var(--decor-dots)", dots),
};

export default classic;

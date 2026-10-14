import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a ringed planet and a scatter of stars.
const planet = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200">
  <circle cx="120" cy="100" r="52" fill="#9b7cf2"/>
  <path d="M84 70 Q120 58 156 72" fill="none" stroke="#b9a2f7" stroke-width="10" stroke-linecap="round"/>
  <path d="M74 112 Q120 126 166 110" fill="none" stroke="#7e5fe0" stroke-width="10" stroke-linecap="round"/>
  <ellipse cx="120" cy="104" rx="104" ry="24" fill="none" stroke="#ffcc4d" stroke-width="8" transform="rotate(-14 120 104)"/>
  <path d="M68 92 A52 52 0 0 1 172 92" fill="#9b7cf2"/>
</svg>`);

const stars = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 160">
  <g fill="#ffe08a">
    <path d="M40 30 l6 14 15 2 -11 10 3 15 -13 -7 -13 7 3 -15 -11 -10 15 -2 z"/>
    <path d="M200 100 l4 9 10 1 -7 7 2 10 -9 -5 -9 5 2 -10 -7 -7 10 -1 z"/>
  </g>
  <g fill="#ffffff">
    <circle cx="120" cy="40" r="4"/><circle cx="260" cy="30" r="5"/><circle cx="90" cy="120" r="3"/>
    <circle cx="160" cy="70" r="3"/><circle cx="280" cy="130" r="4"/><circle cx="20" cy="140" r="3"/>
  </g>
</svg>`);

export const space: Theme = {
  id: "space",
  label: "Vũ trụ",
  ages: ["lower-primary", "upper-primary"],
  css: css.replace("var(--decor-planet)", planet).replace("var(--decor-stars)", stars),
};

export default space;

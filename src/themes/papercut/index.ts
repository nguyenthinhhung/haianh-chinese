import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a round red paper-cut window flower (窗花).
// Cut-outs are drawn in the background colour, as on real paper cuts.
const petal = (angle: number) => `<path d="M0 -30 Q14 -48 0 -66 Q-14 -48 0 -30 Z" transform="rotate(${angle})"/>`;
const windowFlower = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-80 -80 160 160">
  <circle r="78" fill="#c1121f"/>
  <circle r="70" fill="none" stroke="#fff7ef" stroke-width="3" stroke-dasharray="6 6"/>
  <g fill="#fff7ef">${[0, 45, 90, 135, 180, 225, 270, 315].map(petal).join("")}</g>
  <circle r="22" fill="#fff7ef"/>
  <circle r="15" fill="#c1121f"/>
  <g fill="#fff7ef"><circle cx="0" cy="0" r="5"/><circle cx="9" cy="0" r="2.5"/><circle cx="-9" cy="0" r="2.5"/><circle cx="0" cy="9" r="2.5"/><circle cx="0" cy="-9" r="2.5"/></g>
</svg>`);

export const papercut: Theme = {
  id: "papercut",
  label: "Tranh cắt giấy",
  ages: ["preschool", "lower-primary", "upper-primary"],
  css: css.replaceAll("var(--decor-flower)", windowFlower),
};

export default papercut;

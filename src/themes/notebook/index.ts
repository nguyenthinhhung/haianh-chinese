import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a 田字格 writing square and a pencil.
const grid = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect x="8" y="8" width="184" height="184" fill="#ffffff" stroke="#d1495b" stroke-width="8"/>
  <g stroke="#d1495b" stroke-width="4" stroke-dasharray="12 10" opacity="0.7">
    <path d="M100 8 V192"/><path d="M8 100 H192"/>
  </g>
</svg>`);

const pencil = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 50">
  <rect x="40" y="8" width="170" height="34" rx="4" fill="#f2c14e"/>
  <rect x="40" y="8" width="170" height="11" fill="#f7d77f"/>
  <rect x="210" y="8" width="20" height="34" fill="#c9ccd3"/>
  <rect x="230" y="8" width="16" height="34" rx="6" fill="#e98a98"/>
  <path d="M40 8 L6 25 L40 42 Z" fill="#f1d7b0"/>
  <path d="M17 19.5 L6 25 L17 30.5 Z" fill="#1f2a3a"/>
</svg>`);

export const notebook: Theme = {
  id: "notebook",
  label: "Vở ô ly",
  ages: ["upper-primary", "secondary", "adult"],
  css: css.replace("var(--decor-grid)", grid).replace("var(--decor-pencil)", pencil),
};

export default notebook;

import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a red seal and ink-wash mountains.
const seal = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="6" y="6" width="88" height="88" rx="10" fill="#b23a2b"/>
  <g fill="none" stroke="#f6f0e4" stroke-width="7" stroke-linecap="round">
    <rect x="22" y="22" width="56" height="56" rx="4"/>
    <path d="M50 22 V78"/><path d="M22 50 H78"/>
  </g>
</svg>`);

const mountains = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 100">
  <path d="M0 100 L40 52 L70 74 L118 18 L170 70 L200 50 L260 92 V100 Z" fill="#1d1d1b" opacity="0.12"/>
  <path d="M60 100 L110 48 L140 70 L188 30 L240 84 L260 76 V100 Z" fill="#1d1d1b" opacity="0.2"/>
  <path d="M120 100 L168 64 L196 82 L230 58 L260 80 V100 Z" fill="#1d1d1b" opacity="0.32"/>
  <circle cx="214" cy="24" r="12" fill="#b23a2b" opacity="0.75"/>
</svg>`);

export const ink: Theme = {
  id: "ink",
  label: "Thuỷ mặc",
  ages: ["upper-primary", "secondary", "adult"],
  css: css.replace("var(--decor-seal)", seal).replace("var(--decor-mountains)", mountains),
};

export default ink;

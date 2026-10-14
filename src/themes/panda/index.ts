import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a panda peeking in, and bamboo.
const face = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200">
  <circle cx="70" cy="62" r="30" fill="#2b2b2b"/>
  <circle cx="170" cy="62" r="30" fill="#2b2b2b"/>
  <ellipse cx="120" cy="118" rx="82" ry="72" fill="#ffffff" stroke="#2b2b2b" stroke-width="6"/>
  <ellipse cx="88" cy="110" rx="20" ry="26" fill="#2b2b2b" transform="rotate(-25 88 110)"/>
  <ellipse cx="152" cy="110" rx="20" ry="26" fill="#2b2b2b" transform="rotate(25 152 110)"/>
  <circle cx="92" cy="108" r="7" fill="#fff"/><circle cx="148" cy="108" r="7" fill="#fff"/>
  <ellipse cx="120" cy="140" rx="12" ry="8" fill="#2b2b2b"/>
  <path d="M108 156 Q120 166 132 156" fill="none" stroke="#2b2b2b" stroke-width="5" stroke-linecap="round"/>
  <circle cx="74" cy="146" r="10" fill="#f6a5b0"/><circle cx="166" cy="146" r="10" fill="#f6a5b0"/>
</svg>`);

const bamboo = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300">
  <g stroke="#3f8f45" stroke-width="16" stroke-linecap="round">
    <path d="M50 300 V20"/><path d="M110 300 V90"/>
  </g>
  <g stroke="#2d6e33" stroke-width="18">
    <path d="M42 90 H58"/><path d="M42 170 H58"/><path d="M42 240 H58"/>
    <path d="M102 160 H118"/><path d="M102 230 H118"/>
  </g>
  <g fill="#6cbf5a">
    <path d="M58 90 Q100 70 128 82 Q96 100 58 90 Z"/>
    <path d="M42 170 Q8 150 2 126 Q34 136 42 170 Z"/>
    <path d="M118 160 Q150 142 158 118 Q128 126 118 160 Z"/>
  </g>
</svg>`);

export const panda: Theme = {
  id: "panda",
  label: "Gấu trúc",
  ages: ["preschool", "lower-primary"],
  css: css.replace("var(--decor-panda)", face).replace("var(--decor-bamboo)", bamboo),
};

export default panda;

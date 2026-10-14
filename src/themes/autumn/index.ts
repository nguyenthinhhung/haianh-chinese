import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a full moon with a cloud for Mid-Autumn, and falling leaves.
const moon = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 160">
  <circle cx="120" cy="72" r="62" fill="#ffd46b"/>
  <g fill="#f3bd45" opacity="0.7"><circle cx="100" cy="56" r="10"/><circle cx="140" cy="88" r="13"/><circle cx="128" cy="46" r="6"/></g>
  <g fill="#ffffff">
    <ellipse cx="70" cy="128" rx="58" ry="18"/><ellipse cx="104" cy="116" rx="34" ry="20"/><ellipse cx="150" cy="130" rx="44" ry="15"/>
  </g>
</svg>`);

const leaf = (x: number, y: number, r: number, color: string) => `
  <g transform="translate(${x} ${y}) rotate(${r})">
    <path d="M0 -30 L8 -12 L26 -16 L16 0 L28 12 L8 12 L0 30 L-8 12 L-28 12 L-16 0 L-26 -16 L-8 -12 Z" fill="${color}"/>
    <path d="M0 30 V44" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
  </g>`;

const leaves = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 140">
  ${leaf(44, 80, -20, "#d9622b")}
  ${leaf(120, 50, 25, "#e8a33a")}
  ${leaf(200, 90, -40, "#b8442a")}
  <g fill="#c98b4a"><circle cx="84" cy="122" r="5"/><circle cx="168" cy="20" r="4"/><circle cx="240" cy="40" r="5"/></g>
</svg>`);

export const autumn: Theme = {
  id: "autumn",
  label: "Mùa thu (Trung thu)",
  ages: ["preschool", "lower-primary", "upper-primary"],
  css: css.replace("var(--decor-moon)", moon).replace("var(--decor-leaves)", leaves),
};

export default autumn;

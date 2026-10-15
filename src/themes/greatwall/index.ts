import type { Theme } from "../../core/theme";
import { svgUrl } from "../svg";
import css from "./theme.css?raw";

// Hand-drawn for this project: a stretch of wall with a watchtower over hills,
// and a curling "auspicious cloud" (祥云).
const wall = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 130">
  <path d="M0 130 L0 92 Q60 54 120 80 Q180 104 240 64 Q272 44 300 52 L300 130 Z" fill="#8fb98a"/>
  <path d="M0 130 L0 108 Q70 86 140 102 Q210 118 300 92 L300 130 Z" fill="#6f9f6b"/>
  <path d="M10 98 Q60 62 120 84 Q170 102 216 74" fill="none" stroke="#b9876a" stroke-width="14" stroke-linecap="round"/>
  <g fill="#b9876a">
    <rect x="24" y="74" width="10" height="12"/><rect x="52" y="64" width="10" height="12"/><rect x="84" y="62" width="10" height="12"/>
    <rect x="132" y="74" width="10" height="12"/><rect x="164" y="78" width="10" height="12"/><rect x="194" y="66" width="10" height="12"/>
  </g>
  <rect x="210" y="32" width="46" height="46" fill="#a9725a"/>
  <g fill="#a9725a"><rect x="210" y="22" width="10" height="12"/><rect x="228" y="22" width="10" height="12"/><rect x="246" y="22" width="10" height="12"/></g>
  <rect x="226" y="52" width="14" height="26" rx="7" fill="#5c3b2c"/>
</svg>`);

const cloud = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 110">
  <g fill="none" stroke="#c4553f" stroke-width="7" stroke-linecap="round">
    <path d="M20 80 Q20 50 50 50 Q78 50 78 76 Q78 94 60 94 Q44 94 44 80 Q44 70 54 70"/>
    <path d="M78 76 Q90 40 128 42 Q168 44 168 76 Q168 96 148 96 Q132 96 132 82 Q132 72 142 72"/>
    <path d="M20 80 Q8 100 30 100 H180"/>
  </g>
</svg>`);

export const greatwall: Theme = {
  id: "greatwall",
  label: "Vạn Lý Trường Thành",
  ages: ["lower-primary", "upper-primary", "secondary", "adult"],
  css: css.replace("var(--decor-wall)", wall).replace("var(--decor-cloud)", cloud),
};

export default greatwall;

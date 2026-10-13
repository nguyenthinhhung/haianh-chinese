// Nunito (SIL OFL 1.1), embedded so Latin and Vietnamese text looks the same on
// every machine. Latin-ext carries the third-tone pinyin vowels (ǎ ǐ ǒ ǔ ǚ).
import latin from "@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?inline";
import latinExt from "@fontsource-variable/nunito/files/nunito-latin-ext-wght-normal.woff2?inline";
import vietnamese from "@fontsource-variable/nunito/files/nunito-vietnamese-wght-normal.woff2?inline";

function face(src: string, unicodeRange: string): string {
  return `@font-face{font-family:"LS Nunito";font-style:normal;font-display:swap;font-weight:200 1000;src:url(${src}) format("woff2");unicode-range:${unicodeRange}}`;
}

// Unicode ranges as published by Fontsource for these subsets.
export const FONT_CSS = [
  face(
    vietnamese,
    "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
  ),
  face(
    latinExt,
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  ),
  face(
    latin,
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  ),
].join("\n");

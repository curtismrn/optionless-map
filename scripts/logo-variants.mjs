// Logo variants: keep the original OPTIONLESS artwork, replace the "S-O Archives"
// subtitle with dot-matrix text like an old handheld GPS LCD.
//
//   node scripts/logo-variants.mjs   → public/brand/logo-*.svg + preview.html

import { readFileSync, writeFileSync } from "node:fs";

// embedded: an SVG shown through <img> may not load external files
const ORIGINAL = `data:image/png;base64,${readFileSync("public/brand/image.png").toString("base64")}`;

// 5×7 dot-matrix glyphs (rows top→bottom, "1" = lit dot)
const G = {
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "◄": ["00010", "00110", "01110", "11110", "01110", "00110", "00010"],
  "►": ["01000", "01100", "01110", "01111", "01110", "01100", "01000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

// subtitle slot measured on public/brand/image.png (712×301)
const SLOT = { x0: 146, x1: 367, y0: 232, y1: 250 };

function dotText(text, { pitch = 2.5, r = 1.1, gap = 1 } = {}) {
  const chars = [...text];
  const cols = chars.length * 5 + (chars.length - 1) * gap;
  const w = cols * pitch, h = 7 * pitch;
  const ox = (SLOT.x0 + SLOT.x1) / 2 - w / 2 + pitch / 2;
  const oy = (SLOT.y0 + SLOT.y1) / 2 - h / 2 + pitch / 2;
  const dots = [];
  chars.forEach((ch, ci) => {
    const g = G[ch];
    if (!g) throw new Error(`no glyph for ${ch}`);
    g.forEach((row, y) =>
      [...row].forEach((bit, x) => {
        if (bit === "1") dots.push(`<circle cx="${(ox + (ci * (5 + gap) + x) * pitch).toFixed(2)}" cy="${(oy + y * pitch).toFixed(2)}" r="${r}"/>`);
      }),
    );
  });
  return { svg: dots.join(""), width: w };
}

function variant(name, text, opts) {
  const { svg, width } = dotText(text, opts);
  // widen the black patch only as much as the text needs, keeping the side rules
  const pad = 8;
  const cx = (SLOT.x0 + SLOT.x1) / 2;
  const half = Math.max((SLOT.x1 - SLOT.x0) / 2, width / 2 + pad);
  const file = `logo-${name}.svg`;
  writeFileSync(
    `public/brand/${file}`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 712 301" width="712" height="301">
  <image href="${ORIGINAL}" xlink:href="${ORIGINAL}" x="0" y="0" width="712" height="301"/>
  <rect x="${(cx - half).toFixed(1)}" y="${SLOT.y0}" width="${(half * 2).toFixed(1)}" height="${SLOT.y1 - SLOT.y0}" fill="#000"/>
  <!-- extend the horizontal rules (rows 242–246 in the original) up to the new, shorter text -->
  <rect x="140" y="242" width="${(cx - width / 2 - 9 - 140).toFixed(1)}" height="5" fill="#fff"/>
  <rect x="${(cx + width / 2 + 9).toFixed(1)}" y="242" width="${(372 - (cx + width / 2 + 9)).toFixed(1)}" height="5" fill="#fff"/>
  <g fill="#fff" transform="translate(${cx.toFixed(1)} ${((SLOT.y0 + SLOT.y1) / 2).toFixed(1)}) skewX(-12) translate(${(-cx).toFixed(1)} ${(-(SLOT.y0 + SLOT.y1) / 2).toFixed(1)})">${svg}</g>
</svg>
`,
  );
  return file;
}

const files = [
  variant("map", "MAP"),
  variant("map-arrows", "◄ MAP ►"),
  variant("road-atlas", "ROAD ATLAS", { pitch: 2.1, r: 0.95 }),
  variant("map-big", "MAP", { pitch: 3.1, r: 1.35, gap: 2 }),
];

writeFileSync(
  "public/brand/preview.html",
  `<!doctype html><meta charset="utf-8"><title>Logo variants</title>
<style>body{background:#000;color:#999;font:14px system-ui;margin:24px}figure{margin:0 0 28px}img{width:712px;max-width:100%;display:block;border:1px solid #222}</style>
<figure><img src="image.png"><figcaption>original</figcaption></figure>
${files.map((f) => `<figure><img src="${f}"><figcaption>${f}</figcaption></figure>`).join("\n")}
`,
);
console.log(files.join("\n"));

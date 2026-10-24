// Logo variants: keep the original OPTIONLESS artwork (public/brand/image.png)
// and replace the "S-O Archives" subtitle with new text set in the closest open
// font to the original (Saira, expanded / extra-bold / italic — Eurostile-like),
// converted to outlines so the SVG renders the same everywhere.
//
//   node scripts/logo-variants.mjs   → public/brand/logo-*.svg + preview.html

import { readFileSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";
import { PNG } from "pngjs";

const ORIGINAL = `data:image/png;base64,${readFileSync("public/brand/image.png").toString("base64")}`;
const buf = readFileSync("assets/fonts/Saira-ExpandedExtraBoldItalic.ttf");
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// Measured on the original (712×301): subtitle caps span rows 234–248, centred on x≈256.5;
// the horizontal rules are rows 242–246, from x=53 to the text and from the text to x=660.
const CAP_TOP = 234, CAP_BOTTOM = 248.5, CENTER_X = 256.5;
const RULE = { y: 241.6, h: 5.1, left: 53, right: 658 }; // measured incl. anti-aliasing
const SLANT = 2.5; // px; inner ends cut on the italic angle, like the original

/** Rule from x0 to x1 (measured at mid-height) with both ends cut on the italic slant. */
function rule(x0, x1) {
  const y0 = RULE.y, y1 = RULE.y + RULE.h;
  const pts = [[x0 + SLANT, y0], [x1 + SLANT, y0], [x1 - SLANT, y1], [x0 - SLANT, y1]];
  return pts.map(([x, y]) => `${x.toFixed(1)},${y}`).join(" ");
}

function setText(text, tracking) {
  const capH = (font.tables.os2.sCapHeight / font.unitsPerEm);
  const size = (CAP_BOTTOM - CAP_TOP) / capH;
  // measure with tracking (em fraction between letters)
  // plain capitals: map characters straight to glyphs (no shaping needed, and opentype.js
  // doesn't support one of this font's contextual lookups)
  const glyphs = [...text].map((ch) => font.charToGlyph(ch));
  const scale = size / font.unitsPerEm;
  let width = 0;
  glyphs.forEach((g, i) => (width += g.advanceWidth * scale + (i < glyphs.length - 1 ? tracking * size : 0)));
  let x = CENTER_X - width / 2;
  const paths = glyphs.map((g, i) => {
    const p = g.getPath(x, CAP_BOTTOM, size).toPathData(2);
    x += g.advanceWidth * scale + (i < glyphs.length - 1 ? tracking * size : 0);
    return p;
  });
  return { d: paths.join(""), x0: CENTER_X - width / 2, x1: CENTER_X + width / 2 };
}

// Tight bounds of the artwork (bright pixels) for the transparent "mark" version.
const png = PNG.sync.read(readFileSync("public/brand/image.png"));
const BOX = (() => {
  let x0 = png.width, y0 = png.height, x1 = 0, y1 = 0;
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      if (png.data[(y * png.width + x) * 4] > 40) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  const pad = 2;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 1 + 2 * pad, h: y1 - y0 + 1 + 2 * pad };
})();

function variant(name, text, tracking = 0.04) {
  const t = setText(text, tracking);
  const gap = 9; // space between rule ends and the text, as in the original
  // white artwork on black: the old rules + subtitle band is empty apart from them, so it is
  // masked and both rules are redrawn fully as vectors (italic-cut ends) around the new text
  const art = `<image href="${ORIGINAL}" xlink:href="${ORIGINAL}" x="0" y="0" width="712" height="301"/>
    <rect x="40" y="230" width="632" height="22" fill="#000"/>
    <polygon points="${rule(RULE.left, t.x0 - gap)}" fill="#fff"/>
    <polygon points="${rule(t.x1 + gap, RULE.right)}" fill="#fff"/>
    <path d="${t.d}" fill="#fff"/>`;
  const file = `logo-${name}.svg`;
  writeFileSync(
    `public/brand/${file}`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 712 301" width="712" height="301">
  ${art}
</svg>
`,
  );
  // Transparent mark (white artwork, no background), cropped to the artwork: usable as an <img>
  // on dark backgrounds or as a CSS mask to tint it with any colour.
  writeFileSync(
    `public/brand/mark-${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}" width="${BOX.w}" height="${BOX.h}">
  <mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="712" height="301" style="mask-type:luminance">
    ${art}
  </mask>
  <rect x="0" y="0" width="712" height="301" fill="#fff" mask="url(#m)"/>
</svg>
`,
  );
  return file;
}

const files = [variant("map", "MAP", 0.06), variant("worldmap", "WORLDMAP", 0.03), variant("world-map", "WORLD MAP", 0.03)];

writeFileSync(
  "public/brand/preview.html",
  `<!doctype html><meta charset="utf-8"><title>Logo variants</title>
<style>body{background:#000;color:#999;font:14px system-ui;margin:24px}figure{margin:0 0 28px}img{width:712px;max-width:100%;display:block;border:1px solid #222}</style>
<figure><img src="image.png"><figcaption>original</figcaption></figure>
<figure style="background:#f5f5f2;padding:12px"><img src="mark-worldmap.svg" style="width:300px;filter:invert(1);border:0"><figcaption>mark-worldmap.svg (transparent, inverted on light)</figcaption></figure>
${files.map((f) => `<figure><img src="${f}"><figcaption>${f}</figcaption></figure>`).join("\n")}
`,
);
console.log(files.join("\n"));

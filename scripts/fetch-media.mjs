// Build-time fetch of openly licensed seed media from Wikimedia Commons.
//
// Each atlas entity is mapped to one or more Commons categories. Files are
// filtered (images ≥ 1000 px wide, WebM clips), obvious off-topic titles are
// excluded, and author / licence / source page are kept for attribution.
// Media are hot-linked from upload.wikimedia.org (allowed; attribution shown).
//
// Usage: npm run data:media   (slow on purpose — the Commons API rate-limits)

import { writeFileSync, mkdirSync } from "node:fs";

const UA = "OPTIONLESS-MAP-prototype/0.1 (dev data build)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(3000 + attempt * 5000);
    const res = await fetch("https://commons.wikimedia.org/w/api.php?format=json&" + new URLSearchParams(params), { headers: { "User-Agent": UA } });
    const text = await res.text();
    if (text.startsWith("{")) return JSON.parse(text);
    console.warn("  rate-limited, retrying…");
  }
  throw new Error("Commons API unavailable");
}

/** entity → categories (first = primary) and max items */
const PLAN = [
  { attachedTo: { type: "location", id: "loc-ibardin" }, categories: ["Col d'Ibardin", "Views of Larrun from Ibardin"], max: 10 },
  { attachedTo: { type: "location", id: "loc-stelvio" }, categories: ["Passo dello Stelvio"], max: 8 },
  { attachedTo: { type: "variant", id: "var-stelvio-prato" }, categories: ["Eastern ramp of Stelvio Pass"], max: 8 },
  { attachedTo: { type: "variant", id: "var-stelvio-bormio" }, categories: ["Western ramp of Stelvio Pass"], max: 8 },
  { attachedTo: { type: "location", id: "loc-transfagarasan" }, categories: ["Transfăgărășan"], max: 10 },
  { attachedTo: { type: "location", id: "loc-turini" }, categories: ["Col de Turini"], max: 10 },
  { attachedTo: { type: "location", id: "loc-irohazaka" }, categories: ["Irohazaka"], max: 10 },
  { attachedTo: { type: "location", id: "loc-haruna" }, categories: ["Mount Haruna", "Lake Haruna"], max: 6 },
  { attachedTo: { type: "location", id: "loc-pikes" }, categories: ["Pikes Peak Highway", "Pikes Peak International Hill Climb"], max: 10 },
  { attachedTo: { type: "location", id: "loc-dragon" }, categories: ["Deals Gap", "U.S. Route 129 in Tennessee", "U.S. Route 129 in North Carolina"], max: 6 },
];

// Off-topic for a road atlas (animals, food, maps, ships, unrelated buildings…).
const EXCLUDE =
  /relief map|srtm|logo|ship|tv station|bär|bear|fox|baby|sagardotegia|usoa|houx|cromlech|chevaux|horse|shrine|panorama april|rp-f-|aerial photograph|coat of arms|stamp|bus |neoplan|spaceliner|ford explorer|marathon|coppi|nara -|in art/i;

const strip = (html = "") =>
  html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();

const items = [];
const seen = new Set();

for (const entry of PLAN) {
  const picked = [];
  for (const cat of entry.categories) {
    if (picked.length >= entry.max) break;
    const list = await api({ action: "query", list: "categorymembers", cmtitle: `Category:${cat}`, cmtype: "file", cmlimit: "60" });
    const titles = (list.query?.categorymembers ?? []).map((m) => m.title).filter((t) => !EXCLUDE.test(t) && !seen.has(t));
    if (!titles.length) {
      console.log(`${cat}: no files`);
      continue;
    }
    for (let i = 0; i < titles.length && picked.length < entry.max; i += 40) {
      const info = await api({
        action: "query",
        prop: "imageinfo",
        titles: titles.slice(i, i + 40).join("|"),
        iiprop: "url|size|mime|extmetadata",
        iiurlwidth: "1280",
        iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|DateTimeOriginal|ImageDescription|AttributionRequired",
      });
      for (const p of Object.values(info.query?.pages ?? {})) {
        const ii = p.imageinfo?.[0];
        if (!ii || picked.length >= entry.max) continue;
        const isVideo = ii.mime === "video/webm";
        const isImage = ii.mime === "image/jpeg" && ii.width >= 1000 && ii.width / ii.height < 3.2;
        if (!isVideo && !isImage) continue;
        const m = ii.extmetadata ?? {};
        const license = strip(m.LicenseShortName?.value);
        if (!license) continue;
        seen.add(p.title);
        picked.push({
          id: `cm-${p.pageid}`,
          attachedTo: entry.attachedTo,
          kind: isVideo ? "clip" : "photo",
          source: "commons",
          title: p.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
          url: isVideo ? ii.url : ii.thumburl,
          thumbUrl: (ii.thumburl ?? ii.url).replace(/\/1280px-/, "/500px-"),
          width: ii.thumbwidth ?? ii.width,
          height: ii.thumbheight ?? ii.height,
          caption: strip(m.ImageDescription?.value).slice(0, 220),
          credit: strip(m.Artist?.value).slice(0, 120) || "Unknown author",
          license,
          licenseUrl: m.LicenseUrl?.value ?? null,
          sourceUrl: ii.descriptionurl,
          capturedAt: strip(m.DateTimeOriginal?.value).slice(0, 10) || null,
        });
      }
    }
    console.log(`${cat}: ${picked.length} picked so far`);
  }
  items.push(...picked);
}

mkdirSync("src/data/generated", { recursive: true });
writeFileSync(
  "src/data/generated/media.json",
  JSON.stringify({ generatedAt: new Date().toISOString(), source: "Wikimedia Commons", items }, null, 1),
);
console.log(`wrote ${items.length} media items`);

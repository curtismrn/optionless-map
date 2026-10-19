// Editorial pass over src/data/generated/media.json (run after fetch-media.mjs).
//  * drops files that are on-category but off-topic for a road atlas
//  * re-attaches files whose Commons description names a specific ramp
//  * adds WebM clips (served as Commons 720p transcodes, not the 4K originals)

import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/data/generated/media.json";
const UA = "OPTIONLESS-MAP-prototype/0.1 (dev data build)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DROP = new Set([
  "L'aire de jeu du Col d'Ibardin", // playground
  "Metallic wine barrels in a venta of Ibardin pass",
  "Sentier de grande randonnée du Col d'Ibardin", // hiking trail
  "Ex. Österreichische Gipfelstellung auf dem Monte Scerluzzo", // WWI position, not the road
  "Gebirgskrieg-1915-1918-Memorial-Plaque-Stelvio-Pass",
  "Funifor stelvio", // cable car
  "Abstieg vom Piz Umbrail Vordergrund gelber Alpenmohn Hintergrund Ortler",
  "Graubünden Umbrailpass 23",
  "HidrocentralaVidraru",
  "HidrocentralaVidraru1",
  "Paul Bica - after the storm", // no road / location context in description
  "Jižní údolí",
  "群馬県における榛名山の位置", // location map
  "Haruna02", // neighbouring Mount Kamonga
  "Pikes Peak From 33,000 ft", // aerial from an airliner
]);

// "versante atesino" = South Tyrol side = Prato (eastern) ramp.
const MOVE = { "Stelvio tornanti": { type: "variant", id: "var-stelvio-prato" } };

const CLIPS = [
  { title: "File:Col d'Ibardin 151355.webm", attachedTo: { type: "location", id: "loc-ibardin" } },
  { title: "File:Col d'Ibardin 162806.webm", attachedTo: { type: "location", id: "loc-ibardin" } },
  { title: "File:Col d'Ibardin 154522.webm", attachedTo: { type: "location", id: "loc-ibardin" } },
  { title: "File:Col d'ibardin 154619 1.webm", attachedTo: { type: "location", id: "loc-ibardin" } },
];

const strip = (h = "") => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const data = JSON.parse(readFileSync(FILE, "utf8"));
let items = data.items.filter((m) => !DROP.has(m.title) && m.kind !== "clip");
for (const m of items) if (MOVE[m.title]) m.attachedTo = MOVE[m.title];

await sleep(2000);
const res = await fetch(
  "https://commons.wikimedia.org/w/api.php?format=json&" +
    new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      titles: CLIPS.map((c) => c.title).join("|"),
      iiprop: "url|size|mime|extmetadata",
      iiurlwidth: "1280",
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|DateTimeOriginal|ImageDescription",
    }),
  { headers: { "User-Agent": UA } },
);
const info = await res.json();
const clips = [];
for (const p of Object.values(info.query.pages)) {
  const ii = p.imageinfo?.[0];
  const spec = CLIPS.find((c) => c.title === p.title);
  if (!ii || !spec || ii.mime !== "video/webm") continue;
  const m = ii.extmetadata ?? {};
  // https://upload.wikimedia.org/wikipedia/commons/a/ab/X.webm → …/commons/transcoded/a/ab/X.webm/X.webm.720p.vp9.webm
  const original = ii.url.replace(/\?.*$/, "");
  const name = original.split("/").pop();
  const transcoded = original.replace("/wikipedia/commons/", "/wikipedia/commons/transcoded/") + `/${name}.720p.vp9.webm`;
  clips.push({
    id: `cm-${p.pageid}`,
    attachedTo: spec.attachedTo,
    kind: "clip",
    source: "commons",
    title: p.title.replace(/^File:/, "").replace(/\.webm$/i, ""),
    url: transcoded,
    thumbUrl: ii.thumburl.replace(/\/1280px--/, "/500px--").replace(/\?.*$/, ""),
    width: ii.width,
    height: ii.height,
    caption: strip(m.ImageDescription?.value).slice(0, 220),
    credit: strip(m.Artist?.value).slice(0, 120) || "Unknown author",
    license: strip(m.LicenseShortName?.value),
    licenseUrl: m.LicenseUrl?.value ?? null,
    sourceUrl: ii.descriptionurl,
    capturedAt: strip(m.DateTimeOriginal?.value).slice(0, 10) || null,
  });
}
// strip tracking query strings Commons appends to thumb URLs
items = items.map((m) => ({ ...m, url: m.url?.replace(/\?utm_.*$/, ""), thumbUrl: m.thumbUrl?.replace(/\?utm_.*$/, "") }));
data.items = [...clips, ...items];
data.curatedAt = new Date().toISOString();
writeFileSync(FILE, JSON.stringify(data, null, 1));
console.log(`curated: ${data.items.length} items (${clips.length} clips, dropped ${DROP.size})`);

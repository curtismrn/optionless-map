const UA = "OPTIONLESS-MAP-prototype/0.1 (dev data build)";
const qs = process.argv.slice(2);
for (const q of qs) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA } });
  const j = await r.json();
  console.log("## " + q);
  for (const x of j) console.log(`  ${(+x.lon).toFixed(5)},${(+x.lat).toFixed(5)}  ${x.category}/${x.type}  ${x.display_name.slice(0, 110)}`);
  await new Promise((s) => setTimeout(s, 1100));
}

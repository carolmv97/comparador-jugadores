// stats.js
import fs from "fs/promises";

function countMatches(matches) {
  const cnt = new Map();
  for (const m of matches) {
    for (const id of [m.A1, m.A2, m.B1, m.B2]) {
      cnt.set(id, (cnt.get(id) ?? 0) + 1);
    }
  }
  return cnt;
}

function topN(map, n=20) {
  return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n);
}

async function main() {
  const args = process.argv.slice(2); // IDs opcionales
  const s = await fs.readFile("cache/matches.json","utf-8");
  const matches = JSON.parse(s);
  console.log(`Partidos en cache: ${matches.length}`);

  const cnt = countMatches(matches);
  if (args.length) {
    for (const id of args) {
      console.log(`Jugador ${id}: ${cnt.get(id) ?? 0} apariciones`);
    }
  } else {
    console.log("Top 20 jugadores por apariciones:");
    for (const [id,c] of topN(cnt,20)) {
      console.log(`${id}\t${c}`);
    }
  }
}
main().catch(e=>{ console.error(e.message); process.exit(1); });

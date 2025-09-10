// debug.js (autónomo)
import "dotenv/config";
import fs from "fs/promises";

const API_BASE = "https://fantasypadeltour.com/api";
const TOKEN = process.env.FPT_API_KEY;
if (!TOKEN) throw new Error("Falta FPT_API_KEY en .env");

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} -> ${path}`);
  return res.json();
}

// intenta varias rutas para detalle
async function getMatchDetail(tournamentId, matchId) {
  const inc = "include=participants.players,teams.players,score,result";
  const withp = "with=participants.players,teams.players";
  const paths = [
    `/tournaments/${tournamentId}/matches/${matchId}?${inc}`,
    `/tournaments/${tournamentId}/match/${matchId}?${inc}`,
    `/tournaments/${tournamentId}/matches/${matchId}?${withp}`,
    `/matches/${matchId}?${inc}`,
    `/match/${matchId}?${inc}`,
    `/matches/${matchId}?${withp}`,
    `/tournaments/${tournamentId}/matches/${matchId}`,
    `/matches/${matchId}`,
  ];
  for (const p of paths) {
    try { return await apiGet(p); } catch {}
  }
  return null;
}

function isPremier(t) {
  const txt = [
    t.name, t.title, t.fullName, t.tourName, t.tour, t.circuit, t.series, t.category
  ].filter(Boolean).join(" ").toLowerCase();
  return /\bpremier\b/.test(txt) || /premier\s*padel/.test(txt) || /\bpp\b/.test(txt);
}

async function paginate(path, perPage = 200) {
  const out = [];
  let page = 1;
  while (true) {
    const url = path.includes("?")
      ? `${path}&page=${page}&per_page=${perPage}`
      : `${path}?page=${page}&per_page=${perPage}`;
    const data = await apiGet(url);
    const items = data.items ?? data.data ?? data.results ?? (Array.isArray(data) ? data : []);
    if (Array.isArray(items)) out.push(...items);
    const hasNext = data.nextPage ?? data.links?.next ?? (data.meta?.current_page < data.meta?.last_page);
    if (!hasNext) break;
    page++;
  }
  return out;
}

async function main() {
  const seasons = await paginate("/seasons");
  const last = seasons.at(-1) ?? seasons[0];
  const sid = last.id ?? last.seasonId ?? last;
  const tournaments = await paginate(`/seasons/${sid}/tournaments`);
  const t = tournaments.find(isPremier) ?? tournaments[0];
  if (!t) {
    console.log("No encontré torneos.");
    return;
  }
  const tid = t.id ?? t.tournamentId ?? t;
  console.log("Torneo elegido:", t.name ?? t.title ?? tid, "id:", tid);

  // 1) lista “bruta” (con includes por si cuela)
  const matches = await paginate(`/tournaments/${tid}/matches?include=participants.players,teams.players,score,result`);
  console.log("Partidos brutos con include:", matches.length);
  await fs.writeFile("sample_matches.json", JSON.stringify(matches.slice(0,2), null, 2), "utf-8");
  console.log("Guardado sample_matches.json (2 partidos).");

  if (!matches.length) return;

  // 2) detalle del primero (prueba varias rutas)
  const mid = matches[0].id ?? matches[0].matchId ?? matches[0].match_id ?? matches[0].uuid;
  if (mid == null) {
    console.log("El match no tiene id claro:", Object.keys(matches[0]));
    return;
  }
  const detail = await getMatchDetail(tid, mid);
  if (detail) {
    await fs.writeFile("sample_match_detail.json", JSON.stringify(detail, null, 2), "utf-8");
    console.log("Guardado sample_match_detail.json.");
  } else {
    console.log("No conseguí detalle para el match:", mid);
  }
}

// Debug: ver cuántos nombres tenemos y un ejemplo
app.get("/api/debug-names", (_req, res) => {
  res.json({
    size: NAME_CACHE.length,
    sample: NAME_CACHE.slice(0, 20),
  });
});


main().catch(e => console.error("DEBUG ERROR:", e));

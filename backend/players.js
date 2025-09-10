// players.js
import "dotenv/config";

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

// Paginación genérica
async function paginate(path, perPage = 200) {
  const out = [];
  let page = 1;
  while (true) {
    const url = path.includes("?")
      ? `${path}&page=${page}&per_page=${perPage}`
      : `${path}?page=${page}&per_page=${perPage}`;
    const data = await apiGet(url);
    const items = data.items ?? data.data ?? data.results ?? [];
    out.push(...items);
    const hasNext =
      data.nextPage ?? (data.meta?.current_page < data.meta?.last_page);
    if (!hasNext) break;
    page++;
  }
  return out;
}

// Normaliza texto: sin tildes, minúsculas
function norm(s) {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function displayName(p) {
  if (p.name) return p.name;
  const fn = p.firstName ?? p.firstname ?? "";
  const ln = p.lastName ?? p.lastname ?? "";
  return `${fn} ${ln}`.trim();
}

async function loadAllPlayers() {
  // Si el endpoint es /players, lo paginamos completo
  return paginate("/players");
}

async function main() {
  const q = process.argv.slice(2).join(" ");
  if (!q) {
    console.log("Uso: node players.js <texto a buscar>");
    return;
  }

  const players = await loadAllPlayers();
  const qn = norm(q);

  const matches = players
    .map((p) => ({ id: p.id ?? p.playerId ?? "", name: displayName(p) }))
    .filter((p) => norm(p.name).includes(qn))
    .slice(0, 50); // limita resultados

  if (matches.length === 0) {
    console.log("Sin resultados.");
    return;
  }

  for (const p of matches) {
    console.log(`${p.id}\t${p.name}`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});

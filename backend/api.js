// api.js
import fs from "fs/promises";
import "dotenv/config";

const API_BASE = "https://fantasypadeltour.com/api";
const TOKEN = process.env.FPT_API_KEY;
if (!TOKEN) throw new Error("Falta FPT_API_KEY en .env");

// ========= HTTP básico y paginado =========
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} -> ${path}`);
  return res.json();
}

async function paginate(path, perPage = 200) {
  const out = [];
  let page = 1;
  while (true) {
    const url = path.includes("?")
      ? `${path}&page=${page}&per_page=${perPage}`
      : `${path}?page=${page}&per_page=${perPage}`;
    const data = await apiGet(url);

    // La API puede devolver {items|data|results} o directamente []
    const items =
      data.items ??
      data.data ??
      data.results ??
      (Array.isArray(data) ? data : []);
    if (Array.isArray(items)) out.push(...items);

    const hasNext =
      data.nextPage ??
      data.links?.next ??
      (data.meta?.current_page < data.meta?.last_page);
    if (!hasNext) break;
    page++;
  }
  return out;
}

// ========= Endpoints básicos (exportados) =========
export async function listSeasons() {
  return paginate("/seasons");
}
export async function listTournaments(seasonId) {
  return paginate(`/seasons/${seasonId}/tournaments`);
}
export async function listTournamentMatches(tournamentId) {
  return paginate(`/tournaments/${tournamentId}/matches`);
}

// Obtener un jugador por ID
export async function getPlayer(id) {
  const data = await apiGet(`/players/${id}`);
  return {
    id: data.id ?? String(id),
    name:
      data.name ??
      `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() ??
      String(id),
  };
}

// Resolver varios IDs -> [{id,name}]
export async function getPlayersByIds(ids, { pauseMs = 120 } = {}) {
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i]);
    try {
      const p = await getPlayer(id);
      out.push({ id: String(p.id), name: p.name });
      console.log(`Jugador obtenido: ${JSON.stringify(p)}`); // Log de ejemplo
    } catch {
      out.push({ id, name: id });
      console.log(`Error al obtener jugador con ID: ${id}`); // Log de error
    }
    // Pequeña pausa anti 429
    if ((i + 1) % 5 === 0) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return out;
}

// ========= Utils =========
function isPremierTournament(t) {
  const txt = [
    t.name,
    t.title,
    t.fullName,
    t.tourName,
    t.tour,
    t.circuit,
    t.series,
    t.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    /\bpremier\b/.test(txt) ||
    /premier\s*padel/.test(txt) ||
    /\bpp\b/.test(txt)
  );
}

function anyDate(obj) {
  // prioriza el campo real que vimos: played_at
  return (
    obj?.played_at ??
    obj?.date ??
    obj?.startedAt ??
    obj?.start_time ??
    obj?.startTime ??
    obj?.matchDate ??
    obj?.utcStartTime ??
    obj?.time ??
    obj?.scheduledAt ??
    null
  );
}

const normalize = (s) =>
  s?.toString().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() ??
  "";

// ========= Parser principal de un partido =========
// Devuelve {date, A1,A2,B1,B2,winner,sets...} o null si falta algo esencial
export function toMatch(m) {
  // 1) Fecha
  const dateStr = anyDate(m) || anyDate(m?.tournament) || "2000-01-01";

  // 2) Extraer jugadores (prioriza formato real: players.team_1 / team_2)
  const fromPlayersTree = () => {
    if (m?.players?.team_1 && m?.players?.team_2) {
      const norm = (arr) =>
        (arr ?? [])
          .map((p) => p?.id ?? p?.playerId ?? p?.player?.id ?? p)
          .filter(Boolean)
          .map(String);
      const A = norm(m.players.team_1);
      const B = norm(m.players.team_2);
      if (A.length >= 2 && B.length >= 2) {
        return { A1: A[0], A2: A[1], B1: B[0], B2: B[1] };
      }
    }
    return null;
  };

  // fallbacks
  const fromParticipants = () => {
    if (Array.isArray(m.participants) && m.participants.length >= 2) {
      const parts = m.participants;
      const norm = (part) =>
        (part.players ?? part.playerList ?? [])
          .map((p) => p?.id ?? p?.playerId ?? p?.player?.id ?? p)
          .filter(Boolean)
          .map(String);
      let A =
        parts.find((p) =>
          String(p.side ?? p.teamSide ?? "")
            .toUpperCase()
            .startsWith("A")
        ) ?? parts[0];
      let B =
        parts.find((p) =>
          String(p.side ?? p.teamSide ?? "")
            .toUpperCase()
            .startsWith("B")
        ) ?? parts[1];
      const AA = norm(A),
        BB = norm(B);
      if (AA.length >= 2 && BB.length >= 2) {
        return { A1: AA[0], A2: AA[1], B1: BB[0], B2: BB[1] };
      }
    }
    return null;
  };

  const fromTeamsArray = () => {
    if (Array.isArray(m.teams) && m.teams.length >= 2) {
      const norm = (t) =>
        (t.players ?? t.playerList ?? [])
          .map((p) => p?.id ?? p?.playerId ?? p?.player?.id ?? p)
          .filter(Boolean)
          .map(String);
      const A = norm(m.teams[0]),
        B = norm(m.teams[1]);
      if (A.length >= 2 && B.length >= 2)
        return { A1: A[0], A2: A[1], B1: B[0], B2: B[1] };
    }
    return null;
  };

  const fromHomeAway = () => {
    if (m.home && m.away) {
      const norm = (side) =>
        (side.players ?? side.playerList ?? [])
          .map((p) => p?.id ?? p?.playerId ?? p?.player?.id ?? p)
          .filter(Boolean)
          .map(String);
      const A = norm(m.home),
        B = norm(m.away);
      if (A.length >= 2 && B.length >= 2)
        return { A1: A[0], A2: A[1], B1: B[0], B2: B[1] };
    }
    return null;
  };

  const fromFlat = () => {
    const A1 = m.A1 ?? m.a1 ?? m.playerA1Id ?? m.player1Id ?? m.homePlayer1Id;
    const A2 = m.A2 ?? m.a2 ?? m.playerA2Id ?? m.player2Id ?? m.homePlayer2Id;
    const B1 = m.B1 ?? m.b1 ?? m.playerB1Id ?? m.player3Id ?? m.awayPlayer1Id;
    const B2 = m.B2 ?? m.b2 ?? m.playerB2Id ?? m.player4Id ?? m.awayPlayer2Id;
    if (A1 && A2 && B1 && B2)
      return {
        A1: String(A1),
        A2: String(A2),
        B1: String(B1),
        B2: String(B2),
      };
    return null;
  };

  const ids =
    fromPlayersTree() ||
    fromParticipants() ||
    fromTeamsArray() ||
    fromHomeAway() ||
    fromFlat();
  if (!ids) return null;

  // 3) Ganador
  const inferWinner = () => {
    const w = (
      m.winner ??
      m.winnerSide ??
      m.result?.winnerSide ??
      m.result?.winner
    )
      ?.toString()
      .toLowerCase();
    if (w === "team_1" || w === "a") return "A";
    if (w === "team_2" || w === "b") return "B";

    // por marcador en array [{team_1, team_2}]
    if (Array.isArray(m.score)) {
      let a = 0,
        b = 0;
      for (const set of m.score) {
        const x = Number(set.team_1),
          y = Number(set.team_2);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          if (x > y) a++;
          else if (y > x) b++;
        }
      }
      if (a !== b) return a > b ? "A" : "B";
    }
    // por marcador string "6-4 3-6 6-3"
    if (typeof m.score === "string") {
      const sets = m.score.trim().split(/\s+/);
      let a = 0,
        b = 0;
      for (const s of sets) {
        const mm = s.match(/^(\d+)[-:](\d+)$/);
        if (!mm) continue;
        const x = parseInt(mm[1], 10),
          y = parseInt(mm[2], 10);
        if (x > y) a++;
        else if (y > x) b++;
      }
      if (a !== b) return a > b ? "A" : "B";
    }
    return null;
  };

  const winner = inferWinner();
  if (winner !== "A" && winner !== "B") return null;

  // 4) sets opcionales a string legible
  const sets = Array.isArray(m.score)
    ? m.score.map((s) => `${s.team_1}-${s.team_2}`).join(" ")
    : typeof m.score === "string"
    ? m.score
    : undefined;

  return {
    date: dateStr,
    A1: ids.A1,
    A2: ids.A2,
    B1: ids.B1,
    B2: ids.B2,
    winner,
    sets,
    surface: m.tournament?.surface ?? m.surface ?? undefined,
    indoor: m.tournament?.indoor ?? m.indoor ?? undefined,
    tournament: m.tournament?.name ?? m.tournament?.title ?? m.tName ?? "Desconocido"
  };
}

// ========= Descarga (todas las temporadas, solo Premier) =========
export async function downloadAllMatches() {
  const seasons = await listSeasons();
  const mapped = [];
  let omitted = 0;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const s of seasons) {
    const sid = s.id ?? s.seasonId ?? s;
    const tournaments = await listTournaments(sid);
    const premier = tournaments.filter(isPremierTournament);

    for (const t of premier) {
      const tid = t.id ?? t.tournamentId ?? t;
      const tName = t.name ?? t.title ?? t.fullName ?? `Torneo ${tid}`;

      const base = await listTournamentMatches(tid);
      console.log(`${tName}: ${base.length} partidos (brutos)`);
      console.log(`[${s.year ?? s.name ?? sid}] ${tName}: ${base.length} partidos (brutos)`);


      for (const bm of base) {
        bm.tournament =
          bm.tournament ?? { surface: t.surface, indoor: t.indoor, name: tName };
        const mm = toMatch(bm);
        if (mm) mapped.push(mm);
        else omitted++;
      }

      await sleep(250); // anti-429 por torneo
    }
  }

  await fs.mkdir("cache", { recursive: true });
  await fs.writeFile(
    "cache/matches.json",
    JSON.stringify(mapped, null, 2),
    "utf-8"
  );
  console.log(
    `Guardado cache/matches.json con ${mapped.length} partidos (omitidos: ${omitted})`
  );
  return mapped;
}

// ========= Cargar cache =========
export async function loadCachedMatches() {
  try {
    const s = await fs.readFile("cache/matches.json", "utf-8");
    return JSON.parse(s);
  } catch {
    return [];
  }
}

// ========= Búsqueda de jugadores (remota, con fallback) =========
export async function searchPlayersAny(q) {
  const qRaw = (q ?? "").toString().trim();
  if (!qRaw) return [];

  // 1) intenta server-side ?search= o ?q=
  for (const param of ["search", "q"]) {
    try {
      const data = await apiGet(`/players?${param}=${encodeURIComponent(qRaw)}&page=1&per_page=50`);
      const items =
        data.items ??
        data.data ??
        data.results ??
        (Array.isArray(data) ? data : []);
      if (items?.length) {
        return items.map((p) => ({
          id: p.id ?? p.playerId ?? "",
          name:
            p.name ??
            `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() ??
            String(p.id ?? ""),
        }));
      }
    } catch {
      // ignore y seguimos
    }
  }

  // 2) pagina todo y filtra local
  try {
    const all = await paginate("/players", 200);
    const qn = normalize(qRaw);
    return all
      .map((p) => ({
        id: p.id ?? p.playerId ?? "",
        name:
          p.name ??
          `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() ??
          String(p.id ?? ""),
      }))
      .filter((p) => normalize(p.name).includes(qn))
      .slice(0, 20);
  } catch {
    return [];
  }
}

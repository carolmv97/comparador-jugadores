// server.js
console.log("=== SERVER v7 ===");

import express from "express";
import cors from "cors";
import morgan from "morgan";
import "dotenv/config.js";

import {
  loadCachedMatches,
  downloadAllMatches,
  getPlayersByIds,
  searchPlayersAny,
} from "./api.js";
import { buildStats, predictSimple } from "./prob_simple.js";

// -------------------- Estado --------------------
let MATCHES = [];
let STATS = null;
let NAME_CACHE = []; // [{ id, name }]

const norm = (s) =>
  s?.toString().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() ??
  "";

// -------------------- Datos --------------------
async function ensureData({ forceDownload = false } = {}) {
  if (forceDownload || MATCHES.length === 0) {
    let data = await loadCachedMatches();
    if (forceDownload || data.length === 0) {
      console.log("[init] No hay cache o forceDownload: descargando histórico…");
      data = await downloadAllMatches();
    }
    MATCHES = data;
    STATS = buildStats(MATCHES);
    console.log(`[init] Histórico cargado: ${MATCHES.length} partidos.`);

    // Mostrar torneos únicos cargados
    const tournaments = Array.from(new Set(MATCHES.map((m) => m.tournamentName || m.tournamentId)));
    console.log(`[init] Torneos cargados:`, tournaments);

    // Índice de nombres a partir de IDs del histórico
    const ids = Array.from(
      new Set(
        MATCHES.flatMap((m) => [m.A1, m.A2, m.B1, m.B2])
          .filter(Boolean)
          .map(String)
      )
    );
    console.log("IDs generados para getPlayersByIds:", ids.slice(0, 10)); // Log de ejemplo
    console.log(`[names] Resolviendo nombres para ${ids.length} IDs…`);
    NAME_CACHE = await getPlayersByIds(ids);
    console.log(`[names] Índice listo con ${NAME_CACHE.length} jugadores.`);
    console.log("Contenido de NAME_CACHE:", NAME_CACHE.slice(0, 10)); // Log de ejemplo
  }
}

// -------------------- App --------------------
const app = express();
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// Health (con logs)
app.get("/api/health", (_req, res) => {
  const matchesCount = Array.isArray(MATCHES) ? MATCHES.length : -1;
  const namesCount = Array.isArray(NAME_CACHE) ? NAME_CACHE.length : -1;

  console.log(`[health] matches=${matchesCount} names=${namesCount}`);

  // fuerza un objeto literal simple, sin getters ni nada raro
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(JSON.stringify({
    ok: true,
    matches: matchesCount,
    names: namesCount,
  }));
});

// Debug: devuelve tamaños y primeras filas para inspeccionar
app.get("/api/debug/state", (_req, res) => {
  const matchesCount = Array.isArray(MATCHES) ? MATCHES.length : -1;
  const namesCount = Array.isArray(NAME_CACHE) ? NAME_CACHE.length : -1;
  const sampleNames = (Array.isArray(NAME_CACHE) ? NAME_CACHE.slice(0, 5) : []);
  res.json({
    ok: true,
    matches: matchesCount,
    names: namesCount,
    sampleNames,
    typeofMatches: typeof MATCHES,
    typeofNames: typeof NAME_CACHE,
  });
});
app.get("/api/debug/tournaments", async (_req, res) => {
  await ensureData();
  const tournaments = Array.from(new Set(MATCHES.map(m => m.tournament?.name ?? "Desconocido")));
  res.json({
    ok: true,
    total: tournaments.length,
    tournaments: tournaments.slice(0, 50), // por si son muchos
  });
});


// Forzar refresh (descarga + reconstruye índice)
app.post("/api/refresh", async (_req, res) => {
  try {
    await ensureData({ forceDownload: true });
    res.json({ ok: true, matches: MATCHES.length, names: NAME_CACHE.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/search-players", async (req, res) => {
  await ensureData();

  const q = (req.query.q ?? "").toString().trim();
  const qn = norm(q);

  if (!q) {
    return res.json({ ok: true, players: NAME_CACHE.slice(0, 20) });
  }

  // 1) intenta remoto y FILTRA SIEMPRE por el texto
  try {
    const remote = await searchPlayersAny(q);
    const remoteFiltered = (remote || []).filter(p => norm(p.name).includes(qn));
    if (remoteFiltered.length) {
      return res.json({ ok: true, players: remoteFiltered.slice(0, 20) });
    }
  } catch {
    // seguimos con fallback
  }

  // 2) fallback: índice local
  const local = NAME_CACHE
    .filter(p => norm(p.name).includes(qn))
    .slice(0, 20);
  return res.json({ ok: true, players: local });
});


// Predicción: /api/predict?A1=88&A2=87&B1=115&B2=114
app.get("/api/predict", async (req, res) => {
  try {
    await ensureData();
    const { A1, A2, B1, B2 } = req.query;
    if (!A1 || !A2 || !B1 || !B2) {
      return res
        .status(400)
        .json({ ok: false, error: "Faltan parámetros A1,A2,B1,B2" });
    }
    const { probA, details } = predictSimple(
      STATS,
      String(A1),
      String(A2),
      String(B1),
      String(B2)
    );
    res.json({
      ok: true,
      input: { A1, A2, B1, B2 },
      probA: Number((probA * 100).toFixed(1)),
      details,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Debug: Apariciones de un ID
app.get("/api/debug/has-id/:id", (req, res) => {
  const { id } = req.params;
  const appearances = MATCHES.reduce(
    (count, match) =>
      count + [match.A1, match.A2, match.B1, match.B2].filter((p) => p === id).length,
    0
  );
  res.json({ id, appearances });
});

// -------------------- Start --------------------
const PORT = process.env.PORT ?? 3001;
app.listen(PORT, async () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
  try {
    await ensureData(); // precarga al arrancar
  } catch (e) {
    console.error("No se pudo precargar:", e.message);
  }
});

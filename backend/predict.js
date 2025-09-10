// predict.js
import { downloadAllMatches, loadCachedMatches } from "./api.js";
import { buildStats, predictSimple } from "./prob_simple.js";

function usage() {
  console.log(`
Uso:
  1) Descargar y guardar histórico (rápido por defecto):
     node predict.js --download           # rápido
     node predict.js --download --full    # completo (más lento)

  2) Predecir un duelo (IDs de jugador):
     node predict.js A1 A2 B1 B2

Ejemplo:
     node predict.js 111 222 333 444
`);
}

async function ensureData(opts) {
  let matches = await loadCachedMatches();
  if (matches.length === 0) {
    console.log("No hay cache. Descargando histórico...");
    matches = await downloadAllMatches(opts);
  }
  return matches;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--download")) {
    const full = args.includes("--full");
    await downloadAllMatches({ fast: !full });
    return;
  }

  // Predicción
  const onlyIds = args.filter(a => !a.startsWith("--"));
  if (onlyIds.length !== 4) {
    usage();
    return;
  }
  const [A1, A2, B1, B2] = onlyIds;

  // por defecto modo rápido; usa --full si quieres insistir con detalles de partidos no mapeables
  const full = args.includes("--full");
  const matches = await ensureData({ fast: !full });

  if (matches.length === 0) {
    console.log("No hay partidos en el histórico (cache vacío). Prueba 'node predict.js --download --full'.");
    return;
  }

  const stats = buildStats(matches);
  const { probA, details } = predictSimple(stats, A1, A2, B1, B2);

  console.log("=== Resultado (basado en victorias/derrotas) ===");
  console.log(`Probabilidad de que gane A (A1+A2): ${(probA * 100).toFixed(1)}%`);
  if (details.h2h.n > 0) {
    console.log(`H2H directo: n=${details.h2h.n}, pA=${(details.h2h.p*100).toFixed(1)}%`);
  } else {
    console.log("H2H directo: sin enfrentamientos registrados");
  }
  console.log(`Parejas: partidos A=${details.pair.A.n}, B=${details.pair.B.n}, p_pair=${(details.pair.p_pair*100).toFixed(1)}%`);
  console.log(`Jugadores: p_players=${(details.players.p_players*100).toFixed(1)}%`);
  console.log(`Pesos: w_h2h=${details.weights.w_h2h.toFixed(2)}, w_pair=${details.weights.w_pair.toFixed(2)}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});

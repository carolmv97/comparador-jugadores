// prob_simple.js
// Probabilidad basada en victorias/derrotas (parejas y H2H) con suavizado y mezcla por tamaño de muestra.

function keyPair(a, b) {
  return [String(a), String(b)].sort().join("__");
}

// Logit helpers
const clamp = (x, lo=1e-6, hi=1-1e-6)=> Math.max(lo, Math.min(hi, x));
const logit = p => Math.log(clamp(p) / clamp(1 - p));
const invlogit = z => 1 / (1 + Math.exp(-z));

export function buildStats(matches) {
  const pairWL = new Map();           // pairKey -> {w,l,n}
  const playerWL = new Map();         // playerId -> {w,l,n}
  const h2h = new Map();              // 'pairA||pairB' (ordenadas) -> {Akey,Bkey, AwinsOverB, BwinsOverA, n}

  const inc = (map, k, field, by=1) => {
    const obj = map.get(k) ?? { w:0, l:0, n:0 };
    obj[field] += by; obj.n += by;
    map.set(k, obj);
  };

  for (const m of matches) {
    const Akey = keyPair(m.A1, m.A2);
    const Bkey = keyPair(m.B1, m.B2);
    const aWon = m.winner === "A";

    // parejas global
    if (aWon) { inc(pairWL, Akey, "w"); inc(pairWL, Bkey, "l"); }
    else      { inc(pairWL, Bkey, "w"); inc(pairWL, Akey, "l"); }

    // jugadores global
    for (const id of [m.A1, m.A2, m.B1, m.B2]) {
      const obj = playerWL.get(id) ?? { w:0, l:0, n:0 };
      playerWL.set(id, obj);
    }
    if (aWon) {
      playerWL.get(m.A1).w++; playerWL.get(m.A2).w++;
      playerWL.get(m.B1).l++; playerWL.get(m.B2).l++;
      playerWL.get(m.A1).n++; playerWL.get(m.A2).n++;
      playerWL.get(m.B1).n++; playerWL.get(m.B2).n++;
    } else {
      playerWL.get(m.B1).w++; playerWL.get(m.B2).w++;
      playerWL.get(m.A1).l++; playerWL.get(m.A2).l++;
      playerWL.get(m.A1).n++; playerWL.get(m.A2).n++;
      playerWL.get(m.B1).n++; playerWL.get(m.B2).n++;
    }

    // head-to-head
    const [K1, K2] = [Akey, Bkey].sort();
    const Hkey = `${K1}||${K2}`;
    const rec = h2h.get(Hkey) ?? { Akey: K1, Bkey: K2, AwinsOverB: 0, BwinsOverA: 0, n: 0 };
    if (Akey === K1) {
      // partido registrado como K1 vs K2
      if (aWon) rec.AwinsOverB++; else rec.BwinsOverA++;
    } else {
      // invertido
      if (aWon) rec.BwinsOverA++; else rec.AwinsOverB++;
    }
    rec.n++;
    h2h.set(Hkey, rec);
  }

  return { pairWL, playerWL, h2h };
}

// Calcula probabilidad A (A1,A2) vs B (B1,B2)
export function predictSimple(stats, A1, A2, B1, B2, alpha=1) {
  const Akey = keyPair(A1, A2);
  const Bkey = keyPair(B1, B2);

  // 1) H2H directo
  const Hkey = [Akey, Bkey].sort().join("||");
  const rec = stats.h2h.get(Hkey);
  let p_h2h = null, n_h2h = 0;
  if (rec) {
    if (Akey === rec.Akey) {
      p_h2h = (rec.AwinsOverB + alpha) / (rec.n + 2*alpha);
    } else {
      p_h2h = (rec.BwinsOverA + alpha) / (rec.n + 2*alpha);
    }
    n_h2h = rec.n;
  }

  // 2) Win rate global de las parejas
  const Awl = stats.pairWL.get(Akey) ?? {w:0,l:0,n:0};
  const Bwl = stats.pairWL.get(Bkey) ?? {w:0,l:0,n:0};
  const pA_pair = (Awl.w + alpha) / (Awl.w + Awl.l + 2*alpha);
  const pB_pair = (Bwl.w + alpha) / (Bwl.w + Bwl.l + 2*alpha);
  // Convertimos a un "cara a cara implícito": p = pA / (pA + pB)
  const p_pair = (pA_pair + 1e-9) / (pA_pair + pB_pair + 2e-9);

  // 3) Win rate de jugadores (promedio en logit)
  const pj = (id) => {
    const o = stats.playerWL.get(String(id)) ?? {w:0,l:0,n:0};
    return (o.w + alpha) / (o.w + o.l + 2*alpha);
  };
  const zA = 0.5*(logit(pj(A1)) + logit(pj(A2)));
  const zB = 0.5*(logit(pj(B1)) + logit(pj(B2)));
  const p_players = invlogit(zA - zB); // ventaja "promedio" de jugadores

  // 4) Mezcla por tamaños de muestra
  const w_h2h = 1 - Math.exp(-n_h2h / 5); // crece con enfrentamientos directos
  const n_pair_min = Math.min(Awl.n, Bwl.n);
  const w_pair = 1 - Math.exp(-n_pair_min / 20); // crece con partidos de la pareja

  const blended_no_h2h = w_pair * p_pair + (1 - w_pair) * p_players;
  const P = (p_h2h != null)
    ? w_h2h * p_h2h + (1 - w_h2h) * blended_no_h2h
    : blended_no_h2h;

  return {
    probA: P,
    details: {
      h2h: { p: p_h2h, n: n_h2h },
      pair: { A: Awl, B: Bwl, p_pair },
      players: {
        A1: { id: String(A1), p: pj(A1) },
        A2: { id: String(A2), p: pj(A2) },
        B1: { id: String(B1), p: pj(B1) },
        B2: { id: String(B2), p: pj(B2) },
        p_players
      },
      weights: { w_h2h, w_pair }
    }
  };
}

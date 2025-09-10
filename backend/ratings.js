// ratings.js
const R0 = 1500; // rating inicial
const SCALE = 400;

function logistic(puntosDiff) {
  return 1 / (1 + Math.pow(10, -puntosDiff / SCALE));
}

function synergyBonus(matchesTogether, s = 12) {
  return s * Math.log(1 + matchesTogether);
}

function kDecay(daysAgo, Kbase = 24, tau = 180) {
  return Kbase * Math.exp(-daysAgo / tau);
}

export class PadelElo {
  constructor(now = new Date()) {
    this.now = now;
    this.ratings = new Map();       // rating por jugador
    this.pairCounts = new Map();    // cuántos partidos ha jugado una pareja junta
  }

  #getR(id) { return this.ratings.get(id) ?? R0; }
  #duoR(a, b) { return this.#getR(a) + this.#getR(b); }
  #pairKey(a,b) { return [a,b].sort().join("__"); }
  #daysAgo(dateISO) {
    return Math.max(0, (this.now - new Date(dateISO)) / (1000*3600*24));
  }

  predict(A1, A2, B1, B2) {
    const RA = this.#duoR(A1,A2), RB = this.#duoR(B1,B2);
    const SA = synergyBonus(this.pairCounts.get(this.#pairKey(A1,A2)) ?? 0);
    const SB = synergyBonus(this.pairCounts.get(this.#pairKey(B1,B2)) ?? 0);
    const diff = (RA + SA) - (RB + SB);
    return { P_A_wins: logistic(diff), RA, RB, SA, SB, diff };
  }

  update(match) {
    const { date, A1,A2,B1,B2, winner } = match;
    const days = this.#daysAgo(date);
    const K = kDecay(days);

    const pred = this.predict(A1,A2,B1,B2).P_A_wins;
    const scoreA = winner === "A" ? 1 : 0;
    const delta = K * (scoreA - pred);

    this.ratings.set(A1, this.#getR(A1) + delta/2);
    this.ratings.set(A2, this.#getR(A2) + delta/2);
    this.ratings.set(B1, this.#getR(B1) - delta/2);
    this.ratings.set(B2, this.#getR(B2) - delta/2);

    this.pairCounts.set(this.#pairKey(A1,A2), (this.pairCounts.get(this.#pairKey(A1,A2)) ?? 0) + 1);
    this.pairCounts.set(this.#pairKey(B1,B2), (this.pairCounts.get(this.#pairKey(B1,B2)) ?? 0) + 1);
  }

  fit(matches) {
    const sorted = [...matches].sort((a,b)=> new Date(a.date) - new Date(b.date));
    for (const m of sorted) this.update(m);
  }
}

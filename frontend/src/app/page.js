"use client";
import { useMemo, useState } from "react";
import PlayerPicker from "../components/PlayerPicker";

export default function Home() {
  const API = process.env.NEXT_PUBLIC_API_BASE;

  const [A1, setA1] = useState(null);
  const [A2, setA2] = useState(null);
  const [B1, setB1] = useState(null);
  const [B2, setB2] = useState(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const canPredict = A1?.id && A2?.id && B1?.id && B2?.id;

  // 👉 Solo mostramos "Detalles del cálculo" si hay algún dato numérico real
  const hasBreakdown = useMemo(() => {
    const d = result?.details;
    const v1 = typeof d?.h2h?.pA === "number" && !Number.isNaN(d.h2h.pA);
    const v2 = typeof d?.pair?.pA === "number" && !Number.isNaN(d.pair.pA);
    const v3 = typeof d?.players?.pA === "number" && !Number.isNaN(d.players.pA);
    return Boolean(v1 || v2 || v3);
  }, [result]);

  async function handlePredict() {
    if (!canPredict || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const url = new URL(`${API}/api/predict`);
      url.searchParams.set("A1", A1.id);
      url.searchParams.set("A2", A2.id);
      url.searchParams.set("B1", B1.id);
      url.searchParams.set("B2", B2.id);
      const res = await fetch(url.toString());
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-bold mb-1">Predictor de Pádel</h1>
      <p className="text-sm opacity-70 mb-8">
        API: <code>{API}</code>
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Dupla A">
          <div className="grid gap-4">
            <PlayerPicker label="A1" apiBase={API} onSelect={setA1} />
            <PlayerPicker label="A2" apiBase={API} onSelect={setA2} />
          </div>
          <SelectedRow a={A1} b={A2} />
        </Card>

        <Card title="Dupla B">
          <div className="grid gap-4">
            <PlayerPicker label="B1" apiBase={API} onSelect={setB1} />
            <PlayerPicker label="B2" apiBase={API} onSelect={setB2} />
          </div>
          <SelectedRow a={B1} b={B2} />
        </Card>
      </div>

      <div className="mt-8">
        <button
          onClick={handlePredict}
          disabled={!canPredict || loading}
          className={`px-6 py-3 rounded-2xl font-medium transition shadow-sm
          ${canPredict && !loading
              ? "bg-black text-white hover:opacity-90"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"}`}
        >
          {loading ? "Calculando…" : "Calcular predicción"}
        </button>
      </div>

      {result && (
        <div className="mt-8 rounded-2xl border border-gray-200 p-6 bg-white">
          <h3 className="font-semibold mb-3">Resultado</h3>

          {result.ok ? (
            <>
              <ResultBar probA={result.probA} />

              <div className="mt-4 text-sm">
                <h4 className="font-medium mb-2">Duplas enfrentadas:</h4>
                <ul className="space-y-1">
                  <li>
                    <b>Dupla A:</b> {A1?.name} & {A2?.name}
                  </li>
                  <li>
                    <b>Dupla B:</b> {B1?.name} & {B2?.name}
                  </li>
                </ul>
              </div>

              {/* 👇 Solo se muestra si hay desglose real */}
              {hasBreakdown && (
                <div className="mt-4 text-xs text-gray-500">
                  <h4 className="font-medium mb-1">Detalles del cálculo</h4>
                  {typeof result.details?.h2h?.pA === "number" && (
                    <p>H2H directo: {result.details.h2h.pA.toFixed(1)}%</p>
                  )}
                  {typeof result.details?.pair?.pA === "number" && (
                    <p>Parejas: {result.details.pair.pA.toFixed(1)}%</p>
                  )}
                  {typeof result.details?.players?.pA === "number" && (
                    <p>Jugadores: {result.details.players.pA.toFixed(1)}%</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-red-600">Error: {result.error}</p>
          )}
        </div>
      )}
    </main>
  );
}

/* ---------- UI helpers ---------- */

function Card({ title, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4 bg-white">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function SelectedRow({ a, b }) {
  if (!a && !b) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {a && <Chip label={a.name} id={a.id} />}
      {b && <Chip label={b.name} id={b.id} />}
    </div>
  );
}

function Chip({ label, id }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm rounded-xl border border-gray-200 bg-gray-50 px-3 py-1">
      <span className="font-medium">{label}</span>
      <span className="text-[11px] px-1.5 py-0.5 rounded bg-white border">id {id}</span>
    </span>
  );
}

function ResultBar({ probA }) {
  const pct = Math.max(0, Math.min(100, Number(probA ?? 0)));
  const pctB = 100 - pct;
  const colorA = pct >= 50 ? "bg-emerald-500" : "bg-gray-300";
  const colorB = pct < 50 ? "bg-rose-500" : "bg-gray-300";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium">
          Prob. de victoria de <b>Dupla A</b>
        </div>
        <div className="text-lg font-semibold tabular-nums">
          {pct.toFixed(1)}%
        </div>
      </div>
      <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden flex">
        <div className={`${colorA} h-full`} style={{ width: `${pct}%` }} />
        <div className={`${colorB} h-full`} style={{ width: `${pctB}%` }} />
      </div>
      <div className="mt-1 text-xs opacity-70">
        A más verde → mayor ventaja para A.
      </div>
    </div>
  );
}

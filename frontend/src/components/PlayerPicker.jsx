"use client";
import { useEffect, useRef, useState } from "react";

export default function PlayerPicker({ label, onSelect, apiBase }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);

  const inputRef = useRef(null); // 👈 referencia al input
  const debouncedQ = useDebounce(q, 300);

  useEffect(() => {
    if (!debouncedQ) {
      setResults([]);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${apiBase}/api/search-players?q=${encodeURIComponent(debouncedQ)}`
        );
        const data = await res.json();
        if (!cancel) setResults(data.players ?? []);
      } catch {
        if (!cancel) setResults([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [debouncedQ, apiBase]);

  function handlePick(p) {
    setPicked(p);
    setResults([]);       // cierra lista
    setQ("");             // 👈 limpia input
    onSelect?.(p);        // devuelve jugador al padre
    inputRef.current?.blur(); // quita foco (opcional)
  }

  return (
    <div className="w-full">
      <div className="text-xs font-medium mb-1 opacity-70">{label}</div>
      <div className="relative">
        <input
          ref={inputRef} // 👈 conecta el ref
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPicked(null);
            onSelect?.(null);
          }}
          placeholder="Busca jugador… (ej. lebron)"
          className="w-full rounded-xl border border-gray-200 px-3 py-2 outline-none
                     focus:ring-2 focus:ring-black/10 focus:border-gray-300 transition"
        />
        {loading && (
          <div className="absolute right-3 top-2.5 h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
        )}
      </div>

      {results.length > 0 && (
        <ul className="mt-2 max-h-56 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {results.map((p) => (
            <li
              key={p.id}
              className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
              onMouseDown={(e) => e.preventDefault()} // evita perder el click por blur
              onClick={() => handlePick(p)}
            >
              <span>{p.name}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                id {p.id}
              </span>
            </li>
          ))}
        </ul>
      )}

      {picked && (
        <div className="text-xs mt-2 text-gray-600">
          Seleccionado: <b className="text-gray-900">{picked.name}</b>{" "}
          <span className="ml-1 px-1.5 py-0.5 rounded-md bg-gray-100">id {picked.id}</span>
        </div>
      )}
    </div>
  );
}

function useDebounce(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

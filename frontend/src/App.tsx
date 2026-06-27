import { useState } from "react";
import { Classificacao } from "./screens/Classificacao";
import { Partidas } from "./screens/Partidas";
import { Grupos } from "./screens/Grupos";
import { Jogadores } from "./screens/Jogadores";

type Aba = "classificacao" | "partidas" | "grupos" | "jogadores";

const ABAS: { id: Aba; label: string }[] = [
  { id: "classificacao", label: "Classificação" },
  { id: "partidas", label: "Partidas" },
  { id: "grupos", label: "Grupos" },
  { id: "jogadores", label: "Jogadores" },
];

export default function App() {
  const [aba, setAba] = useState<Aba>("classificacao");

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="10" cy="9" r="6.5" fill="currentColor" opacity="0.85" />
            <rect
              x="13.5"
              y="13"
              width="3"
              height="8"
              rx="1.5"
              transform="rotate(-45 13.5 13)"
              fill="currentColor"
            />
            <circle cx="10" cy="9" r="2" fill="#0a0e17" />
          </svg>
        </span>
        <span className="brand">
          Pingas <span className="accent">iFractal</span>
        </span>
      </header>

      <nav className="tabs" role="tablist" aria-label="Seções">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            className="tab"
            onClick={() => setAba(a.id)}
          >
            {a.label}
          </button>
        ))}
      </nav>

      {/* key força remontar ao trocar de aba => recarrega dados (e o modo) frescos */}
      {aba === "classificacao" && <Classificacao key="c" />}
      {aba === "partidas" && <Partidas key="p" />}
      {aba === "grupos" && <Grupos key="g" />}
      {aba === "jogadores" && <Jogadores key="j" />}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Trophy, Swords, Users, Crown, User, Settings, Menu } from "lucide-react";
import { api, type Modo } from "./api";
import { Classificacao } from "./pages/Classificacao";
import { Partidas } from "./pages/Partidas";
import { Grupos } from "./pages/Grupos";
import { MataMata } from "./pages/MataMata";
import { Jogadores } from "./pages/Jogadores";
import { Configuracoes } from "./pages/Configuracoes";

type Aba = "classificacao" | "mata" | "grupos" | "partidas" | "jogadores" | "config";

// ordem das abas de navegação (Configurações NÃO entra aqui: virou engrenagem no topo).
// testId = id estável p/ automação (Appium), desacoplado do label visível.
// soGrupos = aba só habilitada quando a fase de grupos está ativa.
const ABAS: { id: Aba; label: string; testId: string; Icon: typeof Trophy; soGrupos?: boolean }[] = [
  { id: "classificacao", label: "Classificação", testId: "nav-classificacao", Icon: Trophy },
  { id: "mata", label: "Mata-Mata", testId: "nav-mata", Icon: Crown, soGrupos: true },
  { id: "partidas", label: "Fase de Grupos", testId: "nav-partidas", Icon: Swords },
  { id: "grupos", label: "Grupos", testId: "nav-grupos", Icon: Users, soGrupos: true },
  { id: "jogadores", label: "Jogadores", testId: "nav-jogadores", Icon: User },
];

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10" cy="9" r="6.5" fill="currentColor" opacity="0.85" />
      <rect x="13.5" y="13" width="3" height="8" rx="1.5" transform="rotate(-45 13.5 13)" fill="currentColor" />
      <circle cx="10" cy="9" r="2" fill="#0a0e17" />
    </svg>
  );
}

export default function App() {
  const [aba, setAba] = useState<Aba>("classificacao");
  const [menu, setMenu] = useState(false);
  const [modo, setModo] = useState<Modo>("pontos_corridos");

  // descobre o modo no início (pra liberar/travar Grupos e Mata-mata)
  useEffect(() => {
    api.lerConfig().then((cfg) => setModo(cfg.modo)).catch(() => {});
  }, []);

  // se a aba atual depende de grupos e o modo não é grupos, volta pra Classificação
  useEffect(() => {
    if (modo !== "grupos" && (aba === "grupos" || aba === "mata")) {
      setAba("classificacao");
    }
  }, [modo, aba]);

  const liberada = (item: (typeof ABAS)[number]) => !item.soGrupos || modo === "grupos";

  const ir = (id: Aba) => {
    setAba(id);
    setMenu(false);
  };

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="hamburger"
          aria-label="Abrir menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
        >
          <Menu size={20} />
        </button>
        <span className="logo" aria-hidden>
          <Logo />
        </span>
        <span className="brand">
          Pingas <span className="accent">iFractal</span>
        </span>

        <span className="usuario">
          <User size={16} /> Niza
        </span>

        {/* Configurações agora é um ícone no topo (não mais uma aba). */}
        <button
          className={`icone-config ${aba === "config" ? "ativo" : ""}`}
          data-testid="nav-config"
          aria-label="Configurações"
          aria-current={aba === "config" ? "page" : undefined}
          title="Configurações"
          onClick={() => ir("config")}
        >
          <Settings size={20} />
        </button>
      </header>

      <div className="shell">
        <nav className={`sidebar ${menu ? "aberto" : ""}`} aria-label="Seções">
          {ABAS.map((item) => {
            const habilitada = liberada(item);
            return (
              <button
                key={item.id}
                className={`navlink ${aba === item.id ? "ativo" : ""}`}
                data-testid={item.testId}
                disabled={!habilitada}
                title={habilitada ? undefined : "Ative a fase de grupos em Configurações"}
                aria-current={aba === item.id ? "page" : undefined}
                onClick={() => habilitada && ir(item.id)}
              >
                <item.Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* key força remontar ao trocar de aba => recarrega dados frescos */}
        <main className="conteudo">
          {aba === "classificacao" && <Classificacao key="c" />}
          {aba === "partidas" && <Partidas key="p" />}
          {aba === "grupos" && <Grupos key="g" />}
          {aba === "mata" && <MataMata key="m" />}
          {aba === "jogadores" && <Jogadores key="j" />}
          {aba === "config" && <Configuracoes key="cfg" onModoChange={setModo} />}
        </main>
      </div>
    </div>
  );
}
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trophy, Swords, Users, Crown, User, Settings, Menu, Radio, LayoutDashboard } from "lucide-react";
import { api, type Modo } from "./api";
import { VisaoGeral } from "./pages/VisaoGeral";
import { Classificacao } from "./pages/Classificacao";
import { Partidas } from "./pages/Partidas";
import { Grupos } from "./pages/Grupos";
import { MataMata } from "./pages/MataMata";
import { Jogadores } from "./pages/Jogadores";
import { Configuracoes } from "./pages/Configuracoes";
import { AoVivoProvider, useAoVivo } from "./AoVivoProvider";
import { PartidaFullscreen } from "./components/PartidaFullscreen";
import { SeletorAoVivo } from "./SeletorAoVivo";
import { TemaProvider } from "./TemaProvider";

type Aba = "visao" | "classificacao" | "mata" | "grupos" | "partidas" | "jogadores" | "config";

// ordem das abas de navegação (Configurações NÃO entra aqui: virou engrenagem no topo).
// testId = id estável p/ automação (Appium), desacoplado do label visível.
// soGrupos = aba só habilitada quando a fase de grupos está ativa.
const ABAS: { id: Aba; label: string; testId: string; Icon: typeof Trophy; soGrupos?: boolean }[] = [
  { id: "visao", label: "Visão geral", testId: "nav-visao", Icon: LayoutDashboard },
  { id: "classificacao", label: "Classificação", testId: "nav-classificacao", Icon: Trophy },
  { id: "mata", label: "Mata-Mata", testId: "nav-mata", Icon: Crown, soGrupos: true },
  { id: "partidas", label: "Partidas", testId: "nav-partidas", Icon: Swords },
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

// Botao "Ao vivo" do topbar: acende quando ha >= 1 partida em andamento e abre
// o seletor. Fica desabilitado quando nao ha nenhuma (o "habilitado quando uma
// partida se inicia" que a gente combinou).
function BotaoAoVivoTopo({ onAbrirSeletor }: { onAbrirSeletor: () => void }) {
  const { disponiveis } = useAoVivo();
  // some quando nao ha nenhuma partida pra marcar (igual o botao do card, que
  // so aparece quando da pra jogar). Mesmo visual do card: .btn.ghost + Radio.
  if (disponiveis.length === 0) return null;
  return (
    <button
      className="btn ghost btn-ao-vivo-topo"
      data-testid="btn-ao-vivo-topo"
      onClick={onAbrirSeletor}
      title="Abrir placar ao vivo"
      aria-label="Partidas ao vivo"
    >
      <Radio size={15} /> Ao vivo
    </button>
  );
}

function AppInner() {
  const [aba, setAba] = useState<Aba>("classificacao");
  const [menu, setMenu] = useState(false);
  const [modo, setModo] = useState<Modo>("pontos_corridos");
  const [seletorAberto, setSeletorAberto] = useState(false);

  const { partidaAoVivo, recarregar } = useAoVivo();

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

  const abrirSeletor = () => {
    recarregar();          // garante a lista de "em andamento" fresca ao abrir
    setSeletorAberto(true);
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

        {/* botao ao vivo: perto do usuario, retoma partida em andamento */}
        <BotaoAoVivoTopo onAbrirSeletor={abrirSeletor} />

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
          {aba === "visao" && <VisaoGeral key="v" />}
          {aba === "classificacao" && <Classificacao key="c" />}
          {aba === "partidas" && <Partidas key="p" />}
          {aba === "grupos" && <Grupos key="g" />}
          {aba === "mata" && <MataMata key="m" />}
          {aba === "jogadores" && <Jogadores key="j" />}
          {aba === "config" && <Configuracoes key="cfg" onModoChange={setModo} />}
        </main>
      </div>

      {/* Modo ao vivo e seletor: renderizados UMA vez aqui no App (nao mais nas
          paginas), via portal pro body — assim abrem de qualquer aba. */}
      {seletorAberto && <SeletorAoVivo onFechar={() => setSeletorAberto(false)} />}
      {partidaAoVivo &&
        createPortal(<PartidaFullscreen key={partidaAoVivo.id} />, document.body)}
    </div>
  );
}

export default function App() {
  return (
    <TemaProvider>
      <AoVivoProvider>
        <AppInner />
      </AoVivoProvider>
    </TemaProvider>
  );
}

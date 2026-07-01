import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, type Jogador, type Partida, type Modo } from "../api";
import { PartidaCard } from "../components/PartidaCard";

const GRUPOS = ["A", "B", "C", "D"];

// raquete (mesmo desenho do logo) — usada no botao Gerar
function Raquete({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10" cy="9" r="6.5" fill="currentColor" opacity="0.9" />
      <rect x="13.5" y="13" width="3" height="8" rx="1.5" transform="rotate(-45 13.5 13)" fill="currentColor" />
    </svg>
  );
}

export function Partidas() {
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [modo, setModo] = useState<Modo>("pontos_corridos");
  const [modoEf, setModoEf] = useState<Modo>("pontos_corridos");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  function recarregar() {
    Promise.all([api.listarJogadores(), api.listarPartidas(), api.lerConfig()])
      .then(([js, ps, cfg]) => {
        setJogadores(js);
        setPartidas(ps);
        setModo(cfg.modo);
        setModoEf(cfg.modo_efetivo);
      })
      .catch((e) => setErro(e.message));
  }

  useEffect(() => {
    const ac = new AbortController();
    let tentativas = 0;
    async function carregar() {
      if (ac.signal.aborted) return;
      try {
        const [js, ps, cfg] = await Promise.all([
          api.listarJogadores(ac.signal),
          api.listarPartidas(ac.signal),
          api.lerConfig(ac.signal),
        ]);
        setJogadores(js);
        setPartidas(ps);
        setModo(cfg.modo);
        setModoEf(cfg.modo_efetivo);
        setErro("");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (tentativas++ < 2) {
          setTimeout(carregar, 500);
          return;
        }
        setErro((e as Error).message);
      }
    }
    carregar();
    return () => ac.abort();
  }, []);

  const nomeDe = (id: number) => jogadores.find((j) => j.id === id)?.nome ?? "?";
  const grupoDe = (id: number) => jogadores.find((j) => j.id === id)?.grupo ?? null;
  const grupoDaPartida = (p: Partida) => {
    const ga = grupoDe(p.jogador_a_id);
    const gb = grupoDe(p.jogador_b_id);
    return ga && ga === gb ? ga : null;
  };

  // esta tela cuida SO da fase de grupos; mata-mata tem aba propria
  const partidasGrupos = partidas.filter((p) => p.fase === "grupos");

  async function gerarConfrontos() {
    setErro("");
    setOcupado(true);
    try {
      const chave = (x: number, y: number) => [x, y].sort((a, b) => a - b).join("-");
      const existe = new Set(partidasGrupos.map((p) => chave(p.jogador_a_id, p.jogador_b_id)));
      for (let i = 0; i < jogadores.length; i++) {
        for (let k = i + 1; k < jogadores.length; k++) {
          const ja = jogadores[i];
          const jb = jogadores[k];
          if (modo === "grupos" && (!ja.grupo || ja.grupo !== jb.grupo)) continue;
          if (!existe.has(chave(ja.id, jb.id))) {
            await api.criarPartida(ja.id, jb.id);
          }
        }
      }
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  // apagar partida individual: so faz sentido no pontos corridos.
  // na fase de grupos, remover um confronto isolado deixa o grupo incompleto
  // (o "todos contra todos" quebra), por isso a lixeira nem aparece la (ver cardDe).
  async function apagar(p: Partida) {
    const ok = window.confirm(
      `Apagar a partida ${nomeDe(p.jogador_a_id)} x ${nomeDe(p.jogador_b_id)}?`
    );
    if (!ok) return;
    setErro("");
    try {
      await api.deletarPartida(p.id);
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function limparTudo() {
    const ok = window.confirm(
      `Apagar TODAS as partidas? (jogadores e grupos são mantidos)`
    );
    if (!ok) return;
    setErro("");
    try {
      await api.limparPartidas();
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const ehGrupos = modoEf === "grupos";
  const fallbackGrupos = modo === "grupos" && modoEf !== "grupos";
  const podeGerar = ehGrupos || jogadores.length >= 2;

  // lixeira individual so no pontos corridos: em grupos, onApagar vai undefined
  // e o PartidaCard esconde a lixeira sozinho (Editar fica centralizado).
  const cardDe = (p: Partida) => (
    <PartidaCard
      key={p.id}
      partida={p}
      nomeDe={nomeDe}
      onMudou={recarregar}
      onErro={setErro}
      onLimparErro={() => setErro("")}
      onApagar={ehGrupos ? undefined : apagar}
    />
  );

  return (
    <section className="card">
      <h2 className="card-title">
        Partidas {ehGrupos ? "· fase de grupos" : "· pontos corridos"}
      </h2>

      {fallbackGrupos && (
        <p className="aviso">
          Fase de grupos selecionada, mas o campeonato está rodando em{" "}
          <strong>Pontos Corridos</strong>: todos os grupos devem possuir pelo menos
          2 jogadores para iniciar a fase de grupos.
        </p>
      )}

      <div className="row">
        <button
          className="btn"
          onClick={gerarConfrontos}
          disabled={!podeGerar || ocupado}
          title="Cria todos os confrontos que ainda faltam, sem duplicar os existentes"
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <Raquete />
          {ocupado
            ? "Gerando…"
            : ehGrupos
            ? "Gerar confrontos dos grupos"
            : "Gerar confrontos (todos contra todos)"}
        </button>
        {partidasGrupos.length > 0 && (
          <button
            className="btn ghost"
            style={{ color: "var(--loss)", display: "inline-flex", alignItems: "center", gap: 8 }}
            onClick={limparTudo}
            disabled={ocupado}
            title="Apaga TODAS as partidas (mantém jogadores e grupos)"
          >
            <Trash2 size={16} />
            Limpar todas as partidas
          </button>
        )}
      </div>
      {!podeGerar && (
        <p className="vazio">
          {ehGrupos
            ? "Monte grupos com pelo menos 2 jogadores (aba Grupos) para gerar partidas."
            : "Cadastre pelo menos 2 jogadores para gerar partidas."}
        </p>
      )}

      {erro && <p className="erro">{erro}</p>}

      {partidasGrupos.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {ehGrupos ? (
            <>
              {GRUPOS.map((g) => {
                const lista = partidasGrupos.filter((p) => grupoDaPartida(p) === g);
                if (lista.length === 0) return null;
                return (
                  <div key={g} style={{ marginTop: 18 }}>
                    <div className="card-title" style={{ marginBottom: 8 }}>Grupo {g}</div>
                    <div className="lista">{lista.map(cardDe)}</div>
                  </div>
                );
              })}
              {(() => {
                const outras = partidasGrupos.filter((p) => grupoDaPartida(p) === null);
                if (outras.length === 0) return null;
                return (
                  <div style={{ marginTop: 18 }}>
                    <div className="card-title" style={{ marginBottom: 8 }}>Outras (entre grupos)</div>
                    <div className="lista">{outras.map(cardDe)}</div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="lista">{partidasGrupos.map(cardDe)}</div>
          )}
        </div>
      )}
    </section>
  );
}
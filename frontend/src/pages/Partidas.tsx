import { useEffect, useState } from "react";
import { api, type Jogador, type Partida, type Modo } from "../api";
import { PartidaCard } from "../components/PartidaCard";
import { useAoVivo } from "../AoVivoProvider";

const GRUPOS = ["A", "B", "C", "D"];

function Raquete({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10" cy="9" r="6.5" fill="currentColor" opacity="0.9" />
      <rect x="13.5" y="13" width="3" height="8" rx="1.5" transform="rotate(-45 13.5 13)" fill="currentColor" />
    </svg>
  );
}

/** true quando a viewport esta em largura de mobile (<= 600px). Reativo a
 *  rotacao/resize. Usado pra ligar o "toque no card abre o ao vivo" so no
 *  mobile — no desktop o card mantem os controles inline normais. */
function useIsMobile(maxWidth = 600) {
  const query = `(max-width: ${maxWidth}px)`;
  const [is, setIs] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setIs(mq.matches);
    mq.addEventListener("change", on);
    setIs(mq.matches);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return is;
}

/**
 * Ordena os confrontos de um round-robin pelo metodo do circulo, pra a lista
 * sair INTERCALADA em vez da ordem ingenua do laco aninhado. So a ordem de
 * geracao: nao cria rodadas, nao usa `rodada`, nao toca no backend. Pura.
 */
function ordenarConfrontosCirculo(jogadores: Jogador[]): [Jogador, Jogador][] {
  if (jogadores.length < 2) return [];
  const ordem = new Map(jogadores.map((j, i) => [j.id, i]));
  const roda: (Jogador | null)[] = [...jogadores];
  if (roda.length % 2 === 1) roda.push(null);
  const n = roda.length;
  const metade = n / 2;
  const fixo = roda[0];
  let giro = roda.slice(1);
  const pares: [Jogador, Jogador][] = [];
  for (let r = 0; r < n - 1; r++) {
    const linha = [fixo, ...giro];
    for (let i = 0; i < metade; i++) {
      const a = linha[i];
      const b = linha[n - 1 - i];
      if (a && b) pares.push(ordem.get(a.id)! <= ordem.get(b.id)! ? [a, b] : [b, a]);
    }
    giro = [giro[giro.length - 1], ...giro.slice(0, -1)];
  }
  return pares;
}

export function Partidas() {
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [modo, setModo] = useState<Modo>("pontos_corridos");
  const [modoEf, setModoEf] = useState<Modo>("pontos_corridos");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const isMobile = useIsMobile(600);

  // ao vivo e global. A pagina nao abre mais o placar (isso agora e SO pelo
  // botao do topbar). Ela so avisa o provider quando algo muda, pra o botao do
  // topo acender/atualizar sem precisar de F5. `versao` sobe quando um set e
  // salvo ao vivo -> refaz a lista aqui.
  const { abrir, versao, recarregar: recarregarAoVivo } = useAoVivo();

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

  // set salvo ao vivo (versao++) -> refaz a lista pra refletir o placar novo
  useEffect(() => {
    if (versao > 0) recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao]);

  const nomeDe = (id: number) => jogadores.find((j) => j.id === id)?.nome ?? "?";
  const grupoDe = (id: number) => jogadores.find((j) => j.id === id)?.grupo ?? null;
  const grupoDaPartida = (p: Partida) => {
    const ga = grupoDe(p.jogador_a_id);
    const gb = grupoDe(p.jogador_b_id);
    return ga && ga === gb ? ga : null;
  };

  const partidasGrupos = partidas.filter((p) => p.fase === "grupos");

  async function gerarConfrontos() {
    setErro("");
    setOcupado(true);
    try {
      const chave = (x: number, y: number) => [x, y].sort((a, b) => a - b).join("-");
      const existe = new Set(partidasGrupos.map((p) => chave(p.jogador_a_id, p.jogador_b_id)));
      for (const [ja, jb] of ordenarConfrontosCirculo(jogadores)) {
        if (modo === "grupos" && (!ja.grupo || ja.grupo !== jb.grupo)) continue;
        if (!existe.has(chave(ja.id, jb.id))) {
          await api.criarPartida(ja.id, jb.id);
        }
      }
      recarregar();
      recarregarAoVivo(); // provider precisa saber das novas partidas
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function apagar(p: Partida) {
    const ok = window.confirm(
      `Apagar a partida ${nomeDe(p.jogador_a_id)} x ${nomeDe(p.jogador_b_id)}?`
    );
    if (!ok) return;
    setErro("");
    try {
      await api.deletarPartida(p.id);
      recarregar();
      recarregarAoVivo(); // partida removida sai do "disponiveis"
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const ehGrupos = modoEf === "grupos";
  const fallbackGrupos = modo === "grupos" && modoEf !== "grupos";
  const podeGerar = ehGrupos || jogadores.length >= 2;

  // O card NAO tem mais botao "Ao vivo": o unico ponto de entrada e o botao do
  // topbar. O onMudou refresca a pagina E o provider (pega saque recem-definido,
  // set salvo, etc.), pra o botao do topo acender na hora.
  // No mobile, o card da aba Partidas vira um resumo TOCAVEL: o CSS esconde
  // parciais/acoes/entrada de placar (sobra nomes + placar) e o toque abre o
  // ao vivo. So partidas nao finalizadas sao tocaveis. No desktop, card normal.
  const cardDe = (p: Partida) => {
    const tocavel = isMobile && !p.finalizada;
    const abrirAoVivo = () => abrir(p.id);
    return (
      <div
        className={`pc-wrapper pc-wrapper--partidas ${tocavel ? "tap-ao-vivo" : ""}`}
        key={p.id}
        data-testid={`partida-card-${p.id}`}
        onClick={tocavel ? abrirAoVivo : undefined}
        role={tocavel ? "button" : undefined}
        tabIndex={tocavel ? 0 : undefined}
        aria-label={tocavel ? `Abrir placar ao vivo: ${nomeDe(p.jogador_a_id)} x ${nomeDe(p.jogador_b_id)}` : undefined}
        onKeyDown={
          tocavel
            ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirAoVivo(); } }
            : undefined
        }
      >
        <PartidaCard
          partida={p}
          nomeDe={nomeDe}
          onMudou={() => { recarregar(); recarregarAoVivo(); }}
          onErro={setErro}
          onLimparErro={() => setErro("")}
          onApagar={ehGrupos ? undefined : apagar}
        />
      </div>
    );
  };

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
          className="btn ghost"
          data-testid="btn-gerar-confrontos"
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

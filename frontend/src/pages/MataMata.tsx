import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { api, type Jogador, type Partida, type Modo } from "../api";
import { PartidaCard } from "../components/PartidaCard";
import { useAoVivo } from "../AoVivoProvider";

// rotulo da rodada pelo numero de jogos (generico: serve pra 4 ou 8 times)
function rotuloRodada(qtdJogos: number): string {
  if (qtdJogos === 1) return "Final";
  if (qtdJogos === 2) return "Semifinais";
  if (qtdJogos === 4) return "Quartas de final";
  if (qtdJogos === 8) return "Oitavas de final";
  return "Rodada";
}

export function MataMata() {
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [mata, setMata] = useState<Partida[]>([]);
  const [grupos, setGrupos] = useState<Partida[]>([]);
  const [modo, setModo] = useState<Modo>("pontos_corridos");
  const [modoEf, setModoEf] = useState<Modo>("pontos_corridos");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // ao vivo global. A pagina so avisa o provider nas mutacoes (pra o botao do
  // topo acender sem F5). O placar so abre pelo botao do topbar.
  const { versao, recarregar: recarregarAoVivo } = useAoVivo();

  function recarregar() {
    Promise.all([
      api.listarJogadores(),
      api.listarMataMata(),
      api.listarPartidas(),
      api.lerConfig(),
    ])
      .then(([js, mm, ps, cfg]) => {
        setJogadores(js);
        setMata(mm);
        setGrupos(ps.filter((p) => p.fase === "grupos"));
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
        const [js, mm, ps, cfg] = await Promise.all([
          api.listarJogadores(ac.signal),
          api.listarMataMata(ac.signal),
          api.listarPartidas(ac.signal),
          api.lerConfig(ac.signal),
        ]);
        setJogadores(js);
        setMata(mm);
        setGrupos(ps.filter((p) => p.fase === "grupos"));
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

  // set salvo ao vivo (versao++) -> refaz a lista do mata-mata
  useEffect(() => {
    if (versao > 0) recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao]);

  const nomeDe = (id: number) => jogadores.find((j) => j.id === id)?.nome ?? "?";

  // Sem botao "Ao vivo" no card: o placar abre so pelo botao do topbar.
  // onMudou refresca pagina + provider (pega saque/ set salvo).
  const cardDe = (p: Partida) => (
    <div className="pc-wrapper" key={p.id}>
      <PartidaCard
        partida={p}
        nomeDe={nomeDe}
        onMudou={() => { recarregar(); recarregarAoVivo(); }}
        onErro={setErro}
        onLimparErro={() => setErro("")}
      />
    </div>
  );

  // so INICIA o mata-mata (quando ainda nao existe). O "Recomeçar" migrou pra
  // Configurações — por isso aqui nao ha mais confirmacao de refazer.
  async function iniciar() {
    setErro("");
    setOcupado(true);
    try {
      await api.iniciarMataMata();
      recarregar();
      recarregarAoVivo(); // provider precisa das novas partidas do mata
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const ehGruposSelecionado = modo === "grupos";
  const gruposCompletos = modoEf === "grupos"; // todos os 4 grupos com >= 2
  const faseGruposTerminada = grupos.length > 0 && grupos.every((p) => p.finalizada);
  const podeIniciar = gruposCompletos && faseGruposTerminada;

  const rodadas = Array.from(new Set(mata.map((p) => p.rodada ?? 0))).sort((a, b) => a - b);

  const ultima = rodadas[rodadas.length - 1];
  const final = mata.filter((p) => p.rodada === ultima);
  const campeaoId =
    final.length === 1 && final[0].finalizada
      ? final[0].sets_a > final[0].sets_b
        ? final[0].jogador_a_id
        : final[0].jogador_b_id
      : null;

  return (
    <section className="card">
      {!ehGruposSelecionado && (
        <p className="aviso info">
          O mata-mata acontece depois da fase de grupos. Ative a{" "}
          <strong>fase de grupos</strong> em Configurações.
        </p>
      )}

      {ehGruposSelecionado && (
        <>
          {campeaoId !== null && (
            <div className="banner-campeao" data-testid="banner-campeao-mata">
              <Trophy size={20} />
              <span>
                Campeão: <strong>{nomeDe(campeaoId)}</strong>
              </span>
            </div>
          )}

          {!gruposCompletos && (
            <p className="aviso">
              Todos os 4 grupos precisam de pelo menos 2 jogadores para o mata-mata.
            </p>
          )}
          {gruposCompletos && !faseGruposTerminada && (
            <p className="aviso">
              Finalize todos os jogos da fase de grupos para iniciar o mata-mata.
            </p>
          )}

          {mata.length === 0 && (
            <div className="row">
              <button
                className="btn ghost"
                data-testid="btn-iniciar-mata"
                onClick={iniciar}
                disabled={!podeIniciar || ocupado}
              >
                {ocupado ? "Gerando…" : "Iniciar mata-mata"}
              </button>
            </div>
          )}

          {erro && <p className="erro">{erro}</p>}

          {mata.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {[...rodadas].reverse().map((r) => {
                const jogos = mata.filter((p) => p.rodada === r);
                return (
                  <div key={r} style={{ marginTop: 18 }}>
                    <div className="card-title" style={{ marginBottom: 8 }}>
                      {rotuloRodada(jogos.length)}
                    </div>
                    <div className="lista">{jogos.map(cardDe)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

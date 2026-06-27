import { useEffect, useState } from "react";
import { api, type Jogador, type Modo } from "../api";

const GRUPOS = ["A", "B", "C", "D"];

export function Grupos() {
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [modo, setModo] = useState<Modo>("pontos_corridos");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  function recarregar() {
    Promise.all([api.listarJogadores(), api.lerConfig()])
      .then(([js, cfg]) => {
        setJogadores(js);
        setModo(cfg.modo);
      })
      .catch((e) => setErro(e.message));
  }

  useEffect(() => {
    const ac = new AbortController();
    let tentativas = 0;
    async function carregar() {
      if (ac.signal.aborted) return;
      try {
        const [js, cfg] = await Promise.all([
          api.listarJogadores(ac.signal),
          api.lerConfig(ac.signal),
        ]);
        setJogadores(js);
        setModo(cfg.modo);
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

  // alterna o modo via switch, com confirmacao pra nao trocar sem querer
  async function alternarModo() {
    const novo: Modo = modo === "grupos" ? "pontos_corridos" : "grupos";
    const msg =
      novo === "grupos"
        ? "Ativar fase de grupos?\n\nA classificação passará a contar só os jogos dentro de cada grupo."
        : "Desativar fase de grupos?\n\nVolta para pontos corridos: todos numa classificação única.";
    if (!window.confirm(msg)) return;
    setErro("");
    try {
      await api.definirModo(novo);
      setModo(novo);
      // trocar de modo costuma deixar partidas que nao encaixam: oferece limpar
      const partidas = await api.listarPartidas();
      if (partidas.length > 0) {
        const limpar = window.confirm(
          `Você tem ${partidas.length} partida(s) do modo anterior que podem não encaixar no novo formato.\n\nLimpar todas as partidas agora e começar do zero? (jogadores e grupos são mantidos)`
        );
        if (limpar) await api.limparPartidas();
      }
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function mudarGrupo(j: Jogador, grupo: string | null) {
    setErro("");
    try {
      await api.definirGrupo(j.id, grupo);
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function sortear() {
    if (jogadores.length === 0) return;
    const ok = window.confirm(
      "Sortear vai redistribuir TODOS os jogadores nos grupos A–D. Continuar?"
    );
    if (!ok) return;
    setErro("");
    setOcupado(true);
    try {
      const baralho = [...jogadores];
      for (let i = baralho.length - 1; i > 0; i--) {
        const k = Math.floor(Math.random() * (i + 1));
        [baralho[i], baralho[k]] = [baralho[k], baralho[i]];
      }
      for (let i = 0; i < baralho.length; i++) {
        await api.definirGrupo(baralho[i].id, GRUPOS[i % GRUPOS.length]);
      }
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const ehGrupos = modo === "grupos";
  const semGrupo = jogadores.filter((j) => !j.grupo);
  const contagem = (g: string) => jogadores.filter((j) => j.grupo === g).length;
  const gruposIncompletos = GRUPOS.filter((g) => contagem(g) < 2);
  const todosCompletos = gruposIncompletos.length === 0;

  return (
    <section className="card">
      <h2 className="card-title">Modo do torneio</h2>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: ehGrupos ? 18 : 0,
        }}
      >
        <Switch ligado={ehGrupos} onToggle={alternarModo} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 600 }}>Ativar fase de grupos</span>
          <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
            {ehGrupos ? "Ativado — confrontos e ranking por grupo" : "Desativado — pontos corridos (todos contra todos)"}
          </span>
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}

      {ehGrupos && (
        <>
          {!todosCompletos && (
            <p
              style={{
                margin: "0 0 14px",
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(245, 158, 11, 0.1)",
                borderLeft: "3px solid #f59e0b",
                color: "#fbbf24",
                fontSize: "0.9rem",
                lineHeight: 1.45,
              }}
            >
              Grupos incompletos ({gruposIncompletos.join(", ")} com menos de 2):
              o campeonato roda em <strong>Pontos Corridos</strong> até todos os
              grupos terem pelo menos 2 jogadores.
            </p>
          )}

          <div className="row">
            <button
              className="btn"
              onClick={sortear}
              disabled={ocupado || jogadores.length === 0}
            >
              {ocupado ? "Sorteando…" : "Sortear grupos (A–D)"}
            </button>
          </div>

          {GRUPOS.map((g) => {
            const doGrupo = jogadores.filter((j) => j.grupo === g);
            return (
              <div key={g} style={{ marginTop: 18 }}>
                <div
                  className="card-title"
                  style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}
                >
                  Grupo {g}
                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 500,
                      color: doGrupo.length < 2 ? "var(--loss)" : "var(--muted)",
                    }}
                  >
                    {doGrupo.length} {doGrupo.length === 1 ? "jogador" : "jogadores"}
                    {doGrupo.length < 2 ? " · mínimo 2" : ""}
                  </span>
                </div>
                {doGrupo.length === 0 ? (
                  <p className="vazio" style={{ padding: "10px 12px" }}>Vazio</p>
                ) : (
                  <div className="lista">
                    {doGrupo.map((j) => (
                      <LinhaJogador key={j.id} j={j} onMudar={mudarGrupo} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {semGrupo.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>Sem grupo</div>
              <div className="lista">
                {semGrupo.map((j) => (
                  <LinhaJogador key={j.id} j={j} onMudar={mudarGrupo} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Switch({ ligado, onToggle }: { ligado: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label="Ativar fase de grupos"
      onClick={onToggle}
      style={{
        flexShrink: 0,
        width: 52,
        height: 30,
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: ligado ? "var(--accent)" : "var(--surface-2)",
        position: "relative",
        cursor: "pointer",
        padding: 0,
        transition: "background 0.15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: ligado ? "calc(100% - 25px)" : "3px",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

function LinhaJogador({
  j,
  onMudar,
}: {
  j: Jogador;
  onMudar: (j: Jogador, g: string | null) => void;
}) {
  return (
    <div className="lista-item">
      <span className="avatar">{j.nome[0]?.toUpperCase()}</span>
      <span style={{ flex: 1 }}>{j.nome}</span>
      <select value={j.grupo ?? ""} onChange={(e) => onMudar(j, e.target.value || null)}>
        <option value="">—</option>
        {GRUPOS.map((g) => (
          <option key={g} value={g}>
            Grupo {g}
          </option>
        ))}
      </select>
    </div>
  );
}

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
      <h2 className="card-title">Grupos</h2>

      {/* modo pontos corridos: grupos nao tem efeito, orienta onde ativar */}
      {!ehGrupos && (
        <p
          className="aviso info"
        >
          Modo atual: <strong>pontos corridos</strong>. Os grupos só valem na fase de
          grupos — ative em <strong>Configurações</strong>. Você pode deixar tudo pronto
          aqui mesmo assim.
        </p>
      )}

      {/* modo grupos com algum grupo abaixo de 2 */}
      {ehGrupos && !todosCompletos && (
        <p
          className="aviso"
        >
          Grupos incompletos ({gruposIncompletos.join(", ")} com menos de 2): o
          campeonato roda em <strong>Pontos Corridos</strong> até todos os grupos terem
          pelo menos 2 jogadores.
        </p>
      )}

      {erro && <p className="erro">{erro}</p>}

      <div className="row">
        <button className="btn" onClick={sortear} disabled={ocupado || jogadores.length === 0}>
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
    </section>
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

import { useEffect, useState } from "react";
import { Trophy, TrendingDown } from "lucide-react";
import { api, type ResumoCampeonato } from "../api";

const FASE_LABEL: Record<string, string> = {
  sem_jogos: "Sem jogos ainda",
  grupos: "Fase de grupos",
  pontos_corridos: "Pontos corridos",
  mata: "Mata-mata",
  encerrado: "Encerrado",
};

export function VisaoGeral() {
  const [r, setR] = useState<ResumoCampeonato | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    let tentativas = 0;
    async function carregar() {
      if (ac.signal.aborted) return;
      try {
        setR(await api.resumoCampeonato(ac.signal));
        setErro("");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (tentativas++ < 2) { setTimeout(carregar, 500); return; }
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
    return () => ac.abort();
  }, []);

  if (carregando) return <section className="card"><p className="vazio">Carregando…</p></section>;
  if (erro) return <section className="card"><p className="erro">{erro}</p></section>;
  if (!r) return null;

  const pct = Math.round(r.progresso * 100);

  return (
    <>
      {/* Rei do Pingas — campeão + estado, centralizado */}
      <section className="card">
        <h2 className="card-title">{r.campeao ? "Rei do Pingas" : "Evolução do Campeonato"}</h2>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          {r.campeao && (
            <div
              data-testid="visao-campeao"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--accent)", fontWeight: 800, fontSize: "1.3rem" }}
            >
              <Trophy size={22} /> {r.campeao}
            </div>
          )}
          <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: r.campeao ? 4 : 0 }}>
            <span data-testid="visao-fase">{FASE_LABEL[r.fase_atual] ?? r.fase_atual}</span>
            {" · "}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.total_partidas}/{r.partidas_totais} partidas</span>
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", transition: "width .3s" }} />
        </div>
      </section>

      {/* Passou por baixo da mesa — quem levou 0-11 (agrupado por jogador) */}
      {r.passou_por_baixo.length > 0 && (
        <section className="card">
          <h2 className="card-title">Passou por Baixo da Mesa</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {r.passou_por_baixo.map((p, i) => (
              <div
                key={p.jogador_id}
                data-testid={`passou-baixo-${p.jogador_id}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap",
                  padding: "12px 14px", borderRadius: "var(--radius-sm)", textAlign: "center",
                  background: "var(--surface-2)",
                  border: i === 0 ? "1px solid var(--loss)" : "1px solid var(--border-soft)",
                }}
              >
                <TrendingDown size={18} style={{ color: "var(--loss)", flexShrink: 0 }} />
                <span style={{ fontWeight: 700 }}>{p.nome}</span>
                <span style={{ color: "var(--muted)" }}>passou por baixo</span>
                <span style={{ color: "var(--loss)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{p.vezes}×</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Detalhado por jogador — colunas no estilo da Classificação */}
      {r.jogadores.length > 0 && (
        <section className="card">
          <h2 className="card-title">Detalhado por Jogador</h2>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Jogador</th>
                  <th style={{ textAlign: "right" }} title="Jogos">J</th>
                  <th style={{ textAlign: "right" }} title="Vitórias">V</th>
                  <th style={{ textAlign: "right" }} title="Derrotas">D</th>
                  <th style={{ textAlign: "right" }} title="Sets ganhos">SG</th>
                  <th style={{ textAlign: "right" }} title="Sets perdidos">SP</th>
                  <th style={{ textAlign: "right" }} title="Pontos feitos">PF</th>
                  <th style={{ textAlign: "right" }} title="Pontos contra (sofridos)">PC</th>
                  <th style={{ textAlign: "right" }} className="hide-sm" title="Média de pontos por set">Méd/set</th>
                </tr>
              </thead>
              <tbody>
                {r.jogadores.map((j) => (
                  <tr key={j.jogador_id} data-testid={`resumo-jogador-${j.jogador_id}`}>
                    <td className="nome-col">
                      <span className="avatar">{j.nome[0]?.toUpperCase()}</span>
                      {j.nome}
                    </td>
                    <td>{j.jogos}</td>
                    <td>{j.vitorias}</td>
                    <td>{j.derrotas}</td>
                    <td>{j.sets_ganhos}</td>
                    <td>{j.sets_perdidos}</td>
                    <td>{j.pontos}</td>
                    <td>{j.pontos_sofridos}</td>
                    <td className="hide-sm">{j.media_set.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

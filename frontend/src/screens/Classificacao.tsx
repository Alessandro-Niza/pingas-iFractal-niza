import { useEffect, useState } from "react";
import { api, type LinhaClassificacao, type Modo } from "../api";

export function Classificacao() {
  const [linhas, setLinhas] = useState<LinhaClassificacao[]>([]);
  const [modo, setModo] = useState<Modo>("pontos_corridos");
  const [modoEf, setModoEf] = useState<Modo>("pontos_corridos");
  const [erro, setErro] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    let tentativas = 0;
    async function carregar() {
      if (ac.signal.aborted) return;
      try {
        const [cl, cfg] = await Promise.all([
          api.classificacao(ac.signal),
          api.lerConfig(ac.signal),
        ]);
        setLinhas(cl);
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

  const fallbackGrupos = modo === "grupos" && modoEf !== "grupos";

  const Aviso = () =>
    fallbackGrupos ? (
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
        Fase de grupos selecionada, mas o campeonato está rodando em{" "}
        <strong>Pontos Corridos</strong>: todos os grupos devem possuir pelo menos
        2 jogadores para iniciar a fase de grupos.
      </p>
    ) : null;

  if (linhas.length === 0) {
    return (
      <section className="card">
        <h2 className="card-title">Classificação</h2>
        <Aviso />
        <p className="vazio">
          Nenhuma partida finalizada ainda. Registre resultados na aba Partidas.
        </p>
        {erro && <p className="erro">{erro}</p>}
      </section>
    );
  }

  // modo grupos: uma tabela por grupo. pontos corridos: tabela unica.
  if (modoEf === "grupos") {
    const grupos = [...new Set(linhas.map((l) => l.grupo ?? "—"))];
    return (
      <>
        <Aviso />
        {grupos.map((g) => (
          <section className="card" key={g}>
            <h2 className="card-title">Grupo {g}</h2>
            <Tabela linhas={linhas.filter((l) => (l.grupo ?? "—") === g)} />
          </section>
        ))}
        {erro && <p className="erro">{erro}</p>}
      </>
    );
  }

  return (
    <section className="card">
      <h2 className="card-title">Classificação geral</h2>
      <Aviso />
      <Tabela linhas={linhas} />
      {erro && <p className="erro">{erro}</p>}
    </section>
  );
}

function Tabela({ linhas }: { linhas: LinhaClassificacao[] }) {
  return (
    <table className="tabela">
      <thead>
        <tr>
          <th>#</th>
          <th>Jogador</th>
          <th>J</th>
          <th>V</th>
          <th>D</th>
          <th className="hide-sm">Sets</th>
          <th className="hide-sm">Saldo</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={l.jogador_id} className={i === 0 ? "lider" : ""}>
            <td>
              <span className="pos">{i + 1}</span>
            </td>
            <td className="nome-col">
              <span className="avatar">{l.nome[0]?.toUpperCase()}</span>
              {l.nome}
            </td>
            <td>{l.jogos}</td>
            <td>{l.vitorias}</td>
            <td>{l.derrotas}</td>
            <td className="hide-sm">
              {l.sets_ganhos}:{l.sets_perdidos}
            </td>
            <td className="hide-sm">
              {l.saldo_sets > 0 ? "+" : ""}
              {l.saldo_sets}
            </td>
            <td className="pts">{l.pontos}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

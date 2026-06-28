import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { api, type Jogador, type LinhaClassificacao, type Partida, type Modo } from "../api";

export function Classificacao() {
  const [linhas, setLinhas] = useState<LinhaClassificacao[]>([]);
  const [mata, setMata] = useState<Partida[]>([]);
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [modo, setModo] = useState<Modo>("pontos_corridos");
  const [modoEf, setModoEf] = useState<Modo>("pontos_corridos");
  const [erro, setErro] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    let tentativas = 0;
    async function carregar() {
      if (ac.signal.aborted) return;
      try {
        const [cl, cfg, mm, js] = await Promise.all([
          api.classificacao(ac.signal),
          api.lerConfig(ac.signal),
          api.listarMataMata(ac.signal),
          api.listarJogadores(ac.signal),
        ]);
        setLinhas(cl);
        setModo(cfg.modo);
        setModoEf(cfg.modo_efetivo);
        setMata(mm);
        setJogadores(js);
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
  const fallbackGrupos = modo === "grupos" && modoEf !== "grupos";

  const Aviso = () =>
    fallbackGrupos ? (
      <p className="aviso">
        Fase de grupos selecionada, mas o campeonato está rodando em{" "}
        <strong>Pontos Corridos</strong>: todos os grupos devem possuir pelo menos
        2 jogadores para iniciar a fase de grupos.
      </p>
    ) : null;

  const Resumo = () => <ResumoMata mata={mata} nomeDe={nomeDe} />;

  if (linhas.length === 0) {
    return (
      <>
        <Resumo />
        <section className="card">
          <h2 className="card-title">Classificação</h2>
          <Aviso />
          <p className="vazio">
            Nenhuma partida finalizada ainda. Registre resultados na aba Partidas.
          </p>
          {erro && <p className="erro">{erro}</p>}
        </section>
      </>
    );
  }

  // modo grupos: uma tabela por grupo. pontos corridos: tabela unica.
  if (modoEf === "grupos") {
    const grupos = [...new Set(linhas.map((l) => l.grupo ?? "—"))];
    return (
      <>
        <Resumo />
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
    <>
      <Resumo />
      <section className="card">
        <h2 className="card-title">Classificação geral</h2>
        <Aviso />
        <Tabela linhas={linhas} />
        {erro && <p className="erro">{erro}</p>}
      </section>
    </>
  );
}

// Resumo do chaveamento (semis -> final -> campeao). Some quando nao ha mata-mata.
function ResumoMata({ mata, nomeDe }: { mata: Partida[]; nomeDe: (id: number) => string }) {
  if (mata.length === 0) return null;

  const rodadas = Array.from(new Set(mata.map((p) => p.rodada ?? 0))).sort((a, b) => a - b);
  const ultima = rodadas[rodadas.length - 1];
  const final = mata.filter((p) => p.rodada === ultima);
  const campeaoId =
    final.length === 1 && final[0].finalizada
      ? final[0].sets_a > final[0].sets_b
        ? final[0].jogador_a_id
        : final[0].jogador_b_id
      : null;

  const rotulo = (q: number) =>
    q === 1 ? "Final" : q === 2 ? "Semifinais" : q === 4 ? "Quartas de final" : q === 8 ? "Oitavas de final" : "Rodada";

  return (
    <section className="card resumo-mata">
      <h2 className="card-title">Mata-mata</h2>
      {campeaoId !== null && (
        <div className="resumo-campeao">
          <Trophy size={18} />
          <span>
            Campeão: <strong>{nomeDe(campeaoId)}</strong>
          </span>
        </div>
      )}
      {[...rodadas].reverse().map((r) => {
        const jogos = mata.filter((p) => p.rodada === r);
        return (
          <div key={r}>
            <div className="rodada-titulo">{rotulo(jogos.length)}</div>
            {jogos.map((p) => {
              const aVenc = p.finalizada && p.sets_a > p.sets_b;
              const bVenc = p.finalizada && p.sets_b > p.sets_a;
              return (
                <div className="resumo-jogo" key={p.id}>
                  <span className={`nome-a ${aVenc ? "venc" : ""}`}>{nomeDe(p.jogador_a_id)}</span>
                  <span className="placar-mini">
                    {p.finalizada ? `${p.sets_a} : ${p.sets_b}` : "—"}
                  </span>
                  <span className={`nome-b ${bVenc ? "venc" : ""}`}>{nomeDe(p.jogador_b_id)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
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

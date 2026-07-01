import { useEffect, useState } from "react";
import { Trophy, Crown } from "lucide-react";
import { api, type Jogador, type LinhaClassificacao, type Partida, type Modo } from "../api";

export function Classificacao() {
  const [linhas, setLinhas] = useState<LinhaClassificacao[]>([]);
  const [mata, setMata] = useState<Partida[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
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
        const [cl, cfg, mm, js, ps] = await Promise.all([
          api.classificacao(ac.signal),
          api.lerConfig(ac.signal),
          api.listarMataMata(ac.signal),
          api.listarJogadores(ac.signal),
          api.listarPartidas(ac.signal),
        ]);
        setLinhas(cl);
        setModo(cfg.modo);
        setModoEf(cfg.modo_efetivo);
        setMata(mm);
        setJogadores(js);
        setPartidas(ps);
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

  // pontos corridos modelo "Brasileirao": o lider vira campeao quando TODOS os jogos
  // terminam. so vale no pontos corridos de verdade (nao no fallback de grupos incompletos).
  const partidasGrupos = partidas.filter((p) => p.fase === "grupos");
  const faseCompleta = partidasGrupos.length > 0 && partidasGrupos.every((p) => p.finalizada);
  const campeaoPontos =
    modo === "pontos_corridos" && faseCompleta && linhas.length > 0 ? linhas[0] : null;

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
        {campeaoPontos && (
          <div className="banner-campeao">
            <Trophy size={20} />
            <span>
              Campeão: <strong>{campeaoPontos.nome}</strong>
            </span>
          </div>
        )}
        <Tabela linhas={linhas} campeaoId={campeaoPontos?.jogador_id} />
        {erro && <p className="erro">{erro}</p>}
      </section>
    </>
  );
}

// Resumo do chaveamento: um CARD por rodada (Final, Semifinais, ...), da mais
// recente pra mais antiga. O banner de campeao fica por fora, antes dos cards.
// Some quando nao ha mata-mata.
function ResumoMata({ mata, nomeDe }: { mata: Partida[]; nomeDe: (id: number) => string }) {
  if (mata.length === 0) return null;

  const rodadas = Array.from(new Set(mata.map((p) => p.rodada ?? 0))).sort((a, b) => a - b);
  const ultima = rodadas[rodadas.length - 1];
  const final = mata.filter((p) => p.rodada === ultima);
  // campeao = vencedor da final (ultima rodada com 1 jogo) se ja finalizada
  const campeaoId =
    final.length === 1 && final[0].finalizada
      ? final[0].sets_a > final[0].sets_b
        ? final[0].jogador_a_id
        : final[0].jogador_b_id
      : null;

  const rotulo = (q: number) =>
    q === 1 ? "Final" : q === 2 ? "Semifinais" : q === 4 ? "Quartas de final" : q === 8 ? "Oitavas de final" : "Rodada";

  const linhaJogo = (p: Partida) => {
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
  };

  return (
    <>
      {campeaoId !== null && (
        <div className="banner-campeao">
          <Trophy size={18} />
          <span>
            Campeão: <strong>{nomeDe(campeaoId)}</strong>
          </span>
        </div>
      )}
      {[...rodadas].reverse().map((r) => {
        const jogos = mata.filter((p) => p.rodada === r);
        return (
          <section className="card resumo-mata" key={r}>
            <h2 className="card-title">{rotulo(jogos.length)}</h2>
            {jogos.map(linhaJogo)}
          </section>
        );
      })}
    </>
  );
}

// Tabela de classificacao. As colunas "Sets" e "Saldo" foram removidas:
// como cada jogo e set unico (melhor de 1), "sets ganhos" so daria 1:0 ou 0:1,
// que e redundante com V/D. Restam #, Jogador, J, V, D, Pts.
function Tabela({ linhas, campeaoId }: { linhas: LinhaClassificacao[]; campeaoId?: number }) {
  return (
    <table className="tabela">
      <thead>
        <tr>
          <th>#</th>
          <th>Jogador</th>
          <th>J</th>
          <th>V</th>
          <th>D</th>
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
              {campeaoId === l.jogador_id && (
                <Crown
                  size={15}
                  style={{ color: "var(--gold)", marginLeft: 6, verticalAlign: "-2px" }}
                  aria-label="Campeão"
                />
              )}
            </td>
            <td>{l.jogos}</td>
            <td>{l.vitorias}</td>
            <td>{l.derrotas}</td>
            <td className="pts">{l.pontos}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
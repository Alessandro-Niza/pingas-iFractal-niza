import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "../api";
import { useAoVivo, type Pontos } from "../AoVivoProvider";

const setFinalizado = (a: number, b: number) =>
  (a >= 11 || b >= 11) && Math.abs(a - b) >= 2;

// quem saca DENTRO do set (regra oficial: 2 saques ate 9-9, 1 no deuce)
function quemSaca(a: number, b: number, starter: 0 | 1): 0 | 1 {
  const total = a + b;
  const deuce = a >= 10 && b >= 10;
  const turno = deuce ? total % 2 : Math.floor(total / 2) % 2;
  return turno === 0 ? starter : ((1 - starter) as 0 | 1);
}
const setsParaVencer = (melhorDe: number) => Math.floor(melhorDe / 2) + 1;
const starterDoSet = (starter: 0 | 1, numero: number): 0 | 1 =>
  (((starter + (numero - 1)) % 2) as 0 | 1);

/**
 * Modo "ao vivo" em tela cheia. Agora dirigido pelo contexto AoVivo:
 * le a partida ativa e os pontos do set atual do provider. Os pontos do set
 * em andamento sao persistidos (localStorage via setPontos), entao SOBREVIVEM
 * a um F5: ao reabrir a partida pelo seletor, o placar volta de onde parou.
 * Sets ja completos ficam no backend (registrarSet); o rascunho local guarda
 * so o set em disputa.
 */
export function PartidaFullscreen() {
  const {
    partidaAoVivo: p, nomeDe, fechar, recarregar,
    pontosDe, setPontos, limparPontos,
  } = useAoVivo();

  // placar do set atual: inicia do rascunho persistido (0 a 0 se nao houver)
  const [placar, setPlacar] = useState<Pontos>(() => (p ? pontosDe(p.id) : { a: 0, b: 0 }));
  const [erro, setErro] = useState("");

  // Esc fecha o modo ao vivo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fechar]);

  // se a partida ja esta finalizada (ex: chegou finalizada por fora), fecha
  useEffect(() => {
    if (p?.finalizada) fechar();
  }, [p?.finalizada, fechar]);

  if (!p) return null;

  const melhorDe = p.melhor_de;
  const jogados = p.sets;
  const numeroAtual = jogados.length + 1;
  const alvo = setsParaVencer(melhorDe);

  const sacaInicial: 0 | 1 = p.saca_inicial === 1 ? 1 : 0;
  const starterAtual = starterDoSet(sacaInicial, numeroAtual);
  const saca = quemSaca(placar.a, placar.b, starterAtual);

  const nomeA = nomeDe(p.jogador_a_id);
  const nomeB = nomeDe(p.jogador_b_id);

  // SET POINT / MATCH POINT (reusam setFinalizado; deuce ja tratado)
  const setPointA = setFinalizado(placar.a + 1, placar.b);
  const setPointB = setFinalizado(placar.b + 1, placar.a);
  const matchPointA = setPointA && p.sets_a === alvo - 1;
  const matchPointB = setPointB && p.sets_b === alvo - 1;
  const seloA = matchPointA ? "MATCH POINT" : setPointA ? "SET POINT" : null;
  const seloB = matchPointB ? "MATCH POINT" : setPointB ? "SET POINT" : null;

  async function ponto(lado: "a" | "b", delta: number) {
    setErro("");
    const anterior = placar;
    const novo = {
      a: lado === "a" ? Math.max(0, placar.a + delta) : placar.a,
      b: lado === "b" ? Math.max(0, placar.b + delta) : placar.b,
    };
    setPlacar(novo);
    setPontos(p.id, novo); // persiste o rascunho do set atual (sobrevive a F5)

    if (setFinalizado(novo.a, novo.b)) {
      try {
        await api.registrarSet(p.id, numeroAtual, novo.a, novo.b);
        setPlacar({ a: 0, b: 0 });
        limparPontos(p.id); // set salvo no backend -> descarta o rascunho local
        recarregar();       // atualiza sets/finalizada (e as paginas, via versao)
      } catch (e) {
        setErro((e as Error).message);
        setPlacar(anterior);
        setPontos(p.id, anterior); // reverte tambem a persistencia
      }
    }
  }

  const Lado = ({ nome, letra }: { nome: string; letra: 0 | 1 }) => (
    <div className={`fs-lado ${saca === letra ? "sacando" : ""}`}>
      {saca === letra && (
        <span className="fs-saque-badge">
          <span className="marca-saque" /> SACANDO
        </span>
      )}
      <div className="fs-jogador">
        <span className={`fs-avatar ${saca === letra ? "on" : ""}`}>{nome[0]?.toUpperCase()}</span>
        <span className="fs-nome">{nome}</span>
      </div>
    </div>
  );

  const ColunaJogador = ({
    lado, nome, valor, selo, isMatch,
  }: { lado: "a" | "b"; nome: string; valor: number; selo: string | null; isMatch: boolean }) => (
    <div className="fs-jogador-placar">
      <div className="fs-point-slot">
        {selo && (
          <span className={`fs-point-badge ${isMatch ? "match" : ""}`} data-testid={`fs-point-${lado}`}>
            {selo}
          </span>
        )}
      </div>
      <span className="fs-num" data-testid={`fs-num-${lado}`}>{valor}</span>
      <div className="fs-controle-grupo">
        <button
          className="fs-ctrl-btn menos"
          onClick={() => ponto(lado, -1)}
          data-testid={`btn-menos-${lado}`}
          aria-label={`Tirar ponto de ${nome}`}
        >−</button>
        <button
          className="fs-ctrl-btn mais"
          onClick={() => ponto(lado, +1)}
          data-testid={`btn-mais-${lado}`}
          aria-label={`Somar ponto para ${nome}`}
        >+</button>
      </div>
    </div>
  );

  return (
    <div className="fs-overlay" role="dialog" aria-label="Placar ao vivo" data-testid="fullscreen-partida">
      <button className="fs-fechar" onClick={fechar} aria-label="Fechar modo ao vivo" data-testid="btn-fechar-fullscreen">
        <X size={26} />
      </button>

      <div className="fs-topo">
        <div className="fs-melhor-de">MELHOR DE {melhorDe}</div>
        <div className="fs-cab">
          <Lado nome={nomeA} letra={0} />
          <div className="fs-sets">
            <div className="fs-sets-label">SETS</div>
            <div className="fs-sets-valor">
              <span className={p.sets_a > p.sets_b ? "on" : ""}>{p.sets_a}</span>
              <span className="fs-x">×</span>
              <span className={p.sets_b > p.sets_a ? "on" : ""}>{p.sets_b}</span>
            </div>
          </div>
          <Lado nome={nomeB} letra={1} />
        </div>
      </div>

      <div className="fs-corpo">
        <div className="fs-placar">
          <div className="fs-set-atual">SET {numeroAtual} DE {melhorDe}</div>
          <div className="fs-marcador">
            <ColunaJogador lado="a" nome={nomeA} valor={placar.a} selo={seloA} isMatch={matchPointA} />
            <div className="fs-centro"><span className="fs-x-grande">×</span></div>
            <ColunaJogador lado="b" nome={nomeB} valor={placar.b} selo={seloB} isMatch={matchPointB} />
          </div>
        </div>

        <aside className="fs-historico">
          <div className="fs-historico-titulo">HISTÓRICO DE SETS</div>
          <div className="fs-hist-lista">
            {Array.from({ length: melhorDe }).map((_, i) => {
              const num = i + 1;
              const s = jogados[i];
              const atual = num === numeroAtual;
              return (
                <div key={num} className={`fs-hist-set ${atual ? "atual" : ""}`}>
                  <div className="fs-hist-num">
                    SET {num}{atual && <span className="fs-hist-tag">ATUAL</span>}
                  </div>
                  <div className="fs-hist-placar">
                    {s ? (
                      <>
                        <span className={s.pontos_a > s.pontos_b ? "ganhou" : ""}>{s.pontos_a}</span>
                        <span className="fs-x">×</span>
                        <span className={s.pontos_b > s.pontos_a ? "ganhou" : ""}>{s.pontos_b}</span>
                        {s.pontos_a !== s.pontos_b ? <span className="fs-check">✓</span> : null}
                      </>
                    ) : atual ? (
                      <><span className="on">{placar.a}</span><span className="fs-x">×</span><span className="on">{placar.b}</span></>
                    ) : (
                      <span className="fs-vazio">— × —</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {erro && <p className="fs-erro">{erro}</p>}
    </div>
  );
}

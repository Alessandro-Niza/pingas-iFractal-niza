import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, type Partida } from "../api";

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
 * Modo "ao vivo" em tela cheia: placar grande pra marcar ponto a ponto durante o jogo.
 * WEB ONLY. Reusa a MESMA logica do PartidaCard (saque, sets, avanco automatico),
 * mas com layout de placar de ginasio. Nao edita sets antigos (isso fica no card normal).
 *
 * Requisito: a partida ja precisa ter saca_inicial definido (escolhido no card).
 * Quando a PARTIDA fecha (alguem alcanca os sets necessarios), chama onFechar.
 *
 * Layout: numeros espalhados nas laterais (cada um sob seu jogador), × no centro.
 * Os numeros sao APENAS display (passivos). Somar e corrigir acontece pelos
 * botoes − / + embaixo de cada numero. Acima do numero de quem esta a 1 ponto
 * de fechar o set acende SET POINT (ou MATCH POINT, se fechar o set fecha o jogo).
 */
export function PartidaFullscreen({
  partida: p,
  nomeDe,
  onMudou,
  onFechar,
}: {
  partida: Partida;
  nomeDe: (id: number) => string;
  onMudou: () => void;   // recarrega os dados no pai apos cada set salvo
  onFechar: () => void;  // fecha o modo ao vivo
}) {
  const [placar, setPlacar] = useState<{ a: number; b: number }>({ a: 0, b: 0 });
  const [erro, setErro] = useState("");

  const melhorDe = p.melhor_de;
  const jogados = p.sets;
  const numeroAtual = jogados.length + 1;
  const alvo = setsParaVencer(melhorDe);

  const sacaInicial: 0 | 1 = (p.saca_inicial === 1 ? 1 : 0);
  const starterAtual = starterDoSet(sacaInicial, numeroAtual);
  const saca = quemSaca(placar.a, placar.b, starterAtual);

  const nomeA = nomeDe(p.jogador_a_id);
  const nomeB = nomeDe(p.jogador_b_id);

  // ---- SET POINT / MATCH POINT (funcoes puras, reusam setFinalizado) ----
  // SET POINT: marcar +1 ponto fecharia o set atual. Passar (placar+1) pelo
  // mesmo setFinalizado cobre de graca o caso do deuce (11-10 nao fecha, 12-10
  // fecha). MATCH POINT: e set point E vencer ESTE set fecha a partida — ou
  // seja, o jogador ja tem alvo-1 sets ganhos.
  const setPointA = setFinalizado(placar.a + 1, placar.b);
  const setPointB = setFinalizado(placar.b + 1, placar.a);
  const matchPointA = setPointA && p.sets_a === alvo - 1;
  const matchPointB = setPointB && p.sets_b === alvo - 1;
  const seloA = matchPointA ? "MATCH POINT" : setPointA ? "SET POINT" : null;
  const seloB = matchPointB ? "MATCH POINT" : setPointB ? "SET POINT" : null;

  // Esc fecha o modo ao vivo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);

  // se a partida ja esta finalizada (ex: chegou finalizada por fora), fecha
  useEffect(() => {
    if (p.finalizada) onFechar();
  }, [p.finalizada, onFechar]);

  async function ponto(lado: "a" | "b", delta: number) {
    setErro("");
    const novo = {
      a: lado === "a" ? Math.max(0, placar.a + delta) : placar.a,
      b: lado === "b" ? Math.max(0, placar.b + delta) : placar.b,
    };
    setPlacar(novo);
    // fechou o set? grava no backend; o set seguinte comeca zerado
    if (setFinalizado(novo.a, novo.b)) {
      try {
        await api.registrarSet(p.id, numeroAtual, novo.a, novo.b);
        setPlacar({ a: 0, b: 0 });
        onMudou(); // recarrega: se a partida fechou, o efeito de p.finalizada fecha o modo
      } catch (e) {
        setErro((e as Error).message);
        setPlacar(placar); // desfaz visualmente se falhou o save
      }
    }
  }

  const Lado = ({ lado, nome, letra }: { lado: "a" | "b"; nome: string; letra: 0 | 1 }) => (
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

  // coluna do placar de um jogador: selo (set/match point) + numero grande + [− +].
  // o numero e passivo (display); marcar/corrigir sai pelos botoes.
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
      <button className="fs-fechar" onClick={onFechar} aria-label="Fechar modo ao vivo" data-testid="btn-fechar-fullscreen">
        <X size={26} />
      </button>

      <div className="fs-topo">
        <div className="fs-melhor-de">MELHOR DE {melhorDe}</div>
        <div className="fs-cab">
          <Lado lado="a" nome={nomeA} letra={0} />
          <div className="fs-sets">
            <div className="fs-sets-label">SETS</div>
            <div className="fs-sets-valor">
              <span className={p.sets_a > p.sets_b ? "on" : ""}>{p.sets_a}</span>
              <span className="fs-x">×</span>
              <span className={p.sets_b > p.sets_a ? "on" : ""}>{p.sets_b}</span>
            </div>
          </div>
          <Lado lado="b" nome={nomeB} letra={1} />
        </div>
      </div>

      <div className="fs-corpo">
        <div className="fs-placar">
          <div className="fs-set-atual">SET {numeroAtual} DE {melhorDe}</div>

          {/* marcador espalhado: numero A | × | numero B, espelhando o cabecalho */}
          <div className="fs-marcador">
            <ColunaJogador lado="a" nome={nomeA} valor={placar.a} selo={seloA} isMatch={matchPointA} />
            <div className="fs-centro">
              <span className="fs-x-grande">×</span>
            </div>
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

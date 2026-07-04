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
          <div className="fs-pontos">
            <button className="fs-ponto-btn" onClick={() => ponto("a", +1)} aria-label={`Ponto ${nomeA}`}>
              <span className="fs-num">{placar.a}</span>
            </button>
            <span className="fs-x-grande">×</span>
            <button className="fs-ponto-btn" onClick={() => ponto("b", +1)} aria-label={`Ponto ${nomeB}`}>
              <span className="fs-num">{placar.b}</span>
            </button>
          </div>
          <div className="fs-menos">
            <button className="fs-menos-btn" onClick={() => ponto("a", -1)} aria-label={`Menos ${nomeA}`}>−</button>
            <span className="fs-menos-label">corrigir</span>
            <button className="fs-menos-btn" onClick={() => ponto("b", -1)} aria-label={`Menos ${nomeB}`}>−</button>
          </div>
        </div>

        <aside className="fs-historico">
          <div className="fs-historico-titulo">HISTÓRICO DE SETS</div>
          {Array.from({ length: melhorDe }).map((_, i) => {
            const num = i + 1;
            const s = jogados[i];
            const atual = num === numeroAtual;
            return (
              <div key={num} className={`fs-hist-set ${atual ? "atual" : ""}`}>
                <div className="fs-hist-num">SET {num}{atual && <span className="fs-hist-tag">ATUAL</span>}</div>
                <div className="fs-hist-placar">
                  {s ? (
                    <>
                      <span className={s.pontos_a > s.pontos_b ? "ganhou" : ""}>{s.pontos_a}</span>
                      <span className="fs-x">×</span>
                      <span className={s.pontos_b > s.pontos_a ? "ganhou" : ""}>{s.pontos_b}</span>
                      {s.pontos_a > s.pontos_b || s.pontos_b > s.pontos_a ? <span className="fs-check">✓</span> : null}
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
        </aside>
      </div>

      {erro && <p className="fs-erro">{erro}</p>}
    </div>
  );
}
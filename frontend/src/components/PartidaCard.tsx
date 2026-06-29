import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api, type Partida } from "../api";

const MIN_PLACAR = 0;

// jogo terminou: alguem chegou a 11+ E abriu 2 de vantagem
const ehFinalizado = (a: number, b: number) =>
  (a >= 11 || b >= 11) && Math.abs(a - b) >= 2;

// quem saca, pela regra oficial:
//  - ate 9-9: 2 saques pra cada, alternando
//  - de 10-10 (deuce) em diante: 1 saque pra cada, alternando
function quemSaca(a: number, b: number, starter: 0 | 1): 0 | 1 {
  const total = a + b;
  const deuce = a >= 10 && b >= 10;
  const turno = deuce ? total % 2 : Math.floor(total / 2) % 2;
  return turno === 0 ? starter : ((1 - starter) as 0 | 1);
}

const btnSmall = { padding: "6px 12px", fontSize: "0.85rem" } as const;

/**
 * Card de uma partida: placar com auto-save ao vivo, deuce sem limite,
 * indicador de saque e edicao. Usado na fase de grupos e no mata-mata.
 * - onMudou: chamado apos salvar (pai recarrega).
 * - onApagar: se passado, mostra a lixeira (some no mata-mata).
 * - onErro: reporta erro ao pai.
 *
 * Regra: numa partida nova, o placar so libera depois de escolher
 * quem sai com a bola (tocar no nome do jogador).
 */
export function PartidaCard({
  partida: p,
  nomeDe,
  onMudou,
  onApagar,
  onErro,
}: {
  partida: Partida;
  nomeDe: (id: number) => string;
  onMudou: () => void;
  onApagar?: (p: Partida) => void;
  onErro?: (msg: string) => void;
}) {
  const [placar, setPlacar] = useState<{ a: string; b: string }>({ a: "", b: "" });
  const [editando, setEditando] = useState(false);
  const [sacaInicial, setSacaInicial] = useState<0 | 1 | undefined>(undefined);

  async function gravar(a: number, b: number) {
    try {
      await api.registrarResultado(p.id, a, b);
      setEditando(false);
      onMudou();
    } catch (e) {
      onErro?.((e as Error).message);
    }
  }

  // botao Salvar (digitacao): valida antes de gravar
  function salvar() {
    if (precisaEscolherSaque) {
      onErro?.("Escolha quem sai com a bola antes de começar a partida.");
      return;
    }
    const a = parseInt(placar.a, 10);
    const b = parseInt(placar.b, 10);
    if (isNaN(a) || isNaN(b)) {
      onErro?.("Preencha os dois placares.");
      return;
    }
    if (!ehFinalizado(a, b)) {
      onErro?.("Partida ainda não terminou. Em caso de 10 × 10, vence quem abrir 2 pontos de vantagem.");
      return;
    }
    gravar(a, b);
  }

  // +/− ao vivo: atualiza e, se finalizou, salva sozinho
  function passo(lado: "a" | "b", valor: string) {
    if (precisaEscolherSaque) {
      onErro?.("Escolha quem sai com a bola antes de começar a partida.");
      return;
    }
    const novo = { ...placar, [lado]: valor };
    setPlacar(novo);
    const a = parseInt(novo.a || "0", 10);
    const b = parseInt(novo.b || "0", 10);
    if (ehFinalizado(a, b)) gravar(a, b);
  }

  // digitacao manual: NAO dispara auto-save
  function digitar(lado: "a" | "b", valor: string) {
    setPlacar((prev) => ({ ...prev, [lado]: valor }));
  }

  function abrirEdicao() {
    setPlacar({ a: String(p.sets_a), b: String(p.sets_b) });
    setEditando(true);
  }

  const emEdicao = !p.finalizada || editando;
  const podeSaque = !p.finalizada;
  // partida nova ainda sem saque definido: trava o placar
  const precisaEscolherSaque = podeSaque && sacaInicial === undefined;
  const a = parseInt(placar.a || "0", 10);
  const b = parseInt(placar.b || "0", 10);
  const saca: 0 | 1 | null =
    podeSaque && sacaInicial !== undefined ? quemSaca(a, b, sacaInicial) : null;

  const nomeA = nomeDe(p.jogador_a_id);
  const nomeB = nomeDe(p.jogador_b_id);

  const estiloNome = (lado: 0 | 1) =>
    ({
      color: saca === lado ? "var(--accent)" : undefined,
      fontWeight: saca === lado ? 600 : undefined,
      cursor: podeSaque ? "pointer" : undefined,
      textDecoration: podeSaque && sacaInicial === undefined ? "underline dotted" : undefined,
      textDecorationColor: "var(--muted-2)",
      textUnderlineOffset: 4,
    }) as const;
  const aoTocarLado = (lado: 0 | 1) => (podeSaque ? () => setSacaInicial(lado) : undefined);
  const tituloSaque = podeSaque ? "Tocar pra marcar quem saca primeiro" : undefined;

  return (
    <div className={`partida ${p.finalizada ? "feita" : ""}`}>
      {/* ===== DESKTOP (>= 761px): layout horizontal atual, intacto ===== */}
      <div className="pc-desktop">
        <div className="lado" onClick={aoTocarLado(0)} title={tituloSaque}>
          <span className="avatar">{nomeA[0]?.toUpperCase()}</span>
          <span className="nome" style={estiloNome(0)}>{nomeA}</span>
          {saca === 0 && <MarcaSaque />}
        </div>

        {emEdicao ? (
          <div className="row partida-acoes">
            <Stepper valor={placar.a} onPasso={(v) => passo("a", v)} onDigitar={(v) => digitar("a", v)} disabled={precisaEscolherSaque} />
            <span className="vs">x</span>
            <Stepper valor={placar.b} onPasso={(v) => passo("b", v)} onDigitar={(v) => digitar("b", v)} disabled={precisaEscolherSaque} />
            <button className="btn ghost" style={btnSmall} onClick={salvar}>Salvar</button>
            {p.finalizada && (
              <button className="btn ghost" style={btnSmall} onClick={() => setEditando(false)}>
                Cancelar
              </button>
            )}
          </div>
        ) : (
          <div className="row partida-acoes">
            <div className="placar">
              <span className={p.sets_a > p.sets_b ? "ganhou" : "perdeu"}>{p.sets_a}</span>
              {" : "}
              <span className={p.sets_b > p.sets_a ? "ganhou" : "perdeu"}>{p.sets_b}</span>
            </div>
            <button className="btn ghost" style={btnSmall} onClick={abrirEdicao}>Editar</button>
          </div>
        )}

        <div className="lado b" onClick={aoTocarLado(1)} title={tituloSaque}>
          {saca === 1 && <MarcaSaque />}
          <span className="nome" style={estiloNome(1)}>{nomeB}</span>
          <span className="avatar">{nomeB[0]?.toUpperCase()}</span>
        </div>

        {onApagar && (
          <button
            className="btn ghost"
            style={{ ...btnSmall, color: "var(--loss)", display: "inline-flex", alignItems: "center", padding: "6px 10px" }}
            onClick={() => onApagar(p)}
            aria-label="Apagar esta partida"
            title="Apagar esta partida"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* ===== MOBILE (<= 760px): cada jogador na sua linha com o placar do lado ===== */}
      <div className="pc-mobile">
        <div className="pc-row">
          <span className="pc-jogador" onClick={aoTocarLado(0)} title={tituloSaque}>
            <span className="avatar">{nomeA[0]?.toUpperCase()}</span>
            <span className="nome" style={estiloNome(0)}>{nomeA}</span>
            {saca === 0 && <MarcaSaque />}
          </span>
          {emEdicao ? (
            <Stepper valor={placar.a} onPasso={(v) => passo("a", v)} onDigitar={(v) => digitar("a", v)} disabled={precisaEscolherSaque} />
          ) : (
            <span className={`pc-score ${p.sets_a > p.sets_b ? "ganhou" : "perdeu"}`}>{p.sets_a}</span>
          )}
        </div>

        <div className="pc-row">
          <span className="pc-jogador" onClick={aoTocarLado(1)} title={tituloSaque}>
            <span className="avatar">{nomeB[0]?.toUpperCase()}</span>
            <span className="nome" style={estiloNome(1)}>{nomeB}</span>
            {saca === 1 && <MarcaSaque />}
          </span>
          {emEdicao ? (
            <Stepper valor={placar.b} onPasso={(v) => passo("b", v)} onDigitar={(v) => digitar("b", v)} disabled={precisaEscolherSaque} />
          ) : (
            <span className={`pc-score ${p.sets_b > p.sets_a ? "ganhou" : "perdeu"}`}>{p.sets_b}</span>
          )}
        </div>

        <div className="pc-acoes">
          {emEdicao ? (
            <>
              <button className="btn ghost" style={btnSmall} onClick={salvar}>Salvar</button>
              {p.finalizada && (
                <button className="btn ghost" style={btnSmall} onClick={() => setEditando(false)}>
                  Cancelar
                </button>
              )}
            </>
          ) : (
            <button className="btn ghost" style={btnSmall} onClick={abrirEdicao}>Editar</button>
          )}
          {onApagar && (
            <button
              className="btn ghost"
              style={{ ...btnSmall, color: "var(--loss)", display: "inline-flex", alignItems: "center", padding: "6px 10px" }}
              onClick={() => onApagar(p)}
              aria-label="Apagar esta partida"
              title="Apagar esta partida"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MarcaSaque() {
  return (
    <span
      title="Saque"
      aria-label="Saque"
      style={{
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: "var(--accent)",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

// Stepper de placar: [−] valor [+]. Sem limite superior (>= 0).
// disabled trava os botoes e o input (usado enquanto o saque nao foi escolhido).
function Stepper({
  valor,
  onPasso,
  onDigitar,
  disabled,
}: {
  valor: string;
  onPasso: (v: string) => void;
  onDigitar: (v: string) => void;
  disabled?: boolean;
}) {
  const n = parseInt(valor, 10);
  const num = isNaN(n) ? 0 : n;
  const clamp = (v: number) => String(Math.max(MIN_PLACAR, v));

  return (
    <div className="stepper" aria-disabled={disabled}>
      <button
        type="button"
        className="stepper-btn"
        disabled={disabled}
        onClick={() => onPasso(clamp(num - 1))}
        aria-label="menos"
      >
        −
      </button>
      <input
        className="score-input"
        inputMode="numeric"
        placeholder="0"
        value={valor}
        disabled={disabled}
        onChange={(e) => {
          const so = e.target.value.replace(/\D/g, "");
          onDigitar(so === "" ? "" : clamp(parseInt(so, 10)));
        }}
      />
      <button
        type="button"
        className="stepper-btn"
        disabled={disabled}
        onClick={() => onPasso(clamp(num + 1))}
        aria-label="mais"
      >
        +
      </button>
    </div>
  );
}
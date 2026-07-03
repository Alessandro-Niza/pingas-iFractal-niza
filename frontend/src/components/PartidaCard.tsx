import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api, type Partida } from "../api";

const MIN_PLACAR = 0;

const setFinalizado = (a: number, b: number) =>
  (a >= 11 || b >= 11) && Math.abs(a - b) >= 2;

function quemSaca(a: number, b: number, starter: 0 | 1): 0 | 1 {
  const total = a + b;
  const deuce = a >= 10 && b >= 10;
  const turno = deuce ? total % 2 : Math.floor(total / 2) % 2;
  return turno === 0 ? starter : ((1 - starter) as 0 | 1);
}

const setsParaVencer = (melhorDe: number) => Math.floor(melhorDe / 2) + 1;

const starterDoSet = (starter: 0 | 1, numero: number): 0 | 1 =>
  (((starter + (numero - 1)) % 2) as 0 | 1);

const btnSmall = { padding: "6px 12px", fontSize: "0.85rem" } as const;

/**
 * Card de uma partida em "melhor de N sets".
 *  - melhor_de = 1  -> fase de grupos (set unico) [legado; grupos agora usam 3]
 *  - melhor_de = 3/5 -> serie (grupos bo3, semis bo3, final bo5)
 *
 * Saque persistido no backend (p.saca_inicial): sobrevive a reload.
 * Destaque de vencedor: nome + parciais ganhos em AZUL (var(--accent)).
 * A taca (🏆) NAO aparece mais por partida — fica so no banner do campeao do torneio.
 */
export function PartidaCard({
  partida: p,
  nomeDe,
  onMudou,
  onApagar,
  onErro,
  onLimparErro,
}: {
  partida: Partida;
  nomeDe: (id: number) => string;
  onMudou: () => void;
  onApagar?: (p: Partida) => void;
  onErro?: (msg: string) => void;
  onLimparErro?: () => void;
}) {
  const [placar, setPlacar] = useState<{ a: string; b: string }>({ a: "", b: "" });
  const [editando, setEditando] = useState(false);
  const [edits, setEdits] = useState<Record<number, { a: string; b: string }>>({});

  const melhorDe = p.melhor_de;
  const jogados = p.sets;
  const numeroAtual = jogados.length + 1;
  const fin = p.finalizada;
  const podeSaque = !fin && !editando;

  const sacaInicial: 0 | 1 | null =
    p.saca_inicial === 0 || p.saca_inicial === 1 ? (p.saca_inicial as 0 | 1) : null;

  const precisaEscolherSaque = podeSaque && numeroAtual === 1 && sacaInicial === null;

  const aLive = parseInt(placar.a || "0", 10);
  const bLive = parseInt(placar.b || "0", 10);
  const starterAtual =
    sacaInicial === null ? null : starterDoSet(sacaInicial, numeroAtual);
  const saca: 0 | 1 | null =
    podeSaque && starterAtual !== null ? quemSaca(aLive, bLive, starterAtual) : null;

  // vencedor (so quando finalizada): 0 se A venceu, 1 se B
  const venceu: 0 | 1 | null = !fin
    ? null
    : p.sets_a > p.sets_b
    ? 0
    : p.sets_b > p.sets_a
    ? 1
    : null;

  const placarCab =
    melhorDe === 1 && jogados[0]
      ? `${jogados[0].pontos_a} : ${jogados[0].pontos_b}`
      : `${p.sets_a} : ${p.sets_b}`;

  const nomeA = nomeDe(p.jogador_a_id);
  const nomeB = nomeDe(p.jogador_b_id);

  async function gravarSet(numero: number, a: number, b: number) {
    try {
      await api.registrarSet(p.id, numero, a, b);
      setPlacar({ a: "", b: "" });
      onMudou();
    } catch (e) {
      onErro?.((e as Error).message);
    }
  }

  function passo(lado: "a" | "b", valor: string) {
    if (precisaEscolherSaque) {
      onErro?.("Necessário escolher quem começa sacando.");
      return;
    }
    const novo = { ...placar, [lado]: valor };
    setPlacar(novo);
    const a = parseInt(novo.a || "0", 10);
    const b = parseInt(novo.b || "0", 10);
    if (setFinalizado(a, b)) gravarSet(numeroAtual, a, b);
  }

  function digitar(lado: "a" | "b", valor: string) {
    setPlacar((prev) => ({ ...prev, [lado]: valor }));
  }

  function salvarManual() {
    if (precisaEscolherSaque) {
      onErro?.("Necessário escolher quem começa sacando.");
      return;
    }
    const a = parseInt(placar.a, 10);
    const b = parseInt(placar.b, 10);
    if (isNaN(a) || isNaN(b)) {
      onErro?.("Preencha os dois placares.");
      return;
    }
    if (!setFinalizado(a, b)) {
      onErro?.("Set ainda não terminou. Em 10 × 10, vence quem abrir 2 pontos de vantagem.");
      return;
    }
    gravarSet(numeroAtual, a, b);
  }

  async function escolherSaque(lado: 0 | 1) {
    onLimparErro?.();
    try {
      await api.definirSaque(p.id, lado);
      onMudou();
    } catch (e) {
      onErro?.((e as Error).message);
    }
  }

  function abrirEdicao() {
    const m: Record<number, { a: string; b: string }> = {};
    for (const s of jogados) m[s.numero] = { a: String(s.pontos_a), b: String(s.pontos_b) };
    setEdits(m);
    setEditando(true);
  }

  async function salvarEdicaoSet(numero: number) {
    const e = edits[numero];
    const a = parseInt(e?.a ?? "", 10);
    const b = parseInt(e?.b ?? "", 10);
    if (isNaN(a) || isNaN(b)) {
      onErro?.("Preencha os dois placares.");
      return;
    }
    if (!setFinalizado(a, b)) {
      onErro?.("Set inválido. Em 10 × 10, vence quem abrir 2 pontos de vantagem.");
      return;
    }
    try {
      await api.registrarSet(p.id, numero, a, b);
      onMudou();
    } catch (err) {
      onErro?.((err as Error).message);
    }
  }

  // destaque do nome: vencedor OU sacador em azul (accent). antes o vencedor era verde.
  const estiloNome = (lado: 0 | 1) =>
    ({
      color: venceu === lado || saca === lado ? "var(--accent)" : undefined,
      fontWeight: venceu === lado || saca === lado ? 700 : undefined,
      cursor: podeSaque ? "pointer" : undefined,
      textDecoration: precisaEscolherSaque ? "underline dotted" : undefined,
      textDecorationColor: "var(--muted-2)",
      textUnderlineOffset: 4,
    }) as const;

  const aoTocar = (lado: 0 | 1) => (podeSaque ? () => escolherSaque(lado) : undefined);
  const titulo = podeSaque ? "Tocar pra marcar quem saca primeiro" : undefined;

  const botaoApagar = onApagar ? (
    <button
      className="btn ghost"
      style={{ ...btnSmall, color: "var(--loss)", display: "inline-flex", alignItems: "center", padding: "6px 10px" }}
      onClick={() => onApagar(p)}
      aria-label="Apagar esta partida"
      title="Apagar esta partida"
    >
      <Trash2 size={16} />
    </button>
  ) : null;

  return (
    <div className={`partida ${fin ? "feita" : ""} ${p.fase === "mata" ? "is-mata" : ""}`}>
      <div className="pc-cab">
        <span className="pc-jogador" onClick={aoTocar(0)} title={titulo}>
          <span className="avatar">{nomeA[0]?.toUpperCase()}</span>
          <span className="nome" style={estiloNome(0)}>{nomeA}</span>
          {saca === 0 && <MarcaSaque />}
        </span>

        <span className="pc-cab-meio">
          {fin && !editando ? (
            <span className="placar">{placarCab}</span>
          ) : melhorDe > 1 ? (
            <span className="pc-melhor-de">melhor de {melhorDe}</span>
          ) : null}
        </span>

        <span className="pc-jogador b" onClick={aoTocar(1)} title={titulo}>
          {saca === 1 && <MarcaSaque />}
          <span className="nome" style={estiloNome(1)}>{nomeB}</span>
          <span className="avatar">{nomeB[0]?.toUpperCase()}</span>
        </span>
      </div>

      {melhorDe > 1 && !editando && jogados.length > 0 && (
        <div className="pc-sets">
          {jogados.map((s) => (
            <span key={s.numero} className="pc-set-chip" title={`Set ${s.numero}`}>
              <span className={s.pontos_a > s.pontos_b ? "ganhou" : "perdeu"}>{s.pontos_a}</span>
              {"-"}
              <span className={s.pontos_b > s.pontos_a ? "ganhou" : "perdeu"}>{s.pontos_b}</span>
            </span>
          ))}
        </div>
      )}

      {editando ? (
        <div className="pc-edicao">
          {jogados.map((s) => {
            const e = edits[s.numero] ?? { a: String(s.pontos_a), b: String(s.pontos_b) };
            const set = (campo: "a" | "b") => (v: string) =>
              setEdits((prev) => ({ ...prev, [s.numero]: { ...e, [campo]: v } }));
            return (
              <div className="row partida-acoes" key={s.numero}>
                {melhorDe > 1 && <span className="pc-set-label">Set {s.numero}</span>}
                <Stepper valor={e.a} onPasso={set("a")} onDigitar={set("a")} />
                <span className="vs">x</span>
                <Stepper valor={e.b} onPasso={set("b")} onDigitar={set("b")} />
                <button className="btn ghost" style={btnSmall} onClick={() => salvarEdicaoSet(s.numero)}>
                  Salvar
                </button>
              </div>
            );
          })}
          <button className="btn ghost" style={btnSmall} onClick={() => setEditando(false)}>
            Concluir
          </button>
        </div>
      ) : fin ? (
        <div className="row partida-acoes">
          <button className="btn ghost" style={btnSmall} onClick={abrirEdicao}>Editar</button>
          {botaoApagar}
        </div>
      ) : (
        <div className="pc-set-atual">
          {melhorDe > 1 && <span className="pc-set-label">Set {numeroAtual}</span>}
          <div className="row partida-acoes">
            <Stepper valor={placar.a} onPasso={(v) => passo("a", v)} onDigitar={(v) => digitar("a", v)} travado={precisaEscolherSaque} />
            <span className="vs">x</span>
            <Stepper valor={placar.b} onPasso={(v) => passo("b", v)} onDigitar={(v) => digitar("b", v)} travado={precisaEscolherSaque} />
            <button className="btn ghost" style={btnSmall} onClick={salvarManual}>Salvar</button>
            {botaoApagar}
          </div>
        </div>
      )}
    </div>
  );
}

function MarcaSaque() {
  return <span className="marca-saque" title="Saca primeiro" aria-label="Saca primeiro" />;
}

function Stepper({
  valor,
  onPasso,
  onDigitar,
  travado,
}: {
  valor: string;
  onPasso: (v: string) => void;
  onDigitar: (v: string) => void;
  travado?: boolean;
}) {
  const n = parseInt(valor, 10);
  const num = isNaN(n) ? 0 : n;
  const clamp = (v: number) => String(Math.max(MIN_PLACAR, v));

  return (
    <div className={`stepper ${travado ? "travado" : ""}`} aria-disabled={travado}>
      <button type="button" className="stepper-btn" onClick={() => onPasso(clamp(num - 1))} aria-label="menos">
        −
      </button>
      <input
        className="score-input"
        inputMode="numeric"
        placeholder="0"
        value={valor}
        readOnly={travado}
        onChange={(e) => {
          const so = e.target.value.replace(/\D/g, "");
          onDigitar(so === "" ? "" : clamp(parseInt(so, 10)));
        }}
      />
      <button type="button" className="stepper-btn" onClick={() => onPasso(clamp(num + 1))} aria-label="mais">
        +
      </button>
    </div>
  );
}
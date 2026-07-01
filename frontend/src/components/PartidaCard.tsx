import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api, type Partida } from "../api";

const MIN_PLACAR = 0;

// um SET terminou: alguem chegou a 11+ E abriu 2 de vantagem (deuce sem limite)
const setFinalizado = (a: number, b: number) =>
  (a >= 11 || b >= 11) && Math.abs(a - b) >= 2;

// quem saca DENTRO de um set, pela regra oficial:
//  - ate 9-9: 2 saques pra cada, alternando
//  - de 10-10 (deuce) em diante: 1 saque pra cada, alternando
function quemSaca(a: number, b: number, starter: 0 | 1): 0 | 1 {
  const total = a + b;
  const deuce = a >= 10 && b >= 10;
  const turno = deuce ? total % 2 : Math.floor(total / 2) % 2;
  return turno === 0 ? starter : ((1 - starter) as 0 | 1);
}

// sets necessarios pra vencer a partida (melhor de N): 1->1, 3->2, 5->3
const setsParaVencer = (melhorDe: number) => Math.floor(melhorDe / 2) + 1;

// quem ABRE o saque do set `numero`. Regra oficial: alterna a cada set.
// >>> ponto de troca facil: o usuario escolhe so o sacador do set 1;
//     os demais saem derivados daqui. Se um dia quiser escolher set a set,
//     e aqui que mexe.
const starterDoSet = (starter: 0 | 1, numero: number): 0 | 1 =>
  (((starter + (numero - 1)) % 2) as 0 | 1);

const btnSmall = { padding: "6px 12px", fontSize: "0.85rem" } as const;

/**
 * Card de uma partida em "melhor de N sets".
 *  - melhor_de = 1  -> fase de grupos (set unico, como sempre foi)
 *  - melhor_de = 3/5 -> mata-mata (serie de sets)
 *
 * Estados visuais:
 *  - AO VIVO (nao finalizada): mostra os sets ja jogados + o set ATUAL num stepper.
 *    Ao fechar o set (11 + vantagem 2) salva sozinho; o backend recalcula e diz
 *    se a partida acabou ou se abre o proximo set.
 *  - FINALIZADA: mostra o agregado (pontos no bo1, sets no bo3/5) + botao Editar.
 *  - EDICAO: cada set vira um stepper editavel com Salvar proprio.
 *
 * Saque: escolhe-se UMA vez (set 1, tocando no nome); os sets seguintes
 * alternam o sacador automaticamente. Enquanto o set 1 nao tem saque escolhido,
 * o stepper aparece travado e tocar nele exibe um aviso (limpo via onLimparErro).
 *
 * Layout: a classe `is-mata` (quando p.fase === "mata") permite ao CSS
 * centralizar os parciais e as acoes so no mata-mata, sem afetar os grupos.
 * As acoes (Editar + lixeira) ficam JUNTAS em .partida-acoes pra alinharem lado a lado.
 *
 * >>> Limitacao conhecida: sacaInicial vive so no front (nao e persistido).
 *     Se a pagina for recarregada no meio de uma serie, o indicador de saque
 *     some nos sets seguintes (a pontuacao continua funcionando normalmente).
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
  // set "ao vivo" sendo digitado agora
  const [placar, setPlacar] = useState<{ a: string; b: string }>({ a: "", b: "" });
  // saque do set 1 (os outros alternam); escolhido tocando no nome
  const [sacaInicial, setSacaInicial] = useState<0 | 1 | undefined>(undefined);
  // edicao de partida finalizada: numero do set -> placar em string
  const [editando, setEditando] = useState(false);
  const [edits, setEdits] = useState<Record<number, { a: string; b: string }>>({});

  // ----- derivados -----
  const melhorDe = p.melhor_de;
  const alvo = setsParaVencer(melhorDe);
  const jogados = p.sets;                  // sets ja salvos, em ordem
  const numeroAtual = jogados.length + 1;  // set que esta sendo digitado agora
  const fin = p.finalizada;
  const podeSaque = !fin && !editando;

  // saque so precisa ser escolhido no SET 1; depois alterna sozinho
  const precisaEscolherSaque = podeSaque && numeroAtual === 1 && sacaInicial === undefined;

  const aLive = parseInt(placar.a || "0", 10);
  const bLive = parseInt(placar.b || "0", 10);
  const starterAtual =
    sacaInicial === undefined ? undefined : starterDoSet(sacaInicial, numeroAtual);
  const saca: 0 | 1 | null =
    podeSaque && starterAtual !== undefined ? quemSaca(aLive, bLive, starterAtual) : null;

  // placar mostrado no cabecalho quando finalizada:
  //  - bo1: os PONTOS do set unico (ex: 11 : 8)
  //  - bo3/5: a contagem de SETS (ex: 2 : 1)
  const placarCab =
    melhorDe === 1 && jogados[0]
      ? `${jogados[0].pontos_a} : ${jogados[0].pontos_b}`
      : `${p.sets_a} : ${p.sets_b}`;

  const nomeA = nomeDe(p.jogador_a_id);
  const nomeB = nomeDe(p.jogador_b_id);

  // ----- acoes -----
  async function gravarSet(numero: number, a: number, b: number) {
    try {
      await api.registrarSet(p.id, numero, a, b);
      setPlacar({ a: "", b: "" }); // zera pro proximo set comecar limpo
      onMudou();
    } catch (e) {
      onErro?.((e as Error).message);
    }
  }

  // +/- ao vivo no set atual: atualiza e, se o set fechou, salva sozinho
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

  // digitacao manual: NAO dispara auto-save
  function digitar(lado: "a" | "b", valor: string) {
    setPlacar((prev) => ({ ...prev, [lado]: valor }));
  }

  // botao Salvar do set atual (quando o placar foi digitado em vez de +/-)
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

  // escolhe o sacador do set 1 e limpa o aviso (a condicao do erro deixou de existir)
  function escolherSaque(lado: 0 | 1) {
    setSacaInicial(lado);
    onLimparErro?.();
  }

  // ----- edicao de partida finalizada -----
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

  const estiloNome = (lado: 0 | 1) =>
    ({
      color: saca === lado ? "var(--accent)" : undefined,
      fontWeight: saca === lado ? 600 : undefined,
      cursor: podeSaque ? "pointer" : undefined,
      // dica visual de "toque pra escolher" so enquanto falta escolher o saque do set 1
      textDecoration: precisaEscolherSaque ? "underline dotted" : undefined,
      textDecorationColor: "var(--muted-2)",
      textUnderlineOffset: 4,
    }) as const;

  const aoTocar = (lado: 0 | 1) => (podeSaque ? () => escolherSaque(lado) : undefined);
  const titulo = podeSaque ? "Tocar pra marcar quem saca primeiro" : undefined;

  // botao lixeira (reusado no bloco de acoes); so aparece se onApagar veio (grupos)
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
      {/* cabecalho: jogadores + (se finalizada) placar agregado */}
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

      {/* breakdown dos sets ja jogados (so faz sentido em serie) */}
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

      {/* corpo: edicao | (finalizada -> Editar + lixeira) | set atual ao vivo */}
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
// travado: aparencia de bloqueado, mas os botoes seguem clicaveis de
// proposito — pra que o clique caia no guard do pai e exiba o aviso.
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
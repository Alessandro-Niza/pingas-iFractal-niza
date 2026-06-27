import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, type Jogador, type Partida, type Modo } from "../api";

const GRUPOS = ["A", "B", "C", "D"];
// Sem limite superior (regra oficial: deuce continua ate abrir 2 de vantagem).
const MIN_PLACAR = 0;

// jogo terminou: alguem chegou a 11+ E abriu 2 de vantagem
const ehFinalizado = (a: number, b: number) =>
  (a >= 11 || b >= 11) && Math.abs(a - b) >= 2;

// quem saca, pela regra oficial:
//  - ate 9-9: 2 saques pra cada, alternando
//  - de 10-10 (deuce) em diante: 1 saque pra cada, alternando
// starter = quem comecou sacando (0 = jogador A, 1 = jogador B)
function quemSaca(a: number, b: number, starter: 0 | 1): 0 | 1 {
  const total = a + b;
  const deuce = a >= 10 && b >= 10;
  const turno = deuce ? total % 2 : Math.floor(total / 2) % 2;
  return turno === 0 ? starter : ((1 - starter) as 0 | 1);
}

// raquete (mesmo desenho do logo) — lucide nao tem ping-pong, entao reusamos a marca
function Raquete({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10" cy="9" r="6.5" fill="currentColor" opacity="0.9" />
      <rect
        x="13.5"
        y="13"
        width="3"
        height="8"
        rx="1.5"
        transform="rotate(-45 13.5 13)"
        fill="currentColor"
      />
    </svg>
  );
}

export function Partidas() {
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [modo, setModo] = useState<Modo>("pontos_corridos");
  const [modoEf, setModoEf] = useState<Modo>("pontos_corridos");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const [placar, setPlacar] = useState<Record<number, { a: string; b: string }>>({});
  const [editando, setEditando] = useState<Record<number, boolean>>({});
  // quem comecou sacando em cada partida (0 = lado A, 1 = lado B). Efemero (so durante o jogo).
  const [sacaInicial, setSacaInicial] = useState<Record<number, 0 | 1>>({});

  function recarregar() {
    Promise.all([api.listarJogadores(), api.listarPartidas(), api.lerConfig()])
      .then(([js, ps, cfg]) => {
        setJogadores(js);
        setPartidas(ps);
        setModo(cfg.modo);
        setModoEf(cfg.modo_efetivo);
      })
      .catch((e) => setErro(e.message));
  }

  useEffect(() => {
    const ac = new AbortController();
    let tentativas = 0;
    async function carregar() {
      if (ac.signal.aborted) return;
      try {
        const [js, ps, cfg] = await Promise.all([
          api.listarJogadores(ac.signal),
          api.listarPartidas(ac.signal),
          api.lerConfig(ac.signal),
        ]);
        setJogadores(js);
        setPartidas(ps);
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

  const nomeDe = (id: number) => jogadores.find((j) => j.id === id)?.nome ?? "?";
  const grupoDe = (id: number) => jogadores.find((j) => j.id === id)?.grupo ?? null;
  // grupo "dono" da partida = grupo comum aos dois jogadores (ou null se cruzado)
  const grupoDaPartida = (p: Partida) => {
    const ga = grupoDe(p.jogador_a_id);
    const gb = grupoDe(p.jogador_b_id);
    return ga && ga === gb ? ga : null;
  };

  async function gerarConfrontos() {
    setErro("");
    setOcupado(true);
    try {
      const chave = (x: number, y: number) => [x, y].sort((a, b) => a - b).join("-");
      const existe = new Set(partidas.map((p) => chave(p.jogador_a_id, p.jogador_b_id)));
      for (let i = 0; i < jogadores.length; i++) {
        for (let k = i + 1; k < jogadores.length; k++) {
          const ja = jogadores[i];
          const jb = jogadores[k];
          if (modo === "grupos" && (!ja.grupo || ja.grupo !== jb.grupo)) continue;
          if (!existe.has(chave(ja.id, jb.id))) {
            await api.criarPartida(ja.id, jb.id);
          }
        }
      }
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  // grava o resultado no backend (usado pelo auto-save e pelo botao Salvar)
  async function gravar(id: number, a: number, b: number) {
    setErro("");
    try {
      await api.registrarResultado(id, a, b);
      setEditando((prev) => ({ ...prev, [id]: false }));
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // botao "Salvar" (caminho de digitacao): valida antes de gravar
  async function salvarResultado(id: number) {
    const p = placar[id];
    if (!p) return;
    const a = parseInt(p.a, 10);
    const b = parseInt(p.b, 10);
    if (isNaN(a) || isNaN(b)) {
      setErro("Preencha os dois placares.");
      return;
    }
    if (!ehFinalizado(a, b)) {
      setErro(
        "Partida ainda não terminou. Em caso de 10 × 10, vence quem abrir 2 pontos de vantagem."
      );
      return;
    }
    gravar(id, a, b);
  }

  // +/− do stepper (caminho ao vivo): atualiza e, se finalizou, SALVA sozinho
  function passo(id: number, lado: "a" | "b", valor: string) {
    const atual = placar[id] ?? { a: "0", b: "0" };
    const novo = { ...atual, [lado]: valor };
    setPlacar((prev) => ({ ...prev, [id]: novo }));

    const a = parseInt(novo.a || "0", 10);
    const b = parseInt(novo.b || "0", 10);
    if (ehFinalizado(a, b)) {
      gravar(id, a, b);
    }
  }

  async function apagar(p: Partida) {
    const ok = window.confirm(
      `Apagar a partida ${nomeDe(p.jogador_a_id)} x ${nomeDe(p.jogador_b_id)}?`
    );
    if (!ok) return;
    setErro("");
    try {
      await api.deletarPartida(p.id);
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function limparTudo() {
    const ok = window.confirm(
      `Apagar TODAS as ${partidas.length} partidas? (os jogadores e grupos são mantidos)`
    );
    if (!ok) return;
    setErro("");
    try {
      await api.limparPartidas();
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function abrirEdicao(p: Partida) {
    setPlacar((prev) => ({ ...prev, [p.id]: { a: String(p.sets_a), b: String(p.sets_b) } }));
    setEditando((prev) => ({ ...prev, [p.id]: true }));
  }

  function cancelarEdicao(id: number) {
    setEditando((prev) => ({ ...prev, [id]: false }));
  }

  // digitacao manual no campo: NAO dispara auto-save (evita salvar 11x0 sem querer)
  function digitar(id: number, lado: "a" | "b", valor: string) {
    setPlacar((prev) => {
      const atual = prev[id] ?? { a: "", b: "" };
      return { ...prev, [id]: { ...atual, [lado]: valor } };
    });
  }

  const ehGrupos = modoEf === "grupos";
  const fallbackGrupos = modo === "grupos" && modoEf !== "grupos";
  const podeGerar = ehGrupos || jogadores.length >= 2;
  const btnSmall = { padding: "6px 12px", fontSize: "0.85rem" } as const;

  // marca de saque (raquete) em destaque azul
  function MarcaSaque() {
    return (
      <span style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center" }} title="Saque">
        <Raquete size={14} />
      </span>
    );
  }

  function renderPartida(p: Partida) {
    const emEdicao = !p.finalizada || editando[p.id];
    const podeSaque = !p.finalizada; // indicador de saque so faz sentido no jogo ao vivo
    const starter = sacaInicial[p.id];

    // placar atual (dos steppers) pra calcular o saque
    const a = parseInt(placar[p.id]?.a || "0", 10);
    const b = parseInt(placar[p.id]?.b || "0", 10);
    const saca: 0 | 1 | null =
      podeSaque && starter !== undefined ? quemSaca(a, b, starter) : null;

    const nomeA = nomeDe(p.jogador_a_id);
    const nomeB = nomeDe(p.jogador_b_id);

    const estiloNome = (lado: 0 | 1) =>
      ({
        color: saca === lado ? "var(--accent)" : undefined,
        fontWeight: saca === lado ? 700 : undefined,
        cursor: podeSaque ? "pointer" : undefined,
        textDecoration:
          podeSaque && starter === undefined ? "underline dotted" : undefined,
        textUnderlineOffset: 3,
      }) as const;
    const estiloAvatar = (lado: 0 | 1) =>
      saca === lado ? ({ boxShadow: "0 0 0 2px var(--accent)" } as const) : undefined;
    const aoTocarLado = (lado: 0 | 1) =>
      podeSaque
        ? () => setSacaInicial((prev) => ({ ...prev, [p.id]: lado }))
        : undefined;
    const tituloSaque = podeSaque ? "Tocar pra marcar quem saca primeiro" : undefined;

    return (
      <div key={p.id} className={`partida ${p.finalizada ? "feita" : ""}`}>
        <div className="lado" onClick={aoTocarLado(0)} title={tituloSaque}>
          <span className="avatar" style={estiloAvatar(0)}>{nomeA[0]?.toUpperCase()}</span>
          <span className="nome" style={estiloNome(0)}>{nomeA}</span>
          {saca === 0 && <MarcaSaque />}
        </div>

        {emEdicao ? (
          <div className="row" style={{ flexWrap: "nowrap", alignItems: "center" }}>
            <Stepper
              valor={placar[p.id]?.a ?? ""}
              onPasso={(v) => passo(p.id, "a", v)}
              onDigitar={(v) => digitar(p.id, "a", v)}
            />
            <span className="vs">x</span>
            <Stepper
              valor={placar[p.id]?.b ?? ""}
              onPasso={(v) => passo(p.id, "b", v)}
              onDigitar={(v) => digitar(p.id, "b", v)}
            />
            <button className="btn ghost" style={btnSmall} onClick={() => salvarResultado(p.id)}>
              Salvar
            </button>
            {p.finalizada && (
              <button className="btn ghost" style={btnSmall} onClick={() => cancelarEdicao(p.id)}>
                Cancelar
              </button>
            )}
          </div>
        ) : (
          <div className="row" style={{ flexWrap: "nowrap", alignItems: "center" }}>
            <div className="placar">
              <span className={p.sets_a > p.sets_b ? "ganhou" : "perdeu"}>{p.sets_a}</span>
              {" : "}
              <span className={p.sets_b > p.sets_a ? "ganhou" : "perdeu"}>{p.sets_b}</span>
            </div>
            <button className="btn ghost" style={btnSmall} onClick={() => abrirEdicao(p)}>
              Editar
            </button>
          </div>
        )}

        <div className="lado b" onClick={aoTocarLado(1)} title={tituloSaque}>
          {saca === 1 && <MarcaSaque />}
          <span className="nome" style={estiloNome(1)}>{nomeB}</span>
          <span className="avatar" style={estiloAvatar(1)}>{nomeB[0]?.toUpperCase()}</span>
        </div>

        <button
          className="btn ghost"
          style={{ ...btnSmall, color: "var(--loss)", display: "inline-flex", alignItems: "center", padding: "6px 10px" }}
          onClick={() => apagar(p)}
          aria-label="Apagar esta partida"
          title="Apagar esta partida"
        >
          <Trash2 size={16} />
        </button>
      </div>
    );
  }

  return (
    <section className="card">
      <h2 className="card-title">
        Partidas {ehGrupos ? "· fase de grupos" : "· pontos corridos"}
      </h2>

      {fallbackGrupos && (
        <p
          style={{
            margin: "10px 0 0",
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
      )}

      <div className="row">
        <button
          className="btn"
          onClick={gerarConfrontos}
          disabled={!podeGerar || ocupado}
          title="Cria todos os confrontos que ainda faltam, sem duplicar os existentes"
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <Raquete />
          {ocupado
            ? "Gerando…"
            : ehGrupos
            ? "Gerar confrontos dos grupos"
            : "Gerar confrontos (todos contra todos)"}
        </button>
        {partidas.length > 0 && (
          <button
            className="btn ghost"
            style={{ color: "var(--loss)", display: "inline-flex", alignItems: "center", gap: 8 }}
            onClick={limparTudo}
            disabled={ocupado}
            title="Apaga TODAS as partidas (mantém jogadores e grupos)"
          >
            <Trash2 size={16} />
            Limpar todas as partidas
          </button>
        )}
      </div>
      {!podeGerar && (
        <p className="vazio">
          {ehGrupos
            ? "Monte grupos com pelo menos 2 jogadores (aba Grupos) para gerar partidas."
            : "Cadastre pelo menos 2 jogadores para gerar partidas."}
        </p>
      )}

      {erro && <p className="erro">{erro}</p>}

      {partidas.length > 0 && (
        <div
          style={{
            overflowY: "auto",
            maxHeight: "calc(100dvh - 300px)",
            marginTop: 6,
            paddingRight: 6,
          }}
        >
          {ehGrupos ? (
            <>
              {GRUPOS.map((g) => {
                const lista = partidas.filter((p) => grupoDaPartida(p) === g);
                if (lista.length === 0) return null;
                return (
                  <div key={g} style={{ marginTop: 18 }}>
                    <div className="card-title" style={{ marginBottom: 8 }}>Grupo {g}</div>
                    <div className="lista">{lista.map(renderPartida)}</div>
                  </div>
                );
              })}
              {(() => {
                const outras = partidas.filter((p) => grupoDaPartida(p) === null);
                if (outras.length === 0) return null;
                return (
                  <div style={{ marginTop: 18 }}>
                    <div className="card-title" style={{ marginBottom: 8 }}>Outras (entre grupos)</div>
                    <div className="lista">{outras.map(renderPartida)}</div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="lista">{partidas.map(renderPartida)}</div>
          )}
        </div>
      )}
    </section>
  );
}

// Stepper de placar: [−] valor [+]. Sem limite superior (>= 0).
// onPasso = +/− (ao vivo, pode disparar auto-save no pai)
// onDigitar = digitacao no campo (nao dispara auto-save)
function Stepper({
  valor,
  onPasso,
  onDigitar,
}: {
  valor: string;
  onPasso: (v: string) => void;
  onDigitar: (v: string) => void;
}) {
  const n = parseInt(valor, 10);
  const num = isNaN(n) ? 0 : n;
  const clamp = (v: number) => String(Math.max(MIN_PLACAR, v));

  const btnStep = {
    width: 34,
    height: 38,
    display: "grid",
    placeItems: "center",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text)",
    fontSize: "1.1rem",
    fontWeight: 600,
    cursor: "pointer",
  } as const;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button type="button" style={btnStep} onClick={() => onPasso(clamp(num - 1))} aria-label="menos">
        −
      </button>
      <input
        className="score-input"
        inputMode="numeric"
        placeholder="0"
        value={valor}
        onChange={(e) => {
          const so = e.target.value.replace(/\D/g, "");
          onDigitar(so === "" ? "" : clamp(parseInt(so, 10)));
        }}
      />
      <button type="button" style={btnStep} onClick={() => onPasso(clamp(num + 1))} aria-label="mais">
        +
      </button>
    </div>
  );
}

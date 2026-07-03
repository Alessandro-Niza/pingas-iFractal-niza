import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api, type Modo } from "../api";

export function Configuracoes({ onModoChange }: { onModoChange?: (m: Modo) => void }) {
  const [modo, setModo] = useState<Modo>("pontos_corridos");
  const [modoEf, setModoEf] = useState<Modo>("pontos_corridos");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [recomecando, setRecomecando] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    let tentativas = 0;
    async function carregar() {
      if (ac.signal.aborted) return;
      try {
        const cfg = await api.lerConfig(ac.signal);
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

  // alterna o modo, com confirmacao e oferta de limpar partidas antigas
  async function alternarModo() {
    const novo: Modo = modo === "grupos" ? "pontos_corridos" : "grupos";
    const msg =
      novo === "grupos"
        ? "Ativar fase de grupos?\n\nA classificação passará a contar só os jogos dentro de cada grupo."
        : "Desativar fase de grupos?\n\nVolta para pontos corridos: todos numa classificação única.";
    if (!window.confirm(msg)) return;
    setErro("");
    try {
      const cfg = await api.definirModo(novo);
      setModo(cfg.modo);
      setModoEf(cfg.modo_efetivo);
      onModoChange?.(cfg.modo);
      const partidas = await api.listarPartidas();
      if (partidas.length > 0) {
        const limpar = window.confirm(
          `Você tem ${partidas.length} partida(s) do modo anterior que podem não encaixar no novo formato.\n\nLimpar todas as partidas agora e começar do zero? (jogadores e grupos são mantidos)`
        );
        if (limpar) await api.limparPartidas();
      }
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function reiniciar() {
    const ok = window.confirm(
      "Reiniciar o torneio?\n\nIsso apaga TODAS as partidas (fase de grupos e mata-mata). Os jogadores e os grupos são mantidos."
    );
    if (!ok) return;
    setErro("");
    setOcupado(true);
    try {
      await api.limparPartidas();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  // recomeca o mata-mata: apaga o chaveamento atual e remonta a partir dos classificados.
  // (migrou da aba Mata-mata pra ca — la ficou so o "Iniciar".)
  async function recomecarMata() {
    const ok = window.confirm(
      "Recomeçar o mata-mata?\n\nApaga o chaveamento atual e monta de novo a partir dos classificados da fase de grupos."
    );
    if (!ok) return;
    setErro("");
    setRecomecando(true);
    try {
      await api.iniciarMataMata();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setRecomecando(false);
    }
  }

  async function exportar() {
    setErro("");
    setExportando(true);
    try {
      const blob = await api.exportar();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Campeonato_iFractal_${new Date().getFullYear()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  const ehGrupos = modo === "grupos";
  const fallback = modo === "grupos" && modoEf !== "grupos";

  return (
    <>
      <section className="card">
        <h2 className="card-title">Modo do torneio</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Switch ligado={ehGrupos} onToggle={alternarModo} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 600 }}>Ativar fase de grupos</span>
            <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
              {ehGrupos
                ? "Ativado — confrontos e ranking por grupo"
                : "Desativado — pontos corridos (todos contra todos)"}
            </span>
          </div>
        </div>

        {fallback && (
          <p className="aviso">
            Fase de grupos selecionada, mas o campeonato está rodando em{" "}
            <strong>Pontos Corridos</strong>: todos os grupos devem possuir pelo menos
            2 jogadores para iniciar a fase de grupos.
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Exportar campeonato</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 14px", lineHeight: 1.5 }}>
          Baixa o campeonato como um pacote de páginas HTML (Classificação, Partidas e
          Mata-mata) que funcionam offline em qualquer navegador. Ótimo para imprimir,
          arquivar ou compartilhar o resultado.
        </p>
        <button
          className="btn ghost"
          data-testid="btn-exportar"
          onClick={exportar}
          disabled={exportando}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <Download size={16} />
          {exportando ? "Gerando…" : "Exportar campeonato"}
        </button>
      </section>

      <section className="card">
        <h2 className="card-title">Recomeçar mata-mata</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 14px", lineHeight: 1.5 }}>
          Apaga o chaveamento atual e monta o mata-mata de novo a partir dos
          classificados da fase de grupos. Útil se você corrigiu um resultado de
          grupo depois de já ter iniciado o mata-mata.
        </p>
        <button
          className="btn ghost"
          data-testid="btn-recomecar-mata"
          onClick={recomecarMata}
          disabled={recomecando}
        >
          {recomecando ? "Recomeçando…" : "Recomeçar mata-mata"}
        </button>
      </section>

      <section className="card">
        <h2 className="card-title">Reiniciar torneio</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 14px", lineHeight: 1.5 }}>
          Apaga todas as partidas (fase de grupos e mata-mata) para começar do zero.
          Os jogadores e os grupos continuam como estão.
        </p>
        <button
          className="btn ghost"
          style={{ color: "var(--loss)" }}
          data-testid="btn-reiniciar-torneio"
          onClick={reiniciar}
          disabled={ocupado}
        >
          {ocupado ? "Reiniciando…" : "Reiniciar torneio"}
        </button>
      </section>

      {erro && <p className="erro">{erro}</p>}
    </>
  );
}

function Switch({ ligado, onToggle }: { ligado: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label="Ativar fase de grupos"
      className="switch"
      onClick={onToggle}
    >
      <span className="switch__knob" />
    </button>
  );
}
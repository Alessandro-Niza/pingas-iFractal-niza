import { useEffect, useState } from "react";
import { api, type Jogador } from "../api";

export function Jogadores() {
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");

  // refresh simples apos criar/apagar (ja temos dados na tela, sem retry)
  function recarregar() {
    api.listarJogadores().then(setJogadores).catch((e) => setErro(e.message));
  }

  // carregamento inicial resiliente: cancela duplicata do StrictMode e
  // tenta de novo se o backend estiver reiniciando ou a rede engasgar
  useEffect(() => {
    const ac = new AbortController();
    let tentativas = 0;
    async function carregar() {
      if (ac.signal.aborted) return;
      try {
        setJogadores(await api.listarJogadores(ac.signal));
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

  async function adicionar() {
    const limpo = nome.trim();
    if (!limpo) return;
    setErro("");
    try {
      await api.criarJogador(limpo);
      setNome("");
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function apagar(j: Jogador) {
    const ok = window.confirm(
      `Apagar ${j.nome}?\n\nAs partidas desse jogador também serão removidas.`
    );
    if (!ok) return;
    setErro("");
    try {
      await api.deletarJogador(j.id);
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">Jogadores inscritos</h2>

      <div className="row">
        <input
          className="input-grow"
          placeholder="Nome do jogador"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && adicionar()}
        />
        <button className="btn" onClick={adicionar} disabled={!nome.trim()}>
          Adicionar
        </button>
      </div>

      {erro && <p className="erro">{erro}</p>}

      {jogadores.length === 0 ? (
        <p className="vazio">Nenhum jogador ainda. Adicione o primeiro acima.</p>
      ) : (
        <div className="lista">
          {jogadores.map((j) => (
            <div key={j.id} className="lista-item">
              <span className="avatar">{j.nome[0]?.toUpperCase()}</span>
              <span style={{ flex: 1 }}>{j.nome}</span>
              <button
                className="btn ghost"
                style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                onClick={() => apagar(j)}
              >
                Apagar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

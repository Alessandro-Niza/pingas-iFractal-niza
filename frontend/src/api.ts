// Tipos espelham os models Pydantic do backend.
export interface Jogador {
  id: number;
  nome: string;
  grupo: string | null;
}

export interface Partida {
  id: number;
  jogador_a_id: number;
  jogador_b_id: number;
  sets_a: number;
  sets_b: number;
  finalizada: boolean;
}

export interface LinhaClassificacao {
  jogador_id: number;
  nome: string;
  grupo: string | null;
  jogos: number;
  vitorias: number;
  derrotas: number;
  sets_ganhos: number;
  sets_perdidos: number;
  saldo_sets: number;
  pontos: number;
}

export type Modo = "pontos_corridos" | "grupos";

const API_BASE = import.meta.env.DEV ? "http://localhost:8000" : "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}));
    throw new Error(corpo.detail ?? `Erro ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // config / modo do torneio
  lerConfig: (signal?: AbortSignal) =>
    req<{ modo: Modo; modo_efetivo: Modo }>("/config", { signal }),
  definirModo: (modo: Modo) =>
    req<{ modo: Modo; modo_efetivo: Modo }>("/config", {
      method: "PUT",
      body: JSON.stringify({ modo }),
    }),

  // jogadores
  listarJogadores: (signal?: AbortSignal) => req<Jogador[]>("/jogadores", { signal }),
  criarJogador: (nome: string) =>
    req<Jogador>("/jogadores", { method: "POST", body: JSON.stringify({ nome }) }),
  definirGrupo: (id: number, grupo: string | null) =>
    req<Jogador>(`/jogadores/${id}/grupo`, {
      method: "PATCH",
      body: JSON.stringify({ grupo }),
    }),
  deletarJogador: (id: number) =>
    req<void>(`/jogadores/${id}`, { method: "DELETE" }),

  // partidas
  listarPartidas: (signal?: AbortSignal) => req<Partida[]>("/partidas", { signal }),
  criarPartida: (jogador_a_id: number, jogador_b_id: number) =>
    req<Partida>("/partidas", {
      method: "POST",
      body: JSON.stringify({ jogador_a_id, jogador_b_id }),
    }),
  registrarResultado: (id: number, sets_a: number, sets_b: number) =>
    req<Partida>(`/partidas/${id}/resultado`, {
      method: "PATCH",
      body: JSON.stringify({ sets_a, sets_b }),
    }),
  deletarPartida: (id: number) =>
    req<void>(`/partidas/${id}`, { method: "DELETE" }),
  limparPartidas: () => req<void>("/partidas", { method: "DELETE" }),

  // classificacao (ja vem ciente do modo, calculada no backend)
  classificacao: (signal?: AbortSignal) =>
    req<LinhaClassificacao[]>("/classificacao", { signal }),
};

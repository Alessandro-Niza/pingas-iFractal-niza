// Tipos espelham os models Pydantic do backend.
export interface Jogador {
  id: number;
  nome: string;
  grupo: string | null;
}

// Um set individual de uma partida (pontos daquele set).
export interface SetJogo {
  numero: number;
  pontos_a: number;
  pontos_b: number;
}

export interface Partida {
  id: number;
  jogador_a_id: number;
  jogador_b_id: number;
  sets_a: number;        // CACHE: sets VENCIDOS por A (nao mais pontos!)
  sets_b: number;        // CACHE: sets VENCIDOS por B
  finalizada: boolean;
  fase: "grupos" | "mata";
  rodada: number | null;
  melhor_de: number;     // 1 (grupos), 3 (semis), 5 (final)
  sets: SetJogo[];       // sets ja jogados, em ordem
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

const API_BASE = import.meta.env.DEV ? `http://${location.hostname}:8000` : "";

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
  lerConfig: (signal?: AbortSignal) =>
    req<{ modo: Modo; modo_efetivo: Modo }>("/config", { signal }),
  definirModo: (modo: Modo) =>
    req<{ modo: Modo; modo_efetivo: Modo }>("/config", {
      method: "PUT",
      body: JSON.stringify({ modo }),
    }),

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

  listarPartidas: (signal?: AbortSignal) => req<Partida[]>("/partidas", { signal }),
  criarPartida: (jogador_a_id: number, jogador_b_id: number) =>
    req<Partida>("/partidas", {
      method: "POST",
      body: JSON.stringify({ jogador_a_id, jogador_b_id }),
    }),
  // registra/edita UM set; o backend recalcula a partida e diz se acabou.
  // (substituiu o antigo registrarResultado, que mandava "o placar" de uma vez)
  registrarSet: (partidaId: number, numero: number, pontos_a: number, pontos_b: number) =>
    req<Partida>(`/partidas/${partidaId}/sets/${numero}`, {
      method: "PUT",
      body: JSON.stringify({ pontos_a, pontos_b }),
    }),
  deletarPartida: (id: number) =>
    req<void>(`/partidas/${id}`, { method: "DELETE" }),
  limparPartidas: () => req<void>("/partidas", { method: "DELETE" }),

  listarMataMata: (signal?: AbortSignal) => req<Partida[]>("/mata-mata", { signal }),
  iniciarMataMata: () => req<Partida[]>("/mata-mata/iniciar", { method: "POST" }),
  limparMataMata: () => req<void>("/mata-mata", { method: "DELETE" }),

  classificacao: (signal?: AbortSignal) =>
    req<LinhaClassificacao[]>("/classificacao", { signal }),

  exportar: async (): Promise<Blob> => {
    const res = await fetch(API_BASE + "/exportar");
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({}));
      throw new Error(corpo.detail ?? "Falha ao exportar o campeonato.");
    }
    return res.blob();
  },
};
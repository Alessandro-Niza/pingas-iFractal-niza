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
  melhor_de: number;     // gravado por partida no momento em que ela e criada
  sets: SetJogo[];       // sets ja jogados, em ordem
  saca_inicial: number | null;   // 0=A, 1=B, null=nao escolhido
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
  pontos_pro: number;
  pontos_contra: number;
  saldo_pontos: number;
  pontos: number;
}

export type Modo = "pontos_corridos" | "grupos";

// melhor_de configuravel por fase (opcoes oferecidas na UI)
export type MelhorDe = 3 | 5 | 7;

// tema visual (global). "auto" segue o sistema (claro=pure, escuro=nebula).
export type Tema = "eclipse" | "nebula" | "pure" | "auto";

export interface Config {
  modo: Modo;
  modo_efetivo: Modo;
  melhor_de_grupos: number;
  melhor_de_mata: number;
  melhor_de_final: number;
  tema: Tema;
}

// ---- estatisticas por jogador (espelham os models do backend) ----
export interface EstatVolume {
  jogos: number;
  vitorias: number;
  derrotas: number;
  aproveitamento: number;   // 0..1
  sets_ganhos: number;
  sets_perdidos: number;
  pontos_por_set: number;
  bagels_aplicados: number;
  bagels_sofridos: number;
  amostra_pequena: boolean;
}
export interface EstatH2H {
  adversario_id: number;
  nome: string;
  vitorias: number;
  derrotas: number;
  saldo_pontos: number;
  jogos: number;
}
export interface EstatFase {
  vitorias: number;
  derrotas: number;
  jogos: number;
}
export interface EstatPorFase {
  grupos: EstatFase | null;
  mata: EstatFase | null;
}
export interface EstatClutch {
  sets_deuce: number;
  vencidos: number;
  aproveitamento: number | null;
}
export interface EstatJogador {
  jogador_id: number;
  nome: string;
  grupo: string | null;
  volume: EstatVolume;
  head_to_head: EstatH2H[];
  vitima: EstatH2H | null;
  algoz: EstatH2H | null;
  aluno: EstatH2H | null;
  doutrinador: EstatH2H | null;
  clutch: EstatClutch;
  por_fase: EstatPorFase;
}

// ---- resumo/dashboard do campeonato ----
export interface Premio {
  chave: string;
  titulo: string;
  jogador: string | null;
  valor: string | null;
  detalhe: string | null;
}
export interface Atropelada {
  vencedor: string;
  perdedor: string;
  sets: string;
  margem: number;
}
export interface LinhaJogadorResumo {
  jogador_id: number;
  nome: string;
  jogos: number;
  vitorias: number;
  derrotas: number;
  pontos: number;
  media_set: number;
  sets_ganhos: number;
  sets_perdidos: number;
  pontos_sofridos: number;
}
export interface PassouPorBaixo {
  jogador_id: number;
  nome: string;
  vezes: number;
}
export interface ResumoCampeonato {
  modo: Modo;
  modo_efetivo: Modo;
  fase_atual: string;
  campeao: string | null;
  total_partidas: number;
  partidas_totais: number;
  progresso: number;
  total_sets: number;
  total_pontos: number;
  total_bagels: number;
  premios: Premio[];
  passou_por_baixo: PassouPorBaixo[];
  jogadores: LinhaJogadorResumo[];
}

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
  lerConfig: (signal?: AbortSignal) => req<Config>("/config", { signal }),

  // atualiza modo (mantido por compat com quem ja chama definirModo)
  definirModo: (modo: Modo) =>
    req<Config>("/config", { method: "PUT", body: JSON.stringify({ modo }) }),

  // atualiza UMA ou mais chaves da config: modo e/ou melhor_de por fase.
  // o backend so mexe no que vier preenchido (patch parcial).
  definirConfig: (
    patch: Partial<{
      modo: Modo;
      melhor_de_grupos: MelhorDe;
      melhor_de_mata: MelhorDe;
      melhor_de_final: MelhorDe;
      tema: Tema;
    }>
  ) => req<Config>("/config", { method: "PUT", body: JSON.stringify(patch) }),

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
  estatisticasJogador: (id: number, signal?: AbortSignal) =>
    req<EstatJogador>(`/jogadores/${id}/estatisticas`, { signal }),
  resumoCampeonato: (signal?: AbortSignal) =>
    req<ResumoCampeonato>("/campeonato/resumo", { signal }),

  listarPartidas: (signal?: AbortSignal) => req<Partida[]>("/partidas", { signal }),
  criarPartida: (jogador_a_id: number, jogador_b_id: number) =>
    req<Partida>("/partidas", {
      method: "POST",
      body: JSON.stringify({ jogador_a_id, jogador_b_id }),
    }),
  // registra/edita UM set; o backend recalcula a partida e diz se acabou.
  registrarSet: (partidaId: number, numero: number, pontos_a: number, pontos_b: number) =>
    req<Partida>(`/partidas/${partidaId}/sets/${numero}`, {
      method: "PUT",
      body: JSON.stringify({ pontos_a, pontos_b }),
    }),
  // grava quem abre o saque (set 1); persiste pra sobreviver a reload
  definirSaque: (partidaId: number, saca_inicial: 0 | 1) =>
    req<Partida>(`/partidas/${partidaId}/saque`, {
      method: "PATCH",
      body: JSON.stringify({ saca_inicial }),
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
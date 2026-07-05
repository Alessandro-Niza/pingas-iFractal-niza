import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import { api, type Jogador, type Partida } from "./api";

/**
 * Estado GLOBAL do modo ao vivo, no nivel do App.
 *
 * A partida ativa e os pontos do set atual vivem num contexto unico, e:
 *   - o botao do topbar abre/retoma de qualquer aba (via seletor);
 *   - os pontos do set em andamento sao persistidos no localStorage, entao
 *     SOBREVIVEM a um F5 (a chave e por id da partida).
 */

export type Pontos = { a: number; b: number };

const LS_PREFIX = "pingas:ao-vivo:";
const lsKey = (id: number) => `${LS_PREFIX}${id}`;

// le todos os rascunhos de pontos guardados (hidrata o estado apos F5)
function lerRascunhos(): Record<number, Pontos> {
  const out: Record<number, Pontos> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      const id = Number(k.slice(LS_PREFIX.length));
      const raw = localStorage.getItem(k);
      if (!raw || !Number.isFinite(id)) continue;
      try {
        const v = JSON.parse(raw);
        if (typeof v?.a === "number" && typeof v?.b === "number") out[id] = v;
      } catch { /* rascunho corrompido: ignora */ }
    }
  } catch { /* localStorage indisponivel: segue sem persistencia */ }
  return out;
}

type Ctx = {
  jogadores: Jogador[];
  nomeDe: (id: number) => string;
  aoVivoId: number | null;
  partidaAoVivo: Partida | null;
  disponiveis: Partida[];               // partidas que da pra marcar agora (mesmo gate do card)
  versao: number;                       // incrementa a cada recarregar (paginas observam p/ refetch)
  pontosDe: (id: number) => Pontos;
  setPontos: (id: number, p: Pontos) => void;
  limparPontos: (id: number) => void;
  abrir: (id: number) => void;
  fechar: () => void;
  recarregar: () => void;
};

const AoVivoContext = createContext<Ctx | null>(null);

export function useAoVivo(): Ctx {
  const c = useContext(AoVivoContext);
  if (!c) throw new Error("useAoVivo precisa estar dentro do <AoVivoProvider>");
  return c;
}

export function AoVivoProvider({ children }: { children: ReactNode }) {
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [aoVivoId, setAoVivoId] = useState<number | null>(null);
  const [pontos, setPontosState] = useState<Record<number, Pontos>>(() => lerRascunhos());
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(() => {
    Promise.all([api.listarJogadores(), api.listarPartidas(), api.listarMataMata()])
      .then(([js, ps, mm]) => {
        setJogadores(js);
        // lista unica de partidas (grupos + mata), dedup por id
        const mapa = new Map<number, Partida>();
        [...ps, ...mm].forEach((p) => mapa.set(p.id, p));
        const todas = [...mapa.values()];
        setPartidas(todas);
        // limpeza: descarta rascunhos de partidas ja finalizadas ou inexistentes
        setPontosState((prev) => {
          const validos: Record<number, Pontos> = {};
          for (const [idStr, pt] of Object.entries(prev)) {
            const id = Number(idStr);
            const p = mapa.get(id);
            if (p && !p.finalizada) validos[id] = pt;
            else { try { localStorage.removeItem(lsKey(id)); } catch { /* ok */ } }
          }
          return validos;
        });
        setVersao((v) => v + 1);
      })
      .catch(() => { /* falha de rede: mantem o estado atual */ });
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  const nomeDe = useCallback(
    (id: number) => jogadores.find((j) => j.id === id)?.nome ?? "?",
    [jogadores],
  );

  const pontosDe = useCallback((id: number) => pontos[id] ?? { a: 0, b: 0 }, [pontos]);

  const setPontos = useCallback((id: number, p: Pontos) => {
    setPontosState((prev) => ({ ...prev, [id]: p }));
    try { localStorage.setItem(lsKey(id), JSON.stringify(p)); } catch { /* ok */ }
  }, []);

  const limparPontos = useCallback((id: number) => {
    setPontosState((prev) => {
      const { [id]: _drop, ...resto } = prev;
      return resto;
    });
    try { localStorage.removeItem(lsKey(id)); } catch { /* ok */ }
  }, []);

  const abrir = useCallback((id: number) => setAoVivoId(id), []);
  const fechar = useCallback(() => setAoVivoId(null), []);

  const partidaAoVivo = useMemo(
    () => (aoVivoId !== null ? partidas.find((p) => p.id === aoVivoId) ?? null : null),
    [aoVivoId, partidas],
  );

  // "disponiveis" = da pra marcar AGORA: nao finalizada E com saque definido.
  // E EXATAMENTE o gate do botao "Ao vivo" do card (podeAoVivo). Assim o botao
  // do topbar espelha o que os cards oferecem — pronta (0 a 0) ou em andamento.
  const disponiveis = useMemo(
    () => partidas.filter((p) => !p.finalizada && (p.saca_inicial === 0 || p.saca_inicial === 1)),
    [partidas],
  );

  const value = useMemo<Ctx>(() => ({
    jogadores, nomeDe, aoVivoId, partidaAoVivo, disponiveis, versao,
    pontosDe, setPontos, limparPontos, abrir, fechar, recarregar,
  }), [jogadores, nomeDe, aoVivoId, partidaAoVivo, disponiveis, versao,
      pontosDe, setPontos, limparPontos, abrir, fechar, recarregar]);

  return <AoVivoContext.Provider value={value}>{children}</AoVivoContext.Provider>;
}

import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { api, type Tema } from "./api";

/**
 * Tema visual GLOBAL (vem da config do backend). "auto" segue o sistema:
 * claro -> pure, escuro -> nebula. O tema resolvido vira `data-tema` no <html>,
 * e todo o CSS (que e 100% var(--x)) troca sozinho.
 *
 * Anti-flash: um <script> no index.html aplica o `data-tema` a partir do cache
 * (localStorage) ANTES do React montar. Aqui a gente confirma com o backend
 * (fonte da verdade global) e corrige se divergir.
 */

const LS_TEMA = "pingas:tema";

// resolve "auto" -> tema visual concreto conforme o sistema
function resolver(tema: Tema): "eclipse" | "nebula" | "pure" {
  if (tema === "auto") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "nebula" : "pure";
  }
  return tema;
}

function aplicar(tema: Tema) {
  document.documentElement.setAttribute("data-tema", resolver(tema));
  try { localStorage.setItem(LS_TEMA, tema); } catch { /* ok */ }
}

type Ctx = { tema: Tema; setTema: (t: Tema) => void };
const TemaContext = createContext<Ctx | null>(null);

export function useTema(): Ctx {
  const c = useContext(TemaContext);
  if (!c) throw new Error("useTema precisa estar dentro do <TemaProvider>");
  return c;
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>(() => {
    try { return (localStorage.getItem(LS_TEMA) as Tema) || "auto"; } catch { return "auto"; }
  });

  // aplica com o cache local no mount e confirma com o backend (config global)
  useEffect(() => {
    aplicar(tema);
    api.lerConfig()
      .then((cfg) => {
        const t = (cfg.tema as Tema) || "auto";
        setTemaState(t);
        aplicar(t);
      })
      .catch(() => { /* mantem o cache local */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // quando o tema e "auto", reage a troca de tema do sistema em tempo real
  useEffect(() => {
    if (tema !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => aplicar("auto");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [tema]);

  const setTema = useCallback((t: Tema) => {
    setTemaState(t);
    aplicar(t);
    api.definirConfig({ tema: t }).catch(() => { /* aplicado no front mesmo assim */ });
  }, []);

  return <TemaContext.Provider value={{ tema, setTema }}>{children}</TemaContext.Provider>;
}

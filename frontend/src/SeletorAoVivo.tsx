import { createPortal } from "react-dom";
import { useAoVivo } from "./AoVivoProvider";

/**
 * Seletor das partidas ao vivo (prontas ou em andamento). Aberto pelo botao
 * "Ao vivo" do topbar; cada item abre/retoma o placar daquela partida.
 *
 * Estilos ESTRUTURAIS inline de proposito: o modal precisa ser um overlay
 * position:fixed centralizado pra funcionar, e assim ele NAO depende de nenhum
 * CSS externo estar carregado. As cores usam os tokens do tema via var(), com
 * fallback, entao segue com a identidade visual do app. Portal pro document.body
 * pra escapar de qualquer containing block (filter/transform do tema).
 */
export function SeletorAoVivo({ onFechar }: { onFechar: () => void }) {
  const { disponiveis, nomeDe, pontosDe, abrir } = useAoVivo();

  return createPortal(
    <div
      role="dialog"
      aria-label="Partidas ao vivo"
      data-testid="seletor-ao-vivo"
      onClick={onFechar}
      style={{
        position: "fixed",
        top: 0, right: 0, bottom: 0, left: 0,
        zIndex: 200,
        background: "rgba(6, 10, 17, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          background: "var(--surface, #0f1521)",
          border: "1px solid var(--border, #1f2a3d)",
          borderRadius: "var(--radius, 16px)",
          padding: 20,
          boxShadow: "0 20px 60px -20px rgba(0, 0, 0, 0.8)",
        }}
      >
        <div style={{ fontWeight: 600, color: "var(--text, #e6ebf2)", marginBottom: 4 }}>
          Partidas ao vivo
        </div>

        {disponiveis.length === 0 ? (
          <p style={{ color: "var(--muted, #8893a7)", textAlign: "center", padding: "22px 12px" }}>
            Nenhuma partida disponível.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0" }}>
            {disponiveis.map((p) => {
              const pt = pontosDe(p.id);
              return (
                <button
                  key={p.id}
                  data-testid={`seletor-item-${p.id}`}
                  onClick={() => { abrir(p.id); onFechar(); }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: "var(--radius-sm, 12px)",
                    background: "var(--surface-2, #141c2b)",
                    border: "1px solid var(--border-soft, #18222f)",
                    color: "var(--text, #e6ebf2)",
                    font: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ textAlign: "right", fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nomeDe(p.jogador_a_id)}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {p.sets_a} × {p.sets_b}
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted, #8893a7)", whiteSpace: "nowrap" }}>
                      set atual {pt.a}–{pt.b}
                    </span>
                  </span>
                  <span style={{ textAlign: "left", fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nomeDe(p.jogador_b_id)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <button
          className="btn ghost"
          data-testid="btn-fechar-seletor"
          onClick={onFechar}
          style={{ width: "100%", marginTop: 6 }}
        >
          Fechar
        </button>
      </div>
    </div>,
    document.body,
  );
}

"""
Exportacao do campeonato para um pacote HTML estatico, 100% offline.

Gera um zip com a estrutura:
    Campeonato_iFractal_<ANO>/
    ├── Classificacao.html
    ├── Partidas.html
    ├── MataMata.html
    └── style.css

Os HTMLs nao dependem de internet nem do sistema: abrem em qualquer navegador.
Este modulo NAO fala com o banco — recebe os dados ja prontos do main.py
(evita import circular e mantem a regra de negocio num lugar so).

MODELO DE SETS: cada partida chega com a lista `sets` embutida. O placar exibido e:
  - melhor_de == 1 (grupos): os PONTOS do set unico (ex: 11 : 8)
  - melhor_de  > 1 (mata-mata): a CONTAGEM de sets (ex: 2 : 1), com os parciais por baixo
"""
import io
import html
import zipfile
from datetime import datetime


# ---------------------------------------------------------------- helpers

def _nav(ativo: str) -> str:
    itens = [
        ("Classificacao.html", "Classificação", "class"),
        ("Partidas.html", "Partidas", "part"),
        ("MataMata.html", "Mata-mata", "mata"),
    ]
    out = []
    for href, label, chave in itens:
        cls = "navlink ativo" if chave == ativo else "navlink"
        out.append(f'<a class="{cls}" href="{href}">{label}</a>')
    return "".join(out)


def _doc(titulo: str, ativo: str, corpo: str, agora: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(titulo)} · Pingas iFractal</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="wrap">
<header class="topo">
<div class="marca">Pingas <span>iFractal</span></div>
<nav class="nav">{_nav(ativo)}</nav>
</header>
<main>
{corpo}
</main>
<footer class="rodape">
<strong>Pingas iFractal</strong>
<span>Exportado em: {agora}</span>
</footer>
</div>
</body>
</html>"""


def _banner_campeao(nome: str) -> str:
    return f'<div class="banner-campeao">🏆 Campeão: <strong>{html.escape(nome)}</strong></div>'


# placar agregado de uma partida finalizada, ja ciente do modelo de sets.
def _placar_partida(p) -> str:
    if not p["finalizada"]:
        return "—"
    sets = p.get("sets") or []
    if p.get("melhor_de", 1) == 1 and sets:
        s = sets[0]
        return f'{s["pontos_a"]} : {s["pontos_b"]}'   # bo1: pontos do set unico
    return f'{p["sets_a"]} : {p["sets_b"]}'           # bo3/5: contagem de sets


# parciais "11-8 9-11 11-6" de uma serie (so faz sentido em melhor de > 1)
def _parciais(p) -> str:
    sets = p.get("sets") or []
    if not (p["finalizada"] and p.get("melhor_de", 1) > 1 and sets):
        return ""
    chips = " ".join(f'{s["pontos_a"]}-{s["pontos_b"]}' for s in sets)
    return f'<div class="sets-detalhe">{html.escape(chips)}</div>'


def _tabela(linhas: list, campeao_id=None) -> str:
    corpo = []
    for i, l in enumerate(linhas):
        coroa = ' <span class="coroa">♛</span>' if campeao_id == l["jogador_id"] else ""
        lider = ' class="lider"' if i == 0 else ""
        saldo = f'{"+" if l["saldo_sets"] > 0 else ""}{l["saldo_sets"]}'
        corpo.append(
            f"<tr{lider}>"
            f'<td class="pos">{i + 1}</td>'
            f'<td class="esq nome">{html.escape(l["nome"])}{coroa}</td>'
            f'<td>{l["jogos"]}</td><td>{l["vitorias"]}</td><td>{l["derrotas"]}</td>'
            f'<td>{l["sets_ganhos"]}:{l["sets_perdidos"]}</td>'
            f"<td>{saldo}</td>"
            f'<td class="pts">{l["pontos"]}</td>'
            f"</tr>"
        )
    return (
        '<table class="tabela">'
        "<thead><tr>"
        '<th>#</th><th class="esq">Jogador</th><th>J</th><th>V</th><th>D</th>'
        "<th>Sets</th><th>Saldo</th><th>Pts</th>"
        "</tr></thead>"
        f"<tbody>{''.join(corpo)}</tbody>"
        "</table>"
    )


def _rotulo_rodada(qtd: int) -> str:
    return {1: "Final", 2: "Semifinais", 4: "Quartas de final", 8: "Oitavas de final"}.get(qtd, "Rodada")


# ---------------------------------------------------------------- paginas

def _classificacao_html(modo_ef, classificacao, campeao_id, campeao_nome, mata, agora) -> str:
    partes = []
    if campeao_nome:
        partes.append(_banner_campeao(campeao_nome))

    # resumo do mata-mata (Final, Semis, e Quartas SE houver) — igual ao app.
    # rotulo vem da contagem de jogos: 1=Final, 2=Semis, 4=Quartas (8/12 nao tem quartas).
    if mata:
        rodadas = sorted(set(p["rodada"] for p in mata))
        nome_de = {}  # precisamos dos nomes; reaproveita da classificacao
        for l in classificacao:
            nome_de[l["jogador_id"]] = l["nome"]
        # fallback: se algum id do mata nao esta na classificacao (raro), usa "?"
        def nm(pid):
            return nome_de.get(pid, "?")
        for r in reversed(rodadas):  # Final primeiro
            jogos = [p for p in mata if p["rodada"] == r]
            linhas = []
            for p in jogos:
                a_venc = p["finalizada"] and p["sets_a"] > p["sets_b"]
                b_venc = p["finalizada"] and p["sets_b"] > p["sets_a"]
                placar = _placar_partida(p)
                linhas.append(
                    '<div class="jogo">'
                    f'<span class="lado a{" venc" if a_venc else ""}">{html.escape(nm(p["jogador_a_id"]))}</span>'
                    f'<span class="placar-mini">{placar}</span>'
                    f'<span class="lado b{" venc" if b_venc else ""}">{html.escape(nm(p["jogador_b_id"]))}</span>'
                    "</div>"
                )
            partes.append(
                f'<section class="card"><div class="card-title">{_rotulo_rodada(len(jogos))}</div>'
                f'{"".join(linhas)}</section>'
            )

    if not classificacao:
        partes.append('<section class="card"><p class="vazio">Nenhuma partida finalizada ainda.</p></section>')
    elif modo_ef == "grupos":
        grupos = []
        for l in classificacao:
            g = l["grupo"] or "—"
            if g not in grupos:
                grupos.append(g)
        for g in grupos:
            linhas_g = [l for l in classificacao if (l["grupo"] or "—") == g]
            partes.append(
                f'<section class="card"><div class="card-title">Grupo {html.escape(g)}</div>'
                f"{_tabela(linhas_g)}</section>"
            )
    else:
        partes.append(
            '<section class="card"><div class="card-title">Classificação geral</div>'
            f"{_tabela(classificacao, campeao_id)}</section>"
        )

    return _doc("Classificação", "class", "".join(partes), agora)


def _partidas_html(partidas, jogadores, agora) -> str:
    nome_de = {j["id"]: j["nome"] for j in jogadores}
    grupo_de = {j["id"]: j["grupo"] for j in jogadores}

    # tamanho de cada rodada do mata-mata (pra rotular Semifinal/Final)
    tam_rodada = {}
    for p in partidas:
        if p["fase"] == "mata":
            tam_rodada[p["rodada"]] = tam_rodada.get(p["rodada"], 0) + 1

    def fase_label(p):
        if p["fase"] == "grupos":
            return "Grupo"
        return {1: "Final", 2: "Semifinal", 4: "Quartas"}.get(tam_rodada.get(p["rodada"], 0), "Mata-mata")

    def grupo_label(p):
        ga, gb = grupo_de.get(p["jogador_a_id"]), grupo_de.get(p["jogador_b_id"])
        return ga if (p["fase"] == "grupos" and ga and ga == gb) else "—"

    if not partidas:
        corpo = '<section class="card"><p class="vazio">Nenhuma partida registrada.</p></section>'
        return _doc("Partidas", "part", corpo, agora)

    linhas = []
    for p in partidas:  # ja vem ordenado por id = ordem cronologica de criacao
        placar = _placar_partida(p)
        parciais = _parciais(p)  # vazio na fase de grupos; parciais "11-8 9-11" no mata-mata
        linhas.append(
            "<tr>"
            f'<td class="esq"><span class="badge">{fase_label(p)}</span></td>'
            f"<td>{html.escape(grupo_label(p))}</td>"
            f'<td class="esq">{html.escape(nome_de.get(p["jogador_a_id"], "?"))}</td>'
            f'<td class="placar-cell">{placar}{parciais}</td>'
            f'<td class="esq">{html.escape(nome_de.get(p["jogador_b_id"], "?"))}</td>'
            "</tr>"
        )

    corpo = (
        '<section class="card">'
        '<div class="card-title">Todas as partidas</div>'
        '<table class="tabela part">'
        "<thead><tr>"
        '<th class="esq">Fase</th><th>Grupo</th><th class="esq">Jogador A</th>'
        "<th>Placar</th><th class=\"esq\">Jogador B</th>"
        "</tr></thead>"
        f"<tbody>{''.join(linhas)}</tbody>"
        "</table></section>"
    )
    return _doc("Partidas", "part", corpo, agora)


def _matamata_html(mata, jogadores, campeao_nome, agora) -> str:
    nome_de = {j["id"]: j["nome"] for j in jogadores}

    if not mata:
        corpo = (
            '<section class="card"><div class="card-title">Mata-mata</div>'
            '<p class="vazio">Este campeonato não teve fase de mata-mata.</p></section>'
        )
        return _doc("Mata-mata", "mata", corpo, agora)

    rodadas = sorted(set(p["rodada"] for p in mata))
    blocos = []
    if campeao_nome:
        blocos.append(_banner_campeao(campeao_nome))

    for r in reversed(rodadas):  # final primeiro, depois semis
        jogos = [p for p in mata if p["rodada"] == r]
        linhas = []
        for p in jogos:
            a_venc = p["finalizada"] and p["sets_a"] > p["sets_b"]
            b_venc = p["finalizada"] and p["sets_b"] > p["sets_a"]
            placar = _placar_partida(p)
            parciais = _parciais(p)  # parciais "11-8 9-11 11-6" da serie
            linhas.append(
                '<div class="jogo">'
                f'<span class="lado a{" venc" if a_venc else ""}">{html.escape(nome_de.get(p["jogador_a_id"], "?"))}</span>'
                f'<span class="placar-mini">{placar}</span>'
                f'<span class="lado b{" venc" if b_venc else ""}">{html.escape(nome_de.get(p["jogador_b_id"], "?"))}</span>'
                "</div>"
                f"{parciais}"
            )
        blocos.append(f'<div class="rodada-titulo">{_rotulo_rodada(len(jogos))}</div>{"".join(linhas)}')

    corpo = f'<section class="card"><div class="card-title">Mata-mata</div>{"".join(blocos)}</section>'
    return _doc("Mata-mata", "mata", corpo, agora)


# ---------------------------------------------------------------- css

def _css() -> str:
    # tema portado do app (dark + azul + cards + aneis de fundo), porem standalone.
    # inclui @media print pra ficar legivel no papel (fundo claro, sem desperdicio de tinta).
    return """:root {
  --bg: #060a11;
  --glass: rgba(15, 21, 33, 0.72);
  --glass-border: rgba(99, 132, 200, 0.16);
  --text: #e6ebf2;
  --muted: #8893a7;
  --accent: #3b82f6;
  --gold: #facc15;
  --win: #34d399;
  --border-soft: #18222f;
  --radius: 14px;
  --font: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  color: var(--text);
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
  background-color: var(--bg);
  background-image:
    radial-gradient(55% 45% at 100% 0%, rgba(59,130,246,0.22), transparent 70%),
    radial-gradient(45% 40% at 0% 100%, rgba(37,99,235,0.10), transparent 70%),
    repeating-radial-gradient(circle at 100% 0%, rgba(96,165,250,0.06) 0 1px, transparent 1px 92px),
    linear-gradient(180deg, #0a1322 0%, #060a11 55%);
  background-attachment: fixed;
}
.wrap { max-width: 920px; margin: 0 auto; padding: 22px 18px 40px; }

/* header + nav */
.topo {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  padding: 14px 18px; margin-bottom: 16px;
  background: var(--glass); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border); border-radius: var(--radius);
}
.marca { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.01em; }
.marca span {
  background: linear-gradient(90deg, #7cc0ff, #3b82f6);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}
.nav { display: flex; gap: 6px; flex-wrap: wrap; }
.navlink {
  text-decoration: none; color: var(--muted); font-weight: 600; font-size: 0.92rem;
  padding: 8px 12px; border-radius: 10px;
}
.navlink:hover { color: var(--text); background: rgba(255,255,255,0.04); }
.navlink.ativo { color: var(--accent); background: rgba(59,130,246,0.12); }

/* cards */
.card {
  background: var(--glass); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border); border-radius: var(--radius);
  padding: 18px; margin-bottom: 16px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 34px -16px rgba(0,0,0,0.7);
}
.card-title {
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--muted); margin: 0 0 14px; display: flex; align-items: center; gap: 8px;
}
.card-title::before {
  content: ""; width: 16px; height: 2px; border-radius: 2px; background: var(--accent);
  box-shadow: 0 0 8px rgba(59,130,246,0.7);
}

/* tabela */
.tabela { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.tabela th {
  text-align: right; font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--muted); font-weight: 700; padding: 0 8px 12px;
}
.tabela th.esq { text-align: left; }
.tabela td { padding: 12px 8px; text-align: right; border-top: 1px solid var(--border-soft); }
.tabela td.esq { text-align: left; }
.tabela td.pts { color: var(--accent); font-weight: 700; }
.tabela td.placar-cell { font-weight: 700; text-align: center; white-space: nowrap; }
.tabela td.placar-cell .sets-detalhe { text-align: center; }
.sets-detalhe { font-weight: 400; font-size: 0.78rem; color: var(--muted); margin-top: 2px; }
.pos {
  display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 7px;
  background: rgba(255,255,255,0.05); color: var(--muted); font-weight: 700; font-size: 0.8rem;
}
.tabela tr.lider .pos { background: var(--accent); color: #fff; }
.coroa { color: var(--gold); }
.badge {
  display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 0.74rem; font-weight: 700;
  color: var(--accent); background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.25);
}

/* banner de campeao */
.banner-campeao {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  margin-bottom: 16px; padding: 14px; border-radius: 10px;
  background: rgba(250,204,21,0.1); border: 1px solid rgba(250,204,21,0.35);
  color: var(--gold); font-weight: 700; font-size: 1.1rem;
}

/* chaveamento (mata-mata) */
.rodada-titulo {
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--muted); margin: 16px 0 6px;
}
.jogo {
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 6px 0;
}
.jogo .lado { color: var(--muted); }
.jogo .lado.a { text-align: right; }
.jogo .lado.b { text-align: left; }
.jogo .lado.venc { color: var(--text); font-weight: 700; }
.jogo .placar-mini {
  color: var(--muted); font-variant-numeric: tabular-nums; min-width: 48px; text-align: center;
}
/* parciais da serie, centralizado abaixo do confronto */
.jogo + .sets-detalhe { text-align: center; margin: -2px 0 6px; }

.vazio { color: var(--muted); text-align: center; padding: 28px 12px; }

/* rodape */
.rodape {
  margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--border-soft);
  display: flex; flex-direction: column; gap: 2px; align-items: center;
  color: var(--muted); font-size: 0.85rem; text-align: center;
}
.rodape strong { color: var(--text); }

@media (max-width: 560px) {
  .tabela th, .tabela td { padding: 9px 5px; font-size: 0.9rem; }
}

/* impressao: fundo claro, economiza tinta e fica legivel no papel */
@media print {
  body { background: #fff; color: #111; }
  .wrap { max-width: 100%; }
  .topo, .card {
    background: #fff; border: 1px solid #ccc; box-shadow: none;
    -webkit-backdrop-filter: none; backdrop-filter: none;
  }
  .nav { display: none; }
  .marca, .marca span { color: #111; -webkit-text-fill-color: #111; }
  .tabela td { border-top: 1px solid #ddd; }
  .tabela td.pts, .navlink.ativo { color: #1d4ed8; }
  .badge { color: #1d4ed8; border-color: #1d4ed8; background: transparent; }
  .banner-campeao { background: transparent; border-color: #caa; color: #9a7d00; }
  .pos { background: #eee; color: #333; }
  .tabela tr.lider .pos { background: #1d4ed8; color: #fff; }
  .sets-detalhe { color: #555; }
}
"""


# ---------------------------------------------------------------- montar zip

def gerar_zip_export(modo_ef, jogadores, partidas, classificacao, mata, campeao_id) -> bytes:
    """Monta o zip do campeonato e devolve os bytes prontos pra download."""
    nome_de = {j["id"]: j["nome"] for j in jogadores}
    campeao_nome = nome_de.get(campeao_id) if campeao_id is not None else None

    agora = datetime.now().strftime("%d/%m/%Y às %H:%M")
    pasta = f"Campeonato_iFractal_{datetime.now().year}"

    arquivos = {
        "style.css": _css(),
        "Classificacao.html": _classificacao_html(modo_ef, classificacao, campeao_id, campeao_nome, mata, agora),
        "Partidas.html": _partidas_html(partidas, jogadores, agora),
        "MataMata.html": _matamata_html(mata, jogadores, campeao_nome, agora),
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for nome, conteudo in arquivos.items():
            z.writestr(f"{pasta}/{nome}", conteudo)
    return buf.getvalue()
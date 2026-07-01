"""
API do torneio. Dois modos:
  - pontos_corridos: todos contra todos, classificacao geral unica
  - grupos: confrontos dentro de cada grupo, classificacao por grupo

Modelo de SETS (melhor de N):
  Toda partida e "melhor de N sets" (coluna melhor_de): grupos=1, semis=3, final=5.
  Os PONTOS de cada set vivem na tabela `sets` (FONTE DE VERDADE).
  Em `partidas`, sets_a/sets_b sao CACHE = quantos sets cada lado venceu.

Rodar local:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
Docs interativas:
    http://localhost:8000/docs
"""
import sqlite3
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
from typing import Optional
from pydantic import BaseModel, Field

from db import init_db, db_dep
from exportar import gerar_zip_export

# ---------------------------------------------------------------- models

class JogadorCriar(BaseModel):
    nome: str = Field(min_length=1, max_length=50)

class Jogador(BaseModel):
    id: int
    nome: str
    grupo: Optional[str] = None

class JogadorGrupo(BaseModel):
    grupo: Optional[str] = Field(default=None, max_length=5)

class PartidaCriar(BaseModel):
    jogador_a_id: int
    jogador_b_id: int

class SetIn(BaseModel):
    # pontos de UM set; o backend valida se o set realmente terminou (11 + vantagem 2)
    pontos_a: int = Field(ge=0, le=99)
    pontos_b: int = Field(ge=0, le=99)

class SetOut(BaseModel):
    numero: int
    pontos_a: int
    pontos_b: int

class Partida(BaseModel):
    id: int
    jogador_a_id: int
    jogador_b_id: int
    sets_a: int                 # CACHE: sets vencidos por A (NAO mais pontos)
    sets_b: int                 # CACHE: sets vencidos por B
    finalizada: bool
    fase: str = "grupos"          # 'grupos' | 'mata'
    rodada: Optional[int] = None  # rodada do mata-mata (1 = primeira, etc.)
    melhor_de: int = 1            # 1 (grupos), 3 (semis), 5 (final)
    sets: list[SetOut] = []       # sets ja jogados, em ordem

class LinhaClassificacao(BaseModel):
    jogador_id: int
    nome: str
    grupo: Optional[str]
    jogos: int
    vitorias: int
    derrotas: int
    sets_ganhos: int
    sets_perdidos: int
    saldo_sets: int
    pontos: int

class ConfigOut(BaseModel):
    modo: str           # o que o organizador escolheu no switch
    modo_efetivo: str   # o que realmente roda (cai pra pontos_corridos se grupos incompletos)

class ModoIn(BaseModel):
    modo: str  # 'pontos_corridos' | 'grupos'

# ---------------------------------------------------------------- app

app = FastAPI(title="Torneio - Pingas iFractal")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

def get_modo(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT valor FROM config WHERE chave = 'modo'").fetchone()
    return row["valor"] if row else "pontos_corridos"

GRUPOS_FIXOS = ("A", "B", "C", "D")

def grupos_completos(conn: sqlite3.Connection) -> bool:
    # regra de negocio: fase de grupos so vale se TODOS os 4 grupos tem >= 2 jogadores
    cont = {g: 0 for g in GRUPOS_FIXOS}
    rows = conn.execute(
        "SELECT grupo, COUNT(*) AS c FROM jogadores WHERE grupo IS NOT NULL GROUP BY grupo"
    ).fetchall()
    for r in rows:
        if r["grupo"] in cont:
            cont[r["grupo"]] = r["c"]
    return all(cont[g] >= 2 for g in GRUPOS_FIXOS)

def get_modo_efetivo(conn: sqlite3.Connection) -> str:
    # se escolheu grupos mas eles nao estao completos, o campeonato roda em pontos corridos
    if get_modo(conn) == "grupos" and grupos_completos(conn):
        return "grupos"
    return "pontos_corridos"

# ---------------------------------------------------------------- helpers de set/partida

def _set_valido(pa: int, pb: int) -> bool:
    # regra oficial: alguem chega a 11 E abre 2 de vantagem (deuce sem limite)
    return (pa >= 11 or pb >= 11) and abs(pa - pb) >= 2

def _sets_para_vencer(melhor_de: int) -> int:
    # melhor de 1 -> 1 ; melhor de 3 -> 2 ; melhor de 5 -> 3
    return melhor_de // 2 + 1

def _melhor_de_da_rodada(n_jogos: int) -> int:
    # 1 jogo na rodada = FINAL = melhor de 5 ; demais (semis/quartas) = melhor de 3.
    # Espelha rotuloRodada do front, que tambem se baseia na contagem de jogos.
    return 5 if n_jogos == 1 else 3

def _sets_de(conn, partida_id: int):
    return conn.execute(
        "SELECT numero, pontos_a, pontos_b FROM sets WHERE partida_id = ? ORDER BY numero",
        (partida_id,),
    ).fetchall()

def _partida_dict(conn, row) -> dict:
    # monta o dict da partida ja com a lista de sets embutida
    d = dict(row)
    d["sets"] = [dict(s) for s in _sets_de(conn, row["id"])]
    return d

def _recalcular_partida(conn, partida_id: int) -> None:
    # Deriva sets_a/sets_b/finalizada a partir da tabela `sets`. A verdade sao os sets;
    # estes campos sao apenas cache recalculado aqui sempre que um set muda.
    p = conn.execute("SELECT melhor_de FROM partidas WHERE id = ?", (partida_id,)).fetchone()
    sets = _sets_de(conn, partida_id)
    ga = sum(1 for s in sets if s["pontos_a"] > s["pontos_b"])
    gb = sum(1 for s in sets if s["pontos_b"] > s["pontos_a"])
    alvo = _sets_para_vencer(p["melhor_de"])
    fin = 1 if (ga >= alvo or gb >= alvo) else 0
    conn.execute(
        "UPDATE partidas SET sets_a = ?, sets_b = ?, finalizada = ? WHERE id = ?",
        (ga, gb, fin, partida_id),
    )
    conn.commit()

# ---------------------------------------------------------------- config

@app.get("/config", response_model=ConfigOut)
def ler_config(conn: sqlite3.Connection = Depends(db_dep)):
    return {"modo": get_modo(conn), "modo_efetivo": get_modo_efetivo(conn)}

@app.put("/config", response_model=ConfigOut)
def definir_modo(dados: ModoIn, conn: sqlite3.Connection = Depends(db_dep)):
    if dados.modo not in ("pontos_corridos", "grupos"):
        raise HTTPException(400, "Modo invalido.")
    conn.execute(
        "INSERT INTO config (chave, valor) VALUES ('modo', ?) "
        "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        (dados.modo,),
    )
    conn.commit()
    return {"modo": dados.modo, "modo_efetivo": get_modo_efetivo(conn)}

# ---------------------------------------------------------------- jogadores

@app.post("/jogadores", response_model=Jogador, status_code=201)
def criar_jogador(dados: JogadorCriar, conn: sqlite3.Connection = Depends(db_dep)):
    try:
        cur = conn.execute("INSERT INTO jogadores (nome) VALUES (?)", (dados.nome.strip(),))
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Ja existe um jogador com esse nome.")
    return {"id": cur.lastrowid, "nome": dados.nome.strip(), "grupo": None}

@app.get("/jogadores", response_model=list[Jogador])
def listar_jogadores(conn: sqlite3.Connection = Depends(db_dep)):
    rows = conn.execute("SELECT id, nome, grupo FROM jogadores ORDER BY nome").fetchall()
    return [dict(r) for r in rows]

@app.patch("/jogadores/{jogador_id}/grupo", response_model=Jogador)
def definir_grupo(jogador_id: int, dados: JogadorGrupo, conn: sqlite3.Connection = Depends(db_dep)):
    j = conn.execute("SELECT id FROM jogadores WHERE id = ?", (jogador_id,)).fetchone()
    if j is None:
        raise HTTPException(404, "Jogador nao encontrado.")
    g = dados.grupo.strip().upper() if dados.grupo and dados.grupo.strip() else None
    conn.execute("UPDATE jogadores SET grupo = ? WHERE id = ?", (g, jogador_id))
    conn.commit()
    row = conn.execute("SELECT id, nome, grupo FROM jogadores WHERE id = ?", (jogador_id,)).fetchone()
    return dict(row)

@app.delete("/jogadores/{jogador_id}", status_code=204)
def deletar_jogador(jogador_id: int, conn: sqlite3.Connection = Depends(db_dep)):
    p = conn.execute("SELECT id FROM jogadores WHERE id = ?", (jogador_id,)).fetchone()
    if p is None:
        raise HTTPException(404, "Jogador nao encontrado.")
    conn.execute("DELETE FROM jogadores WHERE id = ?", (jogador_id,))
    conn.commit()

# ---------------------------------------------------------------- partidas

@app.post("/partidas", response_model=Partida, status_code=201)
def criar_partida(dados: PartidaCriar, conn: sqlite3.Connection = Depends(db_dep)):
    if dados.jogador_a_id == dados.jogador_b_id:
        raise HTTPException(400, "Um jogador nao joga contra ele mesmo.")
    existentes = conn.execute(
        "SELECT id FROM jogadores WHERE id IN (?, ?)",
        (dados.jogador_a_id, dados.jogador_b_id),
    ).fetchall()
    if len(existentes) != 2:
        raise HTTPException(404, "Um dos jogadores nao existe.")
    # partida de grupos = sempre set unico (melhor de 1)
    cur = conn.execute(
        "INSERT INTO partidas (jogador_a_id, jogador_b_id, melhor_de) VALUES (?, ?, 1)",
        (dados.jogador_a_id, dados.jogador_b_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM partidas WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _partida_dict(conn, row)

@app.get("/partidas", response_model=list[Partida])
def listar_partidas(conn: sqlite3.Connection = Depends(db_dep)):
    rows = conn.execute("SELECT * FROM partidas ORDER BY id").fetchall()
    return [_partida_dict(conn, r) for r in rows]

@app.delete("/partidas", status_code=204)
def limpar_partidas(conn: sqlite3.Connection = Depends(db_dep)):
    # apaga TODAS as partidas (mantem jogadores e grupos); sets somem por cascade
    conn.execute("DELETE FROM partidas")
    conn.commit()

@app.put("/partidas/{partida_id}/sets/{numero}", response_model=Partida)
def registrar_set(
    partida_id: int, numero: int, dados: SetIn,
    conn: sqlite3.Connection = Depends(db_dep),
):
    p = conn.execute("SELECT * FROM partidas WHERE id = ?", (partida_id,)).fetchone()
    if p is None:
        raise HTTPException(404, "Partida nao encontrada.")
    if numero < 1 or numero > p["melhor_de"]:
        raise HTTPException(400, f"Set {numero} fora do alcance (melhor de {p['melhor_de']}).")
    if not _set_valido(dados.pontos_a, dados.pontos_b):
        raise HTTPException(400, "Set ainda nao terminou. Em 10x10, vence quem abrir 2 de vantagem.")

    sets = _sets_de(conn, partida_id)
    existentes = len(sets)
    # so permite: editar set ja jogado (numero <= existentes) OU abrir o PROXIMO (existentes+1)
    if numero > existentes + 1:
        raise HTTPException(400, "Nao da pra pular sets; registre o proximo na ordem.")
    if numero == existentes + 1:
        ga = sum(1 for s in sets if s["pontos_a"] > s["pontos_b"])
        gb = sum(1 for s in sets if s["pontos_b"] > s["pontos_a"])
        if ga >= _sets_para_vencer(p["melhor_de"]) or gb >= _sets_para_vencer(p["melhor_de"]):
            raise HTTPException(400, "Partida ja decidida; nao cabe mais set.")

    conn.execute(
        "INSERT INTO sets (partida_id, numero, pontos_a, pontos_b) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(partida_id, numero) DO UPDATE SET "
        "pontos_a = excluded.pontos_a, pontos_b = excluded.pontos_b",
        (partida_id, numero, dados.pontos_a, dados.pontos_b),
    )
    conn.commit()
    _recalcular_partida(conn, partida_id)

    p = conn.execute("SELECT * FROM partidas WHERE id = ?", (partida_id,)).fetchone()
    # mata-mata: se ESTA partida fechou, tenta montar a proxima rodada.
    # OBS p/ proxima refator: editar set de rodada ANTERIOR ja avancada nao
    # propaga troca de finalista. Nesse caso o certo e "Recomecar mata-mata".
    if p["fase"] == "mata" and p["finalizada"]:
        avancar_mata(conn)
    p = conn.execute("SELECT * FROM partidas WHERE id = ?", (partida_id,)).fetchone()
    return _partida_dict(conn, p)

@app.delete("/partidas/{partida_id}", status_code=204)
def deletar_partida(partida_id: int, conn: sqlite3.Connection = Depends(db_dep)):
    p = conn.execute("SELECT id FROM partidas WHERE id = ?", (partida_id,)).fetchone()
    if p is None:
        raise HTTPException(404, "Partida nao encontrada.")
    conn.execute("DELETE FROM partidas WHERE id = ?", (partida_id,))
    conn.commit()

# ---------------------------------------------------------------- classificacao

def _calcular_classificacao(conn: sqlite3.Connection, modo: str):
    """Deriva a tabela na hora. So conta a FASE DE GRUPOS (mata-mata nao entra).
    Sets ganhos/perdidos saem da tabela `sets`; pontos somados servem de desempate fino."""
    jogadores = conn.execute("SELECT id, nome, grupo FROM jogadores").fetchall()
    partidas = conn.execute(
        "SELECT * FROM partidas WHERE finalizada = 1 AND fase = 'grupos'"
    ).fetchall()
    grupo_de = {j["id"]: j["grupo"] for j in jogadores}

    tabela = {
        j["id"]: {
            "jogador_id": j["id"], "nome": j["nome"], "grupo": j["grupo"],
            "jogos": 0, "vitorias": 0, "derrotas": 0,
            "sets_ganhos": 0, "sets_perdidos": 0,
            "_pts_pro": 0, "_pts_contra": 0,   # desempate por pontos (nao vai no response)
        }
        for j in jogadores
    }

    for p in partidas:
        a, b = p["jogador_a_id"], p["jogador_b_id"]
        if modo == "grupos":
            ga, gb = grupo_de.get(a), grupo_de.get(b)
            if ga is None or ga != gb:
                continue  # so confronto dentro do mesmo grupo
        sets = _sets_de(conn, p["id"])
        sa = sum(1 for s in sets if s["pontos_a"] > s["pontos_b"])   # sets vencidos por A
        sb = sum(1 for s in sets if s["pontos_b"] > s["pontos_a"])
        pa = sum(s["pontos_a"] for s in sets)                         # pontos somados de A
        pb = sum(s["pontos_b"] for s in sets)
        venceu_a = p["sets_a"] > p["sets_b"]
        for pid, sg, sp, pp, pc, venceu in [
            (a, sa, sb, pa, pb, venceu_a),
            (b, sb, sa, pb, pa, not venceu_a),
        ]:
            t = tabela[pid]
            t["jogos"] += 1
            t["sets_ganhos"] += sg
            t["sets_perdidos"] += sp
            t["_pts_pro"] += pp
            t["_pts_contra"] += pc
            t["vitorias" if venceu else "derrotas"] += 1

    linhas = []
    for t in tabela.values():
        if modo == "grupos" and t["grupo"] is None:
            continue  # sem grupo nao entra no ranking de grupos
        t["saldo_sets"] = t["sets_ganhos"] - t["sets_perdidos"]
        t["pontos"] = t["vitorias"] * 3
        linhas.append(t)

    # desempate: pontos > saldo de sets > sets ganhos > saldo de PONTOS (fino)
    def ordenar(x):
        base = (-x["pontos"], -x["saldo_sets"], -x["sets_ganhos"],
                -(x["_pts_pro"] - x["_pts_contra"]))
        return ((x["grupo"] or "~"),) + base if modo == "grupos" else base

    linhas.sort(key=ordenar)
    for t in linhas:               # higiene: remove campos internos do response
        t.pop("_pts_pro", None); t.pop("_pts_contra", None)
    return linhas

@app.get("/classificacao", response_model=list[LinhaClassificacao])
def classificacao(conn: sqlite3.Connection = Depends(db_dep)):
    return _calcular_classificacao(conn, get_modo_efetivo(conn))

# ---------------------------------------------------------------- mata-mata

def fase_grupos_completa(conn: sqlite3.Connection) -> bool:
    # todos os jogos da fase de grupos finalizados (e existe ao menos um)
    row = conn.execute(
        "SELECT COUNT(*) AS total, COALESCE(SUM(finalizada),0) AS feitas "
        "FROM partidas WHERE fase = 'grupos'"
    ).fetchone()
    return row["total"] > 0 and row["total"] == row["feitas"]

def campeoes_grupos(conn: sqlite3.Connection) -> dict:
    # 1o colocado de cada grupo, pela classificacao da fase de grupos
    linhas = _calcular_classificacao(conn, "grupos")
    campeao = {}
    for l in linhas:  # ja vem ordenado por grupo, depois ranking
        g = l["grupo"]
        if g in GRUPOS_FIXOS and g not in campeao:
            campeao[g] = l["jogador_id"]
    return campeao

def _vencedor(p) -> int:
    return p["jogador_a_id"] if p["sets_a"] > p["sets_b"] else p["jogador_b_id"]

def avancar_mata(conn: sqlite3.Connection) -> None:
    # motor generico: se a ultima rodada terminou e tem >1 jogo, cria a proxima
    # pareando os vencedores em ordem. Funciona pra 4 (semi->final) ou 8 (quartas->semi->final).
    row = conn.execute("SELECT MAX(rodada) AS r FROM partidas WHERE fase = 'mata'").fetchone()
    if row["r"] is None:
        return
    r = row["r"]
    jogos = conn.execute(
        "SELECT * FROM partidas WHERE fase = 'mata' AND rodada = ? ORDER BY id", (r,)
    ).fetchall()
    if len(jogos) <= 1:
        return  # rodada unica = final; nao ha proxima
    if not all(j["finalizada"] for j in jogos):
        return  # rodada ainda em andamento
    vencedores = [_vencedor(j) for j in jogos]
    md = _melhor_de_da_rodada(len(vencedores) // 2)  # ex: 2 vencedores -> 1 jogo (final) -> melhor de 5
    for i in range(0, len(vencedores), 2):
        conn.execute(
            "INSERT INTO partidas (jogador_a_id, jogador_b_id, fase, rodada, melhor_de) "
            "VALUES (?, ?, 'mata', ?, ?)",
            (vencedores[i], vencedores[i + 1], r + 1, md),
        )
    conn.commit()

@app.get("/mata-mata", response_model=list[Partida])
def listar_mata_mata(conn: sqlite3.Connection = Depends(db_dep)):
    rows = conn.execute(
        "SELECT * FROM partidas WHERE fase = 'mata' ORDER BY rodada, id"
    ).fetchall()
    return [_partida_dict(conn, r) for r in rows]

@app.post("/mata-mata/iniciar", response_model=list[Partida])
def iniciar_mata_mata(conn: sqlite3.Connection = Depends(db_dep)):
    if get_modo_efetivo(conn) != "grupos":
        raise HTTPException(400, "O mata-mata so existe na fase de grupos (todos os grupos completos).")
    if not fase_grupos_completa(conn):
        raise HTTPException(400, "Finalize todos os jogos da fase de grupos antes de iniciar o mata-mata.")
    campeoes = campeoes_grupos(conn)
    faltando = [g for g in GRUPOS_FIXOS if g not in campeoes]
    if faltando:
        raise HTTPException(400, f"Sem campeao definido no(s) grupo(s): {', '.join(faltando)}.")
    # recomeça o mata-mata: limpa o anterior e cria a rodada 1 (A1 x C1, B1 x D1)
    conn.execute("DELETE FROM partidas WHERE fase = 'mata'")
    ordem = [campeoes["A"], campeoes["C"], campeoes["B"], campeoes["D"]]
    md = _melhor_de_da_rodada(len(ordem) // 2)  # 4 campeoes -> 2 jogos (semis) -> melhor de 3
    for i in range(0, len(ordem), 2):
        conn.execute(
            "INSERT INTO partidas (jogador_a_id, jogador_b_id, fase, rodada, melhor_de) "
            "VALUES (?, ?, 'mata', 1, ?)",
            (ordem[i], ordem[i + 1], md),
        )
    conn.commit()
    rows = conn.execute(
        "SELECT * FROM partidas WHERE fase = 'mata' ORDER BY rodada, id"
    ).fetchall()
    return [_partida_dict(conn, r) for r in rows]

@app.delete("/mata-mata", status_code=204)
def limpar_mata_mata(conn: sqlite3.Connection = Depends(db_dep)):
    conn.execute("DELETE FROM partidas WHERE fase = 'mata'")
    conn.commit()

# ---------------------------------------------------------------- exportacao

@app.get("/exportar")
def exportar(conn: sqlite3.Connection = Depends(db_dep)):
    """Gera um zip com o campeonato em HTML estatico (100% offline)."""
    modo_ef = get_modo_efetivo(conn)
    jogadores = [dict(j) for j in conn.execute("SELECT id, nome, grupo FROM jogadores").fetchall()]
    # partidas com sets embutidos (o export usa o detalhe dos sets no placar)
    partidas = [_partida_dict(conn, p) for p in conn.execute("SELECT * FROM partidas ORDER BY id").fetchall()]
    classif = _calcular_classificacao(conn, modo_ef)
    mata = [p for p in partidas if p["fase"] == "mata"]

    # campeao: na fase de grupos sai do mata-mata; em pontos corridos e o lider (se tudo terminou)
    campeao_id = None
    if modo_ef == "grupos":
        if mata:
            ultima = max(p["rodada"] for p in mata)
            final = [p for p in mata if p["rodada"] == ultima]
            if len(final) == 1 and final[0]["finalizada"]:
                campeao_id = _vencedor(final[0])
    else:
        if fase_grupos_completa(conn) and classif:
            campeao_id = classif[0]["jogador_id"]

    conteudo = gerar_zip_export(modo_ef, jogadores, partidas, classif, mata, campeao_id)
    nome_zip = f"Campeonato_iFractal_{datetime.now().year}.zip"
    return Response(
        content=conteudo,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{nome_zip}"'},
    )

# ---------------------------------------------------------------- frontend
DIST = Path(__file__).parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
"""
API do torneio. Dois modos:
  - pontos_corridos: todos contra todos, classificacao geral unica
  - grupos: confrontos dentro de cada grupo, classificacao por grupo

Modelo de SETS (melhor de N):
  Toda partida e "melhor de N sets" (coluna melhor_de): grupos=3, quartas/semis=3, final=5.
  Os PONTOS de cada set vivem na tabela `sets` (FONTE DE VERDADE).
  Em `partidas`, sets_a/sets_b sao CACHE = quantos sets cada lado venceu.
  saca_inicial (0=A, 1=B, None) persiste quem abre o saque no set 1.

Formato grupos+mata (8/12/16 jogadores):
  4 grupos iguais de 2/3/4 -> avancam 1o E 2o de cada grupo (8 classificados)
  -> QUARTAS (cruzamento A1xB2, B1xA2, C1xD2, D1xC2) -> semis -> final (bo5).

Rodar local:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
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
    pontos_a: int = Field(ge=0, le=99)
    pontos_b: int = Field(ge=0, le=99)

class SetOut(BaseModel):
    numero: int
    pontos_a: int
    pontos_b: int

class SaqueIn(BaseModel):
    saca_inicial: int = Field(ge=0, le=1)

class Partida(BaseModel):
    id: int
    jogador_a_id: int
    jogador_b_id: int
    sets_a: int
    sets_b: int
    finalizada: bool
    fase: str = "grupos"
    rodada: Optional[int] = None
    melhor_de: int = 1
    sets: list[SetOut] = []
    saca_inicial: Optional[int] = None

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
    pontos_pro: int
    pontos_contra: int
    saldo_pontos: int
    pontos: int

class ConfigOut(BaseModel):
    modo: str
    modo_efetivo: str
    melhor_de_grupos: int
    melhor_de_mata: int
    melhor_de_final: int
    tema: str

class ConfigIn(BaseModel):
    modo: Optional[str] = None
    melhor_de_grupos: Optional[int] = None
    melhor_de_mata: Optional[int] = None
    melhor_de_final: Optional[int] = None
    tema: Optional[str] = None

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
    # fase de grupos so vale com 4 grupos IGUAIS de 2, 3 ou 4 (=> 8, 12 ou 16 jogadores).
    cont = {g: 0 for g in GRUPOS_FIXOS}
    rows = conn.execute(
        "SELECT grupo, COUNT(*) AS c FROM jogadores WHERE grupo IS NOT NULL GROUP BY grupo"
    ).fetchall()
    for r in rows:
        if r["grupo"] in cont:
            cont[r["grupo"]] = r["c"]
    tamanhos = set(cont.values())
    return len(tamanhos) == 1 and next(iter(tamanhos)) in (2, 3, 4)

def get_modo_efetivo(conn: sqlite3.Connection) -> str:
    if get_modo(conn) == "grupos" and grupos_completos(conn):
        return "grupos"
    return "pontos_corridos"

# ---------------------------------------------------------------- helpers de set/partida

def _set_valido(pa: int, pb: int) -> bool:
    return (pa >= 11 or pb >= 11) and abs(pa - pb) >= 2

def _sets_para_vencer(melhor_de: int) -> int:
    return melhor_de // 2 + 1

# melhor_de configuravel por fase (guardado na tabela config). Os defaults
# reproduzem o comportamento antigo: grupos bo3, mata bo3, final bo5.
_MELHOR_DE_PADRAO = {"melhor_de_grupos": 3, "melhor_de_mata": 3, "melhor_de_final": 5}
_MELHOR_DE_VALIDOS = (3, 5, 7)

def _get_melhor_de(conn, chave: str) -> int:
    row = conn.execute("SELECT valor FROM config WHERE chave = ?", (chave,)).fetchone()
    if row is None:
        return _MELHOR_DE_PADRAO[chave]
    try:
        v = int(row["valor"])
    except (ValueError, TypeError):
        return _MELHOR_DE_PADRAO[chave]
    return v if v in _MELHOR_DE_VALIDOS else _MELHOR_DE_PADRAO[chave]

def _melhor_de_da_rodada(conn, n_jogos: int) -> int:
    # 1 jogo = FINAL; demais (quartas/semis) = mata. Le da config por fase.
    chave = "melhor_de_final" if n_jogos == 1 else "melhor_de_mata"
    return _get_melhor_de(conn, chave)

# tema visual (global, na config). "auto" segue o sistema no front.
_TEMAS_VALIDOS = ("eclipse", "nebula", "pure", "auto")

def _get_tema(conn) -> str:
    row = conn.execute("SELECT valor FROM config WHERE chave = 'tema'").fetchone()
    if row is None:
        return "auto"
    return row["valor"] if row["valor"] in _TEMAS_VALIDOS else "auto"

def _sets_de(conn, partida_id: int):
    return conn.execute(
        "SELECT numero, pontos_a, pontos_b FROM sets WHERE partida_id = ? ORDER BY numero",
        (partida_id,),
    ).fetchall()

def _partida_dict(conn, row) -> dict:
    d = dict(row)
    d["sets"] = [dict(s) for s in _sets_de(conn, row["id"])]
    return d

def _recalcular_partida(conn, partida_id: int) -> None:
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

def _set_config(conn, chave: str, valor: str) -> None:
    conn.execute(
        "INSERT INTO config (chave, valor) VALUES (?, ?) "
        "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        (chave, valor),
    )

def _config_out(conn) -> dict:
    return {
        "modo": get_modo(conn),
        "modo_efetivo": get_modo_efetivo(conn),
        "melhor_de_grupos": _get_melhor_de(conn, "melhor_de_grupos"),
        "melhor_de_mata": _get_melhor_de(conn, "melhor_de_mata"),
        "melhor_de_final": _get_melhor_de(conn, "melhor_de_final"),
        "tema": _get_tema(conn),
    }

@app.get("/config", response_model=ConfigOut)
def ler_config(conn: sqlite3.Connection = Depends(db_dep)):
    return _config_out(conn)

@app.put("/config", response_model=ConfigOut)
def definir_config(dados: ConfigIn, conn: sqlite3.Connection = Depends(db_dep)):
    if dados.modo is not None:
        if dados.modo not in ("pontos_corridos", "grupos"):
            raise HTTPException(400, "Modo invalido.")
        _set_config(conn, "modo", dados.modo)
    for chave, val in (
        ("melhor_de_grupos", dados.melhor_de_grupos),
        ("melhor_de_mata", dados.melhor_de_mata),
        ("melhor_de_final", dados.melhor_de_final),
    ):
        if val is not None:
            if val not in _MELHOR_DE_VALIDOS:
                raise HTTPException(400, f"melhor_de invalido: {val} (use 3, 5 ou 7).")
            _set_config(conn, chave, str(val))
    if dados.tema is not None:
        if dados.tema not in _TEMAS_VALIDOS:
            raise HTTPException(400, f"tema invalido: {dados.tema}.")
        _set_config(conn, "tema", dados.tema)
    conn.commit()
    return _config_out(conn)

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
    # partida de grupos: melhor_de vem da config (melhor_de_grupos)
    md = _get_melhor_de(conn, "melhor_de_grupos")
    cur = conn.execute(
        "INSERT INTO partidas (jogador_a_id, jogador_b_id, melhor_de) VALUES (?, ?, ?)",
        (dados.jogador_a_id, dados.jogador_b_id, md),
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
    if p["fase"] == "mata" and p["finalizada"]:
        avancar_mata(conn)
    p = conn.execute("SELECT * FROM partidas WHERE id = ?", (partida_id,)).fetchone()
    return _partida_dict(conn, p)

@app.patch("/partidas/{partida_id}/saque", response_model=Partida)
def definir_saque(
    partida_id: int, dados: SaqueIn,
    conn: sqlite3.Connection = Depends(db_dep),
):
    p = conn.execute("SELECT id FROM partidas WHERE id = ?", (partida_id,)).fetchone()
    if p is None:
        raise HTTPException(404, "Partida nao encontrada.")
    conn.execute(
        "UPDATE partidas SET saca_inicial = ? WHERE id = ?",
        (dados.saca_inicial, partida_id),
    )
    conn.commit()
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
    """Deriva a tabela na hora. So conta a FASE DE GRUPOS.
    Desempate: Pontos > Saldo Sets > Sets Ganhos > Saldo Pontos > Pontos Feitos
    > confronto direto (empate de 2) > ID (final, deterministico).

    Em 'grupos' a tabela e separada POR grupo. Em 'pontos_corridos' e UNICA
    (global): o grupo NAO entra na ordenacao, senao a classificacao sai
    fragmentada por grupo em vez de ordenada por pontos."""
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
            "pontos_pro": 0, "pontos_contra": 0,
        }
        for j in jogadores
    }

    confronto = {}

    for p in partidas:
        a, b = p["jogador_a_id"], p["jogador_b_id"]
        if modo == "grupos":
            ga, gb = grupo_de.get(a), grupo_de.get(b)
            if ga is None or ga != gb:
                continue
        sets = _sets_de(conn, p["id"])
        sa = sum(1 for s in sets if s["pontos_a"] > s["pontos_b"])
        sb = sum(1 for s in sets if s["pontos_b"] > s["pontos_a"])
        pa = sum(s["pontos_a"] for s in sets)
        pb = sum(s["pontos_b"] for s in sets)
        venceu_a = p["sets_a"] > p["sets_b"]
        confronto[tuple(sorted((a, b)))] = a if venceu_a else b
        for pid, sg, sp, pp, pc, venceu in [
            (a, sa, sb, pa, pb, venceu_a),
            (b, sb, sa, pb, pa, not venceu_a),
        ]:
            t = tabela[pid]
            t["jogos"] += 1
            t["sets_ganhos"] += sg
            t["sets_perdidos"] += sp
            t["pontos_pro"] += pp
            t["pontos_contra"] += pc
            t["vitorias" if venceu else "derrotas"] += 1

    linhas = []
    for t in tabela.values():
        if modo == "grupos" and t["grupo"] is None:
            continue
        t["saldo_sets"] = t["sets_ganhos"] - t["sets_perdidos"]
        t["saldo_pontos"] = t["pontos_pro"] - t["pontos_contra"]
        t["pontos"] = t["vitorias"] * 3
        linhas.append(t)

    def chave_absoluta(x):
        return (-x["pontos"], -x["saldo_sets"], -x["sets_ganhos"],
                -x["saldo_pontos"], -x["pontos_pro"])

    # grupos: ordena por grupo, depois ranking, depois id (tabela por grupo).
    # pontos_corridos: tabela unica global -> o grupo NAO entra na chave,
    # senao a classificacao sai fragmentada por grupo em vez de por pontos.
    def chave_ordem(x):
        base = chave_absoluta(x) + (x["jogador_id"],)
        if modo == "grupos":
            return ((x["grupo"] or "~"),) + base
        return base

    linhas.sort(key=chave_ordem)

    # desempate final por confronto direto (so entre 2 realmente empatados).
    # grupos: restringe ao mesmo grupo. pontos_corridos: vale global (todos
    # jogaram contra todos, entao o confronto direto sempre existe).
    for i in range(len(linhas) - 1):
        x, y = linhas[i], linhas[i + 1]
        mesmo_contexto = (x["grupo"] == y["grupo"]) if modo == "grupos" else True
        if mesmo_contexto and chave_absoluta(x) == chave_absoluta(y):
            venc = confronto.get(tuple(sorted((x["jogador_id"], y["jogador_id"]))))
            if venc == y["jogador_id"]:
                linhas[i], linhas[i + 1] = y, x

    return linhas

@app.get("/classificacao", response_model=list[LinhaClassificacao])
def classificacao(conn: sqlite3.Connection = Depends(db_dep)):
    return _calcular_classificacao(conn, get_modo_efetivo(conn))

# ---------------------------------------------------------------- mata-mata

def fase_grupos_completa(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT COUNT(*) AS total, COALESCE(SUM(finalizada),0) AS feitas "
        "FROM partidas WHERE fase = 'grupos'"
    ).fetchone()
    return row["total"] > 0 and row["total"] == row["feitas"]

def classificados_grupos(conn: sqlite3.Connection) -> dict:
    # quantos avancam depende do TAMANHO do grupo:
    #   grupos de 2 ou 3 -> so o 1o (=> 4 classificados => semis)
    #   grupos de 4      -> 1o e 2o  (=> 8 classificados => quartas)
    # tamanho e uniforme (validado em grupos_completos), entao basta olhar um grupo.
    tam = conn.execute(
        "SELECT COUNT(*) AS c FROM jogadores WHERE grupo = 'A'"
    ).fetchone()["c"]
    vagas = 2 if tam == 4 else 1

    linhas = _calcular_classificacao(conn, "grupos")
    por_grupo: dict = {}
    for l in linhas:  # ja vem ordenado por grupo, depois ranking
        g = l["grupo"]
        if g in GRUPOS_FIXOS and len(por_grupo.get(g, [])) < vagas:
            por_grupo.setdefault(g, []).append(l["jogador_id"])
    return por_grupo

def _vencedor(p) -> int:
    return p["jogador_a_id"] if p["sets_a"] > p["sets_b"] else p["jogador_b_id"]

def avancar_mata(conn: sqlite3.Connection) -> None:
    # motor generico: se a ultima rodada terminou e tem >1 jogo, cria a proxima
    # pareando vencedores em ordem. Funciona pra quartas->semis->final.
    row = conn.execute("SELECT MAX(rodada) AS r FROM partidas WHERE fase = 'mata'").fetchone()
    if row["r"] is None:
        return
    r = row["r"]
    jogos = conn.execute(
        "SELECT * FROM partidas WHERE fase = 'mata' AND rodada = ? ORDER BY id", (r,)
    ).fetchall()
    if len(jogos) <= 1:
        return
    if not all(j["finalizada"] for j in jogos):
        return
    vencedores = [_vencedor(j) for j in jogos]
    md = _melhor_de_da_rodada(conn, len(vencedores) // 2)
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
        raise HTTPException(400, "O mata-mata so existe na fase de grupos (8, 12 ou 16 jogadores).")
    if not fase_grupos_completa(conn):
        raise HTTPException(400, "Finalize todos os jogos da fase de grupos antes de iniciar o mata-mata.")

    cls = classificados_grupos(conn)
    faltando = [g for g in GRUPOS_FIXOS if not cls.get(g)]
    if faltando:
        raise HTTPException(400, f"Grupo(s) sem classificado definido: {', '.join(faltando)}.")

    total = sum(len(v) for v in cls.values())
    conn.execute("DELETE FROM partidas WHERE fase = 'mata'")

    if total == 8:
        # 16 jogadores: grupos de 4 classificam 1o e 2o -> QUARTAS
        # cruzamento A1xB2, B1xA2, C1xD2, D1xC2
        a1, a2 = cls["A"][0], cls["A"][1]
        b1, b2 = cls["B"][0], cls["B"][1]
        c1, c2 = cls["C"][0], cls["C"][1]
        d1, d2 = cls["D"][0], cls["D"][1]
        confrontos = [(a1, b2), (b1, a2), (c1, d2), (d1, c2)]
    else:
        # 8 ou 12 jogadores: grupos de 2/3 classificam so o 1o -> SEMIS diretas
        # cruzamento A1xC1, B1xD1
        a1 = cls["A"][0]
        b1 = cls["B"][0]
        c1 = cls["C"][0]
        d1 = cls["D"][0]
        confrontos = [(a1, c1), (b1, d1)]

    md = _melhor_de_da_rodada(conn, len(confrontos))  # nao-final => melhor_de_mata
    for ja, jb in confrontos:
        conn.execute(
            "INSERT INTO partidas (jogador_a_id, jogador_b_id, fase, rodada, melhor_de) "
            "VALUES (?, ?, 'mata', 1, ?)",
            (ja, jb, md),
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
    partidas = [_partida_dict(conn, p) for p in conn.execute("SELECT * FROM partidas ORDER BY id").fetchall()]
    classif = _calcular_classificacao(conn, modo_ef)
    mata = [p for p in partidas if p["fase"] == "mata"]

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
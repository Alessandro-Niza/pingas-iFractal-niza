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

# ---- estatisticas por jogador (derivadas, sem schema novo) ----
class EstatVolume(BaseModel):
    jogos: int
    vitorias: int
    derrotas: int
    aproveitamento: float          # 0..1 (vitorias/jogos)
    sets_ganhos: int
    sets_perdidos: int
    pontos_por_set: float          # media de pontos FEITOS por set
    bagels_aplicados: int          # sets vencidos 11-0
    bagels_sofridos: int           # sets perdidos 0-11
    amostra_pequena: bool          # jogos < 3 (front exibe com ressalva)

class EstatH2H(BaseModel):
    adversario_id: int
    nome: str
    vitorias: int
    derrotas: int
    saldo_pontos: int
    jogos: int

class EstatFase(BaseModel):
    vitorias: int
    derrotas: int
    jogos: int

class EstatPorFase(BaseModel):
    grupos: Optional[EstatFase] = None
    mata: Optional[EstatFase] = None

class EstatClutch(BaseModel):
    sets_deuce: int                       # sets que foram a 10-10+ (envolvendo o jogador)
    vencidos: int                         # quantos desses ele venceu
    aproveitamento: Optional[float] = None  # vencidos/sets_deuce, ou None se nao houve deuce

class EstatJogador(BaseModel):
    jogador_id: int
    nome: str
    grupo: Optional[str]
    volume: EstatVolume
    head_to_head: list[EstatH2H]
    vitima: Optional[EstatH2H] = None        # quem ele mais atropelou (saldo de pontos)
    algoz: Optional[EstatH2H] = None         # quem mais o atropelou
    aluno: Optional[EstatH2H] = None         # reencontro (2+ jogos): domina no retrospecto
    doutrinador: Optional[EstatH2H] = None   # reencontro (2+ jogos): e dominado
    clutch: EstatClutch
    por_fase: EstatPorFase

# ---- resumo/dashboard do campeonato (superlativos comparativos) ----
class Premio(BaseModel):
    chave: str                      # id estavel (pra testid): "artilheiro", etc.
    titulo: str
    jogador: Optional[str] = None
    valor: Optional[str] = None
    detalhe: Optional[str] = None

class Atropelada(BaseModel):
    vencedor: str
    perdedor: str
    sets: str
    margem: int                     # saldo de pontos do confronto

class LinhaJogadorResumo(BaseModel):
    jogador_id: int
    nome: str
    jogos: int
    vitorias: int
    derrotas: int
    pontos: int
    media_set: float
    sets_ganhos: int
    sets_perdidos: int
    pontos_sofridos: int

class PassouPorBaixo(BaseModel):
    jogador_id: int
    nome: str
    vezes: int                      # quantos sets 0-11 (a zero) o jogador levou

class ResumoCampeonato(BaseModel):
    modo: str
    modo_efetivo: str
    fase_atual: str                 # sem_jogos | grupos | pontos_corridos | mata | encerrado
    campeao: Optional[str] = None
    total_partidas: int             # finalizadas
    partidas_totais: int            # todas (pra progresso)
    progresso: float                # 0..1
    total_sets: int
    total_pontos: int
    total_bagels: int
    premios: list[Premio]
    passou_por_baixo: list[PassouPorBaixo]
    jogadores: list[LinhaJogadorResumo]

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

def _estatisticas_jogador(conn: sqlite3.Connection, jid: int):
    """Estatisticas derivadas de TODAS as partidas finalizadas do jogador
    (grupos + mata). Funcao pura sobre o banco: facil de cobrir com pytest.
    Blocos que ficam vazios (ex: 'por fase' sem mata-mata) o front suprime."""
    jog = conn.execute(
        "SELECT id, nome, grupo FROM jogadores WHERE id = ?", (jid,)
    ).fetchone()
    if jog is None:
        return None

    nomes = {j["id"]: j["nome"] for j in conn.execute("SELECT id, nome FROM jogadores")}
    partidas = conn.execute(
        "SELECT * FROM partidas WHERE finalizada = 1 "
        "AND (jogador_a_id = ? OR jogador_b_id = ?)",
        (jid, jid),
    ).fetchall()

    jogos = vitorias = 0
    sets_g = sets_p = 0
    pontos_feitos = n_sets = 0
    bagels_ap = bagels_sof = 0
    deuce_total = deuce_venc = 0
    h2h: dict = {}                                  # adv -> {v,d,pf,pa}
    fase = {"grupos": [0, 0, 0], "mata": [0, 0, 0]}  # [v, d, jogos]

    for p in partidas:
        sou_a = p["jogador_a_id"] == jid
        adv = p["jogador_b_id"] if sou_a else p["jogador_a_id"]
        meus_sets = p["sets_a"] if sou_a else p["sets_b"]
        sets_adv = p["sets_b"] if sou_a else p["sets_a"]
        venci = meus_sets > sets_adv

        jogos += 1
        vitorias += 1 if venci else 0
        sets_g += meus_sets
        sets_p += sets_adv

        hv = h2h.setdefault(adv, {"v": 0, "d": 0, "pf": 0, "pa": 0})
        hv["v" if venci else "d"] += 1

        f = fase.get(p["fase"])
        if f is not None:
            f[0 if venci else 1] += 1
            f[2] += 1

        for stt in _sets_de(conn, p["id"]):
            meus = stt["pontos_a"] if sou_a else stt["pontos_b"]
            deles = stt["pontos_b"] if sou_a else stt["pontos_a"]
            n_sets += 1
            pontos_feitos += meus
            hv["pf"] += meus
            hv["pa"] += deles
            if meus == 11 and deles == 0:
                bagels_ap += 1
            if deles == 11 and meus == 0:
                bagels_sof += 1
            if meus >= 10 and deles >= 10:   # foi a deuce (10-10+)
                deuce_total += 1
                if meus > deles:
                    deuce_venc += 1

    derrotas = jogos - vitorias
    volume = {
        "jogos": jogos, "vitorias": vitorias, "derrotas": derrotas,
        "aproveitamento": (vitorias / jogos) if jogos else 0.0,
        "sets_ganhos": sets_g, "sets_perdidos": sets_p,
        "pontos_por_set": (pontos_feitos / n_sets) if n_sets else 0.0,
        "bagels_aplicados": bagels_ap, "bagels_sofridos": bagels_sof,
        "amostra_pequena": jogos < 3,
    }

    h2h_list = sorted(
        (
            {"adversario_id": adv, "nome": nomes.get(adv, "?"),
             "vitorias": h["v"], "derrotas": h["d"],
             "saldo_pontos": h["pf"] - h["pa"], "jogos": h["v"] + h["d"]}
            for adv, h in h2h.items()
        ),
        key=lambda x: (-(x["vitorias"] - x["derrotas"]), -x["saldo_pontos"], x["nome"]),
    )

    # VITIMA / ALGOZ: dominio por MARGEM DE PONTOS (funciona com 1 confronto so).
    # vitima = quem ele mais atropelou (venceu com maior saldo de pontos a favor);
    # algoz  = quem mais o atropelou (perdeu com maior saldo de pontos contra).
    venc_dom = [x for x in h2h_list if x["vitorias"] > x["derrotas"] and x["saldo_pontos"] > 0]
    perd_dom = [x for x in h2h_list if x["derrotas"] > x["vitorias"] and x["saldo_pontos"] < 0]
    vitima = max(venc_dom, key=lambda x: x["saldo_pontos"]) if venc_dom else None
    algoz = min(perd_dom, key=lambda x: x["saldo_pontos"]) if perd_dom else None

    # ALUNO / DOUTRINADOR: so no REENCONTRO (2+ jogos vs o mesmo adversario) — num
    # torneio de edicao unica isso so acontece se os dois caem juntos no mata-mata.
    aluno = doutrinador = None
    reencontros = [x for x in h2h_list if x["jogos"] >= 2]
    if reencontros:
        melhor = max(reencontros, key=lambda x: (x["vitorias"] - x["derrotas"], x["saldo_pontos"]))
        pior = min(reencontros, key=lambda x: (x["vitorias"] - x["derrotas"], -x["saldo_pontos"]))
        if melhor["vitorias"] - melhor["derrotas"] > 0:
            aluno = melhor
        if pior["vitorias"] - pior["derrotas"] < 0:
            doutrinador = pior

    clutch = {
        "sets_deuce": deuce_total, "vencidos": deuce_venc,
        "aproveitamento": (deuce_venc / deuce_total) if deuce_total else None,
    }

    por_fase = {"grupos": None, "mata": None}
    for nome_fase in ("grupos", "mata"):
        v, d, j = fase[nome_fase]
        if j > 0:
            por_fase[nome_fase] = {"vitorias": v, "derrotas": d, "jogos": j}

    return {
        "jogador_id": jog["id"], "nome": jog["nome"], "grupo": jog["grupo"],
        "volume": volume, "head_to_head": h2h_list,
        "vitima": vitima, "algoz": algoz,
        "aluno": aluno, "doutrinador": doutrinador,
        "clutch": clutch, "por_fase": por_fase,
    }

@app.get("/classificacao", response_model=list[LinhaClassificacao])
def classificacao(conn: sqlite3.Connection = Depends(db_dep)):
    return _calcular_classificacao(conn, get_modo_efetivo(conn))

def _resumo_campeonato(conn: sqlite3.Connection) -> dict:
    """Superlativos do torneio: compara TODOS os jogadores em cada categoria e
    aponta o lider. Funcao pura sobre o banco (facil de cobrir com pytest)."""
    jogadores = conn.execute("SELECT id, nome FROM jogadores").fetchall()
    nomes = {j["id"]: j["nome"] for j in jogadores}
    todas = conn.execute("SELECT * FROM partidas").fetchall()
    finalizadas = [p for p in todas if p["finalizada"]]
    mata = [p for p in todas if p["fase"] == "mata"]

    agg = {
        j["id"]: {"pf": 0, "pa": 0, "nsets": 0, "bagels_ap": 0, "bagels_sof": 0,
                  "deuce_t": 0, "deuce_v": 0, "jogos": 0, "vitorias": 0,
                  "sets_g": 0, "sets_p": 0}
        for j in jogadores
    }
    total_sets = total_pontos = total_bagels = 0

    for p in finalizadas:
        a, b = p["jogador_a_id"], p["jogador_b_id"]
        sets = _sets_de(conn, p["id"])
        pa_tot = sum(x["pontos_a"] for x in sets)
        pb_tot = sum(x["pontos_b"] for x in sets)
        venceu_a = p["sets_a"] > p["sets_b"]

        for pid, meus, deles, venci, msets, dsets in (
            (a, pa_tot, pb_tot, venceu_a, p["sets_a"], p["sets_b"]),
            (b, pb_tot, pa_tot, not venceu_a, p["sets_b"], p["sets_a"]),
        ):
            g = agg.get(pid)
            if g is None:
                continue
            g["pf"] += meus
            g["pa"] += deles
            g["jogos"] += 1
            g["vitorias"] += 1 if venci else 0
            g["sets_g"] += msets
            g["sets_p"] += dsets

        for x in sets:
            total_sets += 1
            total_pontos += x["pontos_a"] + x["pontos_b"]
            for pid, meus, deles in ((a, x["pontos_a"], x["pontos_b"]), (b, x["pontos_b"], x["pontos_a"])):
                g = agg.get(pid)
                if g is None:
                    continue
                g["nsets"] += 1
                if meus == 11 and deles == 0:
                    g["bagels_ap"] += 1
                    total_bagels += 1
                if deles == 11 and meus == 0:
                    g["bagels_sof"] += 1
                if meus >= 10 and deles >= 10:
                    g["deuce_t"] += 1
                    if meus > deles:
                        g["deuce_v"] += 1

    jogou = {pid: g for pid, g in agg.items() if g["jogos"] > 0}
    premios = []

    if jogou:
        pid = max(jogou, key=lambda k: jogou[k]["pf"])
        g = jogou[pid]
        premios.append({"chave": "artilheiro", "titulo": "Artilheiro",
                        "jogador": nomes.get(pid), "valor": f'{g["pf"]} pts',
                        "detalhe": f'{g["pf"] / max(1, g["nsets"]):.1f} por set'})

    cand = {pid: g for pid, g in jogou.items() if g["bagels_ap"] > 0}
    if cand:
        pid = max(cand, key=lambda k: cand[k]["bagels_ap"])
        premios.append({"chave": "rei_bagel", "titulo": "Rei do bagel",
                        "jogador": nomes.get(pid), "valor": str(cand[pid]["bagels_ap"]),
                        "detalhe": "sets a zero (11-0)"})

    cand = {pid: g for pid, g in jogou.items() if g["nsets"] >= 3}
    if cand:
        pid = min(cand, key=lambda k: cand[k]["pa"] / cand[k]["nsets"])
        media = cand[pid]["pa"] / cand[pid]["nsets"]
        premios.append({"chave": "muralha", "titulo": "Muralha",
                        "jogador": nomes.get(pid), "valor": f'{media:.1f}',
                        "detalhe": "pontos sofridos por set"})

    cand = {pid: g for pid, g in jogou.items() if g["deuce_t"] >= 2}
    if cand:
        pid = max(cand, key=lambda k: cand[k]["deuce_v"] / cand[k]["deuce_t"])
        g = cand[pid]
        premios.append({"chave": "clutch", "titulo": "Mais clutch",
                        "jogador": nomes.get(pid), "valor": f'{round(g["deuce_v"] / g["deuce_t"] * 100)}%',
                        "detalhe": f'{g["deuce_v"]}/{g["deuce_t"]} sets no deuce'})

    jogadores_lista = sorted(
        (
            {"jogador_id": pid, "nome": nomes.get(pid, "?"),
             "jogos": g["jogos"], "vitorias": g["vitorias"],
             "derrotas": g["jogos"] - g["vitorias"], "pontos": g["pf"],
             "media_set": (g["pf"] / g["nsets"]) if g["nsets"] else 0.0,
             "sets_ganhos": g["sets_g"], "sets_perdidos": g["sets_p"],
             "pontos_sofridos": g["pa"]}
            for pid, g in jogou.items()
        ),
        key=lambda x: (-x["vitorias"], -(x["pontos"] - x["pontos_sofridos"]), -x["pontos"], x["nome"]),
    )

    passou_por_baixo = sorted(
        (
            {"jogador_id": pid, "nome": nomes.get(pid, "?"), "vezes": g["bagels_sof"]}
            for pid, g in agg.items() if g["bagels_sof"] > 0
        ),
        key=lambda x: (-x["vezes"], x["nome"]),
    )

    # campeao + fase atual
    modo_ef = get_modo_efetivo(conn)
    campeao = None
    if mata:
        rodadas = sorted({(p["rodada"] or 0) for p in mata})
        final = [p for p in mata if (p["rodada"] or 0) == rodadas[-1]]
        if len(final) == 1 and final[0]["finalizada"]:
            f = final[0]
            vid = f["jogador_a_id"] if f["sets_a"] > f["sets_b"] else f["jogador_b_id"]
            campeao = nomes.get(vid)
    elif finalizadas and all(p["finalizada"] for p in todas):
        cls = _calcular_classificacao(conn, modo_ef)
        if cls:
            campeao = cls[0]["nome"]

    if len(todas) == 0:
        fase_atual = "sem_jogos"
    elif mata:
        fase_atual = "encerrado" if campeao else "mata"
    elif modo_ef == "grupos":
        fase_atual = "grupos"
    else:
        fase_atual = "encerrado" if all(p["finalizada"] for p in todas) else "pontos_corridos"

    return {
        "modo": get_modo(conn), "modo_efetivo": modo_ef,
        "fase_atual": fase_atual, "campeao": campeao,
        "total_partidas": len(finalizadas), "partidas_totais": len(todas),
        "progresso": (len(finalizadas) / len(todas)) if todas else 0.0,
        "total_sets": total_sets, "total_pontos": total_pontos, "total_bagels": total_bagels,
        "premios": premios,
        "passou_por_baixo": passou_por_baixo,
        "jogadores": jogadores_lista,
    }


@app.get("/campeonato/resumo", response_model=ResumoCampeonato)
def resumo_campeonato(conn: sqlite3.Connection = Depends(db_dep)):
    return _resumo_campeonato(conn)


@app.get("/jogadores/{jogador_id}/estatisticas", response_model=EstatJogador)
def estatisticas_jogador(jogador_id: int, conn: sqlite3.Connection = Depends(db_dep)):
    est = _estatisticas_jogador(conn, jogador_id)
    if est is None:
        raise HTTPException(404, "Jogador nao encontrado.")
    return est

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
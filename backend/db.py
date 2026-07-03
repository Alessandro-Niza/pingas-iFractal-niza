"""
Camada de banco. Usa sqlite3 da stdlib — zero dependencia extra, perfeito pro Pi.
A classificacao NAO e tabela: e calculada em cima das partidas/sets (uma fonte de verdade so).

MODELO DE SETS (refator "Uniforme"):
  Toda partida e disputada em "melhor de N sets" (coluna melhor_de):
    - fase de grupos -> melhor_de = 1 (set unico, como sempre foi)
    - mata-mata      -> semis = 3, final = 5 (definido ao criar a rodada)
  Os PONTOS de cada set ficam na tabela `sets` (uma linha por set) = FONTE DE VERDADE.
  Em `partidas`, sets_a/sets_b sao CACHE DERIVADO: quantos sets cada lado venceu.

  saca_inicial: quem abre o saque no set 1 (0=A, 1=B, NULL=nao escolhido).
  Persistido aqui pra sobreviver a reload da pagina (antes vivia so no front).

  >>> ATENCAO p/ proxima refatoracao: sets_a/sets_b MUDARAM de significado.
      Antes guardavam os PONTOS do set unico (ex: 11 e 8).
      Agora guardam a CONTAGEM de sets vencidos (ex: 2 e 1).
      Os pontos foram para a tabela `sets`.
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "torneio.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS jogadores (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    nome  TEXT NOT NULL UNIQUE,
    grupo TEXT                       -- "A".."D" ou NULL (sem grupo)
);

CREATE TABLE IF NOT EXISTS partidas (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    jogador_a_id INTEGER NOT NULL REFERENCES jogadores(id) ON DELETE CASCADE,
    jogador_b_id INTEGER NOT NULL REFERENCES jogadores(id) ON DELETE CASCADE,
    sets_a       INTEGER NOT NULL DEFAULT 0,   -- CACHE: sets vencidos por A (derivado de `sets`)
    sets_b       INTEGER NOT NULL DEFAULT 0,   -- CACHE: sets vencidos por B (derivado de `sets`)
    finalizada   INTEGER NOT NULL DEFAULT 0,   -- CACHE: 1 quando alguem alcanca os sets necessarios
    fase         TEXT NOT NULL DEFAULT 'grupos',  -- 'grupos' | 'mata' (mata-mata)
    rodada       INTEGER,                          -- nro da rodada do mata-mata (NULL na fase de grupos)
    melhor_de    INTEGER NOT NULL DEFAULT 1,       -- 1, 3 ou 5: maximo de sets da partida
    saca_inicial INTEGER                           -- 0=jogador A, 1=jogador B, NULL=nao escolhido
);

-- Um set individual de uma partida. FONTE DE VERDADE dos pontos.
CREATE TABLE IF NOT EXISTS sets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    partida_id  INTEGER NOT NULL REFERENCES partidas(id) ON DELETE CASCADE,
    numero      INTEGER NOT NULL,   -- ordem do set: 1, 2, 3...
    pontos_a    INTEGER NOT NULL,
    pontos_b    INTEGER NOT NULL,
    UNIQUE(partida_id, numero)      -- nao existe "set 2" duplicado na mesma partida
);

CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);
"""


def get_conn() -> sqlite3.Connection:
    # check_same_thread=False: o FastAPI atende requisicoes em threads diferentes,
    # e abrimos UMA conexao nova por request (via db_dep), entao e seguro liberar.
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row          # acessar colunas por nome: row["nome"]
    conn.execute("PRAGMA foreign_keys = ON")  # respeitar as FKs / cascade (inclui sets -> partidas)
    return conn


def _migrar_para_sets(conn) -> None:
    """Converte partidas finalizadas do modelo antigo (sets_a/sets_b = pontos do set unico)
    para o modelo de sets: cria o set #1 com aqueles pontos e recalcula sets_a/sets_b como
    CONTAGEM de sets. Idempotente: so age em partidas que ainda nao tem nenhum set."""
    antigas = conn.execute(
        "SELECT id, sets_a, sets_b FROM partidas p "
        "WHERE finalizada = 1 "
        "AND NOT EXISTS (SELECT 1 FROM sets s WHERE s.partida_id = p.id)"
    ).fetchall()
    for p in antigas:
        pa, pb = p["sets_a"], p["sets_b"]
        if pa == pb:
            continue  # nao deveria existir (jogo antigo nao empatava), mas guarda defensiva
        conn.execute(
            "INSERT INTO sets (partida_id, numero, pontos_a, pontos_b) VALUES (?, 1, ?, ?)",
            (p["id"], pa, pb),
        )
        va, vb = (1, 0) if pa > pb else (0, 1)   # set unico => vencedor leva 1 set
        conn.execute("UPDATE partidas SET sets_a = ?, sets_b = ? WHERE id = ?", (va, vb, p["id"]))


def init_db() -> None:
    conn = get_conn()
    conn.executescript(SCHEMA)
    # migracoes p/ bancos antigos: adiciona colunas que faltam (ignora se ja existem).
    for ddl in (
        "ALTER TABLE jogadores ADD COLUMN grupo TEXT",
        "ALTER TABLE partidas ADD COLUMN fase TEXT NOT NULL DEFAULT 'grupos'",
        "ALTER TABLE partidas ADD COLUMN rodada INTEGER",
        "ALTER TABLE partidas ADD COLUMN melhor_de INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE partidas ADD COLUMN saca_inicial INTEGER",
    ):
        try:
            conn.execute(ddl)
        except sqlite3.OperationalError:
            pass  # coluna ja existe, segue o jogo
    _migrar_para_sets(conn)  # converte dados antigos pro modelo de sets (idempotente)
    # modo padrao do torneio (so insere se ainda nao existir)
    conn.execute(
        "INSERT OR IGNORE INTO config (chave, valor) VALUES ('modo', 'pontos_corridos')"
    )
    conn.commit()
    conn.close()


# Dependencia do FastAPI: abre conexao por request e fecha no fim.
def db_dep():
    conn = get_conn()
    try:
        yield conn
    finally:
        conn.close()
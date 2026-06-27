"""
Camada de banco. Usa sqlite3 da stdlib — zero dependencia extra, perfeito pro Pi.
A classificacao NAO e tabela: e calculada em cima das partidas (uma fonte de verdade so).
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
    sets_a       INTEGER NOT NULL DEFAULT 0,
    sets_b       INTEGER NOT NULL DEFAULT 0,
    finalizada   INTEGER NOT NULL DEFAULT 0,  -- 0 = agendada, 1 = resultado registrado
    fase         TEXT NOT NULL DEFAULT 'grupos',  -- 'grupos' | 'mata' (mata-mata)
    rodada       INTEGER                          -- nro da rodada do mata-mata (NULL na fase de grupos)
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
    conn.execute("PRAGMA foreign_keys = ON")  # respeitar as FKs / cascade
    return conn


def init_db() -> None:
    conn = get_conn()
    conn.executescript(SCHEMA)
    # migracao p/ bancos antigos: adiciona a coluna grupo se ainda nao existir.
    try:
        conn.execute("ALTER TABLE jogadores ADD COLUMN grupo TEXT")
    except sqlite3.OperationalError:
        pass  # coluna ja existe, segue o jogo
    # migracao p/ mata-mata: colunas fase/rodada nas partidas
    try:
        conn.execute("ALTER TABLE partidas ADD COLUMN fase TEXT NOT NULL DEFAULT 'grupos'")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE partidas ADD COLUMN rodada INTEGER")
    except sqlite3.OperationalError:
        pass
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

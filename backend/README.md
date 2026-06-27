# Torneio — backend (fatia 1)

Sistema enxuto de torneio de tênis de mesa em **pontos corridos, melhor de sets**.
Mesma stack do NizaWorks (FastAPI + SQLite), de propósito — isso aqui é treino que
transfere direto pro produto.

## O que tem
- `db.py` — schema SQLite + conexão (só stdlib, leve pro Pi)
- `main.py` — models Pydantic + endpoints
- 2 tabelas: `jogadores`, `partidas`. **Classificação não é tabela** — é derivada das partidas.

## Rodar

```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Abre as docs interativas (testa tudo pelo navegador, sem precisar de front):
http://localhost:8000/docs

O arquivo `torneio.db` é criado sozinho no primeiro acesso.

## Endpoints

| Método | Rota | O que faz |
|---|---|---|
| POST | `/jogadores` | cadastra `{ "nome": "Niza" }` |
| GET  | `/jogadores` | lista |
| POST | `/partidas` | cria `{ "jogador_a_id": 1, "jogador_b_id": 2 }` |
| GET  | `/partidas` | lista |
| PATCH| `/partidas/{id}/resultado` | registra `{ "sets_a": 3, "sets_b": 1 }` |
| GET  | `/classificacao` | tabela ordenada (pontos > saldo de sets > sets ganhos) |

## Regras embutidas
- Nome de jogador é único.
- Jogador não joga contra si mesmo.
- Resultado em sets não pode empatar (melhor de sets sempre tem vencedor).
- Pontuação: **3 por vitória**. Desempate por saldo de sets.

## Nota pro Pi
`uvicorn[standard]` traz uvloop/httptools (compilam no ARM, mas ajudam).
Se a instalação no Pi der trabalho, troca por `uvicorn` puro no requirements —
funciona igual, só um pouco menos otimizado.

## Próxima fatia
Frontend: 3 telas (Jogadores / Partidas / Classificação) em Vite + TS.

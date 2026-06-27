# Frontend — torneio (fatia 2)

3 telas (Classificação / Partidas / Jogadores) em Vite + React + TS, tema dark.
Consome a API da fatia 1 (FastAPI + SQLite).

## Como plugar no seu projeto (PINGAS-IFRACTAL-NIZA)

1. Copie o conteúdo de `src/` aqui pra dentro do `src/` do seu projeto:
   - `api.ts`
   - `App.tsx`            (substitui o do template)
   - `main.tsx`          (substitui o do template)
   - `screens/Classificacao.tsx`
   - `screens/Partidas.tsx`
   - `screens/Jogadores.tsx`
   - `styles/theme.css`

2. Apague os resíduos do template (não são mais usados):
   - `src/App.css`
   - `src/index.css`
   - `src/assets/styles/animations.css`, `layout.css`, `global.css`
   - `src/assets/react.svg`, `vite.svg`, `hero.png`

3. Suba o backend (na pasta da fatia 1):
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

4. Suba o front:
   ```bash
   npm run dev
   ```
   Abre o que o Vite mostrar (geralmente http://localhost:5173).

## Como usar
1. Aba **Jogadores** → cadastra a galera.
2. Aba **Partidas** → "Gerar confrontos (todos contra todos)" cria a rodada
   inteira de uma vez. Digita os sets de cada jogo e Salvar.
3. Aba **Classificação** → ordena sozinha (pontos > saldo de sets > sets ganhos).

## Decisões (e onde mudar)
- **API base** em `api.ts`: em dev aponta pra :8000; em produção usa caminho
  relativo (o FastAPI vai servir o build na mesma origem). Não precisa mexer.
- **Sem react-router**: navegação por abas (`useState` no App). Uma dep a menos.
- **Fonte do sistema**: zero fetch externo, carrega na hora. Pro Pi/rede local
  isso importa.
- **Gerar confrontos** roda no front (loop de POSTs). Se um dia quiser que o
  backend gere, dá pra mover pra um endpoint — mas assim já resolve.

## Quando for pro Pi (resumo)
`npm run build` gera `dist/`. Você aponta o FastAPI pra servir esses arquivos
estáticos (StaticFiles), e aí front + back ficam na mesma origem, sem CORS.
Isso é exatamente o mesmo deploy que você vai usar no NizaWorks — vale resolver
aqui primeiro. Posso montar esse passo quando você chegar nele.

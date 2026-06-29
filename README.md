🏓 Pingas iFractal

Sistema web para gerenciamento de campeonatos de tênis de mesa, desenvolvido com React + TypeScript + Vite no frontend e FastAPI + SQLite no backend.

⸻

🚀 Tecnologias

Frontend

* React
* TypeScript
* Vite
* CSS (Design System próprio)

Backend

* FastAPI
* SQLite
* Uvicorn

⸻

📁 Estrutura do projeto

Pingas_iFractal/
│
├── backend/
│   ├── main.py
│   ├── db.py
│   ├── requirements.txt
│   └── ...
│
├── frontend/
│   ├── src/
│   ├── package.json
│   └── ...
│
├── docs/
│
├── .gitignore
└── README.md

⸻

▶️ Executando o projeto

1. Backend

Entre na pasta:

cd backend

Ative o ambiente virtual.

macOS / Linux

source .venv/bin/activate

Windows

.venv\Scripts\activate

Instale as dependências:

pip install -r requirements.txt

Execute:

uvicorn main:app --reload --host 0.0.0.0 --port 8000

API disponível em:

http://localhost:8000

Swagger:

http://localhost:8000/docs

⸻

2. Frontend

Entre na pasta:

cd frontend

Instale as dependências:

npm install

Execute:

npm run dev

O Vite normalmente estará disponível em:

http://localhost:5173

⸻

🏆 Funcionalidades

Gerenciamento

* Cadastro de jogadores
* Cadastro de grupos
* Geração automática de confrontos
* Registro de resultados
* Classificação automática
* Mata-mata
* Configurações do torneio

⸻

Classificação

Ordenação automática considerando:

1. Pontos
2. Saldo de sets
3. Sets ganhos

⸻

Partidas

* Geração automática de confrontos
* Edição de placares
* Validação automática do vencedor
* Regra oficial do tênis de mesa (vantagem após 10×10)

⸻

📱 Interface

* React + TypeScript
* Dashboard responsivo
* Tema Dark
* Design System próprio
* Compatível com Desktop, Tablet e Mobile

⸻

💾 Banco de Dados

Durante o desenvolvimento, a aplicação utiliza:

SQLite

Arquivo:

backend/torneio.db

A camada de persistência foi desenvolvida para permitir evolução futura para outros bancos de dados, caso necessário.

⸻

🛣️ Roadmap

✅ MVP

* Cadastro de jogadores
* Grupos
* Partidas
* Classificação
* Mata-mata
* Configurações

🚧 Próximas evoluções

* Novo Design System inspirado na identidade visual da NizaWorks
* Responsividade completa
* Dashboard Tech
* Exportação de resultados
* Banco de dados em nuvem
* Autenticação de usuários
* Histórico de campeonatos
* Estatísticas dos jogadores

⸻

👨‍💻 Autor

Alessandro Niza

Projeto desenvolvido para gerenciamento de campeonatos de tênis de mesa, com foco em simplicidade, desempenho e evolução contínua.
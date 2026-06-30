# 🏓 Pingas iFractal

> Plataforma web para gerenciamento de campeonatos de tênis de mesa, desenvolvida com **React**, **TypeScript**, **FastAPI** e **SQLite**, oferecendo uma experiência moderna, intuitiva e escalável para organização de torneios.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)
![Python](https://img.shields.io/badge/Python-3-3776AB?logo=python)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![License](https://img.shields.io/badge/Status-Em%20Desenvolvimento-blue)

---

# 📖 Sobre o Projeto

O **Pingas iFractal** é uma aplicação web desenvolvida para automatizar o gerenciamento de campeonatos de tênis de mesa.

A plataforma permite organizar todo o fluxo do torneio, desde o cadastro dos jogadores até a definição do campeão, contemplando geração automática de confrontos, classificação em tempo real, fase eliminatória (mata-mata) e gerenciamento completo das partidas.

O projeto foi concebido seguindo uma arquitetura cliente-servidor, separando completamente a interface da aplicação da camada de regras de negócio, facilitando sua manutenção e evolução.

---

# 🏗 Arquitetura

```text
                 React + TypeScript
                        │
                 HTTP (REST API)
                        │
                 FastAPI (Python)
                        │
                     SQLite
```

A separação entre frontend e backend permite evoluções independentes, integração com novos serviços e futura migração para bancos de dados mais robustos.

---

# 🚀 Stack Tecnológica

## Frontend

| Tecnologia | Descrição |
|------------|-----------|
| **React** | Construção da interface baseada em componentes reutilizáveis |
| **TypeScript** | Tipagem estática para maior segurança e produtividade |
| **Vite** | Ambiente de desenvolvimento rápido e otimização do build |
| **CSS** | Design System próprio, responsividade e tema Dark |

---

## Backend

| Tecnologia | Descrição |
|------------|-----------|
| **FastAPI** | Desenvolvimento da API REST |
| **SQLite** | Persistência de dados durante o desenvolvimento |
| **Uvicorn** | Servidor ASGI responsável pela execução da aplicação |

---

# 📁 Estrutura do Projeto

```text
Pingas_iFractal/
│
├── backend/
│   ├── main.py              # API REST
│   ├── db.py                # Persistência de dados
│   ├── exportar.py          # Exportação de informações
│   ├── requirements.txt
│   └── torneio.db
│
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── styles/
│   │   ├── api.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   │
│   ├── package.json
│   └── vite.config.ts
│
├── docs/
│
├── README.md
└── .gitignore
```

---

# ▶️ Executando o Projeto

## Backend

Entre na pasta:

```bash
cd backend
```

Ative o ambiente virtual.

### macOS / Linux

```bash
source .venv/bin/activate
```

### Windows

```bash
.venv\Scripts\activate
```

Instale as dependências:

```bash
pip install -r requirements.txt
```

Execute a API:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

A API ficará disponível em:

```
http://localhost:8000
```

Swagger:

```
http://localhost:8000/docs
```

---

## Frontend

Entre na pasta:

```bash
cd frontend
```

Instale as dependências:

```bash
npm install
```

Execute:

```bash
npm run dev -- --host
```

Aplicação disponível em:

```
http://localhost:5173
```

> O parâmetro `--host` permite acessar o sistema através de outros dispositivos conectados à mesma rede.

---

# 🏆 Funcionalidades

## Gerenciamento

- Cadastro de jogadores
- Organização por grupos
- Geração automática de confrontos
- Registro de resultados
- Classificação automática
- Mata-mata
- Configurações do campeonato

---

## Classificação

A classificação é atualizada automaticamente utilizando os seguintes critérios:

1. Pontos
2. Saldo de Sets
3. Sets Ganhos

---

## Controle das Partidas

- Geração automática dos confrontos
- Registro de placares
- Validação automática do vencedor
- Definição do primeiro sacador
- Controle automático da alternância de saque
- Aplicação da regra oficial após **10 × 10**
- Atualização em tempo real da classificação

---

# 📱 Interface

O frontend foi desenvolvido utilizando um Design System próprio inspirado em dashboards modernos.

Características:

- 🌙 Tema Dark
- 📱 Layout Responsivo
- 💻 Desktop
- 📱 Tablet
- 📲 Mobile
- ⚡ Atualização dinâmica dos dados
- 🎯 Componentização utilizando React

---

# 💾 Persistência

Durante o desenvolvimento, a aplicação utiliza SQLite.

Arquivo utilizado:

```text
backend/torneio.db
```

A camada de persistência foi desenvolvida visando facilitar uma futura migração para bancos de dados como PostgreSQL, MySQL ou SQL Server.

---

# 📈 Roadmap

## ✅ MVP

- Cadastro de jogadores
- Cadastro de grupos
- Partidas
- Classificação
- Mata-mata
- Configurações

---

## 🚧 Próximas Evoluções

- Sistema de autenticação (JWT)
- Múltiplos campeonatos por usuário
- Dashboard analítico
- Estatísticas avançadas dos jogadores
- Histórico de campeonatos
- Compartilhamento de torneios
- Banco de dados em nuvem
- Ranking histórico de jogadores
- Integração com dispositivos Bluetooth para marcação de pontos

---

# 🎯 Objetivos do Projeto

- Automatizar o gerenciamento de campeonatos.
- Reduzir erros durante a organização das partidas.
- Melhorar a experiência dos organizadores.
- Disponibilizar uma plataforma moderna e intuitiva para torneios de tênis de mesa.

---

# 👨‍💻 Autor

**Alessandro Niza**

Projeto desenvolvido com foco em boas práticas de arquitetura, experiência do usuário e evolução contínua, buscando oferecer uma solução moderna para organização de campeonatos de tênis de mesa.
.PHONY: help install frontend backend build lint clean

# ==========================================
# CONFIGURAÇÕES
# ==========================================

FRONTEND := frontend
BACKEND := backend
VENV := $(BACKEND)/.venv

.DEFAULT_GOAL := help

# ==========================================
# CORES
# ==========================================

GREEN  := \033[0;32m
YELLOW := \033[1;33m
BLUE   := \033[0;34m
RED    := \033[0;31m
CYAN   := \033[0;36m
RESET  := \033[0m

# ==========================================
# AJUDA
# ==========================================

help: ## Exibe esta ajuda
	@echo ""
	@echo "$(CYAN)PINGAS-IFRACTAL-NIZA$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  $(GREEN)%-12s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""

# ==========================================
# INSTALAÇÃO
# ==========================================

install: ## Instala frontend e backend
	@echo "$(BLUE)📦 Instalando frontend...$(RESET)"
	@cd $(FRONTEND) && npm install

	@echo "$(BLUE)🐍 Configurando ambiente Python...$(RESET)"
	@test -d $(VENV) || python3 -m venv $(VENV)

	@echo "$(BLUE)📦 Instalando dependências do backend...$(RESET)"
	@cd $(BACKEND) && . .venv/bin/activate && pip install -r requirements.txt

	@echo "$(GREEN)✅ Instalação concluída!$(RESET)"

# ==========================================
# DESENVOLVIMENTO
# ==========================================

frontend: ## Inicia o frontend
	@echo "$(GREEN)🚀 Frontend iniciado$(RESET)"
	@cd $(FRONTEND) && npm run dev

backend: ## Inicia o backend
	@echo "$(GREEN)🚀 Backend iniciado$(RESET)"
	@cd $(BACKEND) && . .venv/bin/activate && python -m uvicorn main:app --reload

# ==========================================
# QUALIDADE
# ==========================================

lint: ## Executa o ESLint
	@cd $(FRONTEND) && npm run lint

build: ## Gera o build do frontend
	@cd $(FRONTEND) && npm run build

# ==========================================
# LIMPEZA
# ==========================================

clean: ## Remove arquivos temporários
	@echo "$(YELLOW)🧹 Limpando projeto...$(RESET)"
	@rm -rf $(FRONTEND)/node_modules
	@rm -rf $(FRONTEND)/dist
	@rm -rf $(VENV)
	@find . -name "__pycache__" -type d -exec rm -rf {} +
	@find . -name "*.pyc" -delete

	@echo "$(GREEN)✅ Limpeza concluída!$(RESET)"
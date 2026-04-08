.PHONY: setup setup-python setup-env infra infra-up infra-down infra-logs \
       wait migrate migrate-create migrate-down run dev test test-unit test-integration test-cov \
       lint lint-fix typecheck fmt clean help \
       db-migrate db-reset db-seed

# ─── Tool detection ────────────────────────────────────────────
UV := $(shell command -v uv 2>/dev/null)
PYTHON := python3

ifdef UV
  RUN := uv run
  SYNC := uv sync
else
  RUN := .venv/bin/python -m
  SYNC := $(PYTHON) -m pip install -e ".[dev]"
endif

# ─── Primary targets ──────────────────────────────────────────

## Full setup: install deps + .env + docker infra + wait + migrate
setup: setup-python setup-env infra-up wait migrate
	@echo ""
	@echo "══════════════════════════════════════════════════════"
	@echo "  Setup complete! Run 'make dev' to start the app."
	@echo "══════════════════════════════════════════════════════"

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ─── Python environment ──────────────────────────────────────

setup-python: ## Install all dependencies (detects uv or falls back to pip)
ifdef UV
	$(UV) sync --all-extras
else
	@if [ ! -d .venv ]; then $(PYTHON) -m venv .venv; fi
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -e ".[dev]"
endif

setup-env: ## Create .env from template if not present
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example"; \
	else \
		echo ".env already exists, skipping"; \
	fi

# ─── Infrastructure (Docker) ────────────────────────────────

infra-up: ## Start all infrastructure services
	docker compose up -d
	@echo "Infrastructure services starting..."

infra-down: ## Stop all infrastructure services
	docker compose down

infra-logs: ## Tail infrastructure logs
	docker compose logs -f

infra: infra-up ## Alias for infra-up

# ─── Service readiness ───────────────────────────────────────

wait: ## Wait for all infrastructure services to be healthy
	$(RUN) python scripts/wait_for_services.py --timeout 90

# ─── Database migrations ─────────────────────────────────────

migrate: ## Run database migrations
	$(RUN) alembic upgrade head

migrate-create: ## Create a new migration (usage: make migrate-create msg="description")
	$(RUN) alembic revision --autogenerate -m "$(msg)"

migrate-down: ## Rollback one migration
	$(RUN) alembic downgrade -1

db-migrate: ## One-shot: run all migrations + seed data
	$(RUN) alembic upgrade head
	$(RUN) python scripts/seed.py
	@echo "✓ Database migrated and seeded successfully"

db-reset: ## Reset database to initial state (WARNING: destroys all data)
	$(RUN) alembic downgrade base
	$(RUN) alembic upgrade head
	$(RUN) python scripts/seed.py
	@echo "✓ Database reset and re-seeded successfully"

db-seed: ## Run seed script (idempotent)
	$(RUN) python scripts/seed.py

# ─── Application ─────────────────────────────────────────────

run: ## Run the application server
	$(RUN) uvicorn services.api.app:app --host 0.0.0.0 --port 8000

dev: ## Run the application server with hot-reload
	$(RUN) uvicorn services.api.app:app --host 0.0.0.0 --port 8000 --reload

# ─── Quality ─────────────────────────────────────────────────

test: ## Run all tests
	$(RUN) pytest -v --tb=short

test-unit: ## Run unit tests only
	$(RUN) pytest tests/unit -v --tb=short

test-integration: ## Run integration tests only
	$(RUN) pytest tests/integration -v --tb=short

test-cov: ## Run tests with coverage report
	$(RUN) pytest --cov=services --cov=libs --cov=configs \
		--cov-report=term-missing --cov-report=html

lint: ## Run linter
	$(RUN) ruff check services/ libs/ configs/ tests/

lint-fix: ## Auto-fix lint issues
	$(RUN) ruff check --fix services/ libs/ configs/ tests/

fmt: ## Format code
	$(RUN) ruff format services/ libs/ configs/ tests/

typecheck: ## Run type checker
	$(RUN) mypy services/ libs/ configs/

# ─── Cleanup ─────────────────────────────────────────────────

clean: ## Remove all generated files and containers
	docker compose down -v
	rm -rf .venv
	rm -rf .docker-data
	rm -rf .pytest_cache htmlcov .coverage .mypy_cache .ruff_cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleaned up all generated files"

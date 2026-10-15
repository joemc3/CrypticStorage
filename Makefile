.PHONY: help install typecheck test test-e2e build dev-db dev-api dev-web up down logs ps migrate clean tidy

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# --- Local development (no Docker needed) -----------------------------------

install: ## Install server and client dependencies
	cd server && npm ci && npx prisma generate
	cd client && npm ci

dev-db: ## Start a throwaway embedded Postgres on :54321 (prints DATABASE_URL)
	cd server && node scripts/embedded-db.mjs --port 54321

dev-api: ## Run the API with hot reload (needs server/.env with DATABASE_URL)
	cd server && npx prisma migrate deploy && npm run dev

dev-web: ## Run the web app with hot reload on :3000 (proxies /api to :4000)
	cd client && npm run dev

typecheck: ## Typecheck both halves
	cd server && npm run typecheck
	cd client && npm run type-check

test: ## Server integration tests (embedded Postgres) + client unit tests
	cd server && npm test
	cd client && npm test

test-e2e: ## Real API + real client crypto, end to end
	scripts/e2e.sh

build: ## Production builds of both halves
	cd server && npm run build
	cd client && npm run build

# --- Docker -----------------------------------------------------------------

up: ## Build and start the full stack (needs .env)
	docker compose up -d --build

down: ## Stop the stack
	docker compose down

logs: ## Tail logs
	docker compose logs -f

ps: ## Show service status
	docker compose ps

migrate: ## Apply migrations inside the running API container
	docker compose exec api npx prisma migrate deploy

clean: ## Stop the stack and delete its volumes (destroys all data)
	docker compose down -v

# --- Session wrap-up ---------------------------------------------------------

tidy: ## End of session: stop the local stack (volumes kept); safe when already down
	-docker compose down --remove-orphans
	@docker compose ps --quiet | grep -q . && echo "tidy: containers still running" || echo "tidy: local stack is down"

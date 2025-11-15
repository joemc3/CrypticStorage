.PHONY: help build up down logs clean test migrate

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build all Docker images
	docker-compose build

up: ## Start all services
	docker-compose up -d

down: ## Stop all services
	docker-compose down

logs: ## View logs from all services
	docker-compose logs -f

clean: ## Remove all containers, volumes, and images
	docker-compose down -v
	docker system prune -af

test: ## Run tests
	cd server && npm test
	cd client && npm test

migrate: ## Run database migrations
	docker-compose exec api npx prisma migrate deploy

seed: ## Seed the database with sample data
	docker-compose exec api npx prisma db seed

dev-server: ## Start server in development mode
	cd server && npm run dev

dev-client: ## Start client in development mode
	cd client && npm run dev

install: ## Install dependencies for server and client
	cd server && npm install
	cd client && npm install

prisma-studio: ## Open Prisma Studio
	cd server && npx prisma studio

health: ## Check health of all services
	@echo "Checking services health..."
	@curl -s http://localhost:4000/health | jq . || echo "API is down"
	@curl -s http://localhost:3000/health || echo "Client is down"
	@docker-compose ps

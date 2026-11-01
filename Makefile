.PHONY: dev-api dev-web test build-web deploy-api deploy-web seed-demo

dev-api:        ## run API locally on :8000
	cd api && uv run uvicorn app.main:app --reload --port 8000

dev-web:        ## run web locally on :5173
	cd web && npm run dev

test:           ## backend unit tests
	cd api && uv run pytest -q

build-web:
	cd web && npm ci && npm run build

deploy-api:     ## tar + scp + docker compose up on the EC2 box
	bash infra/deploy.sh

deploy-web:     ## build + wrangler pages deploy
	bash infra/deploy-web.sh

seed-demo:      ## run the demo samples once so caches are warm
	bash demo/seed.sh

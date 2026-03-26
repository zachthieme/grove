.PHONY: frontend build dev clean e2e

frontend:
	cd web && npm run build

build: frontend
	go build -o grove .

dev:
	@echo "Starting dev servers..."
	@cd web && npm run dev &
	@go run . --dev
	@wait

clean:
	rm -rf web/dist grove

e2e: build
	cd web && npx playwright test

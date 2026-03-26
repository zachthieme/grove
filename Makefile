.PHONY: frontend build dev clean e2e test test-all cover bench mutate

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

test:
	go test -race -cover ./...

test-all: test
	cd web && npm test

cover:
	go test -race -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out | tail -1
	cd web && npm test -- --coverage

bench:
	go test -bench=. -benchmem ./internal/api/ -count=3

mutate:
	cd web && npx stryker run

.PHONY: frontend build dev clean e2e test test-all cover bench mutate check-scenarios

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

check-scenarios:
	@echo "Checking scenario coverage..."
	@missing=0; \
	for f in scenarios/*.md; do \
		ids=$$(grep "^\*\*ID\*\*:" $$f | sed 's/.*: //'); \
		for id in $$ids; do \
			if ! grep -rq "$$id" web/e2e/ web/src/ internal/ integration_test.go 2>/dev/null; then \
				echo "  UNCOVERED: $$id ($$f)"; \
				missing=$$((missing+1)); \
			fi; \
		done; \
	done; \
	if [ $$missing -gt 0 ]; then echo "$$missing uncovered scenario(s)"; exit 1; fi; \
	echo "All scenarios covered."

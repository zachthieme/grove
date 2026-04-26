.PHONY: frontend build dev clean e2e test test-all typecheck cover coverage-check bench fuzz mutate check-scenarios lint types-gen types-gen-check ci

# Pinned in CI (.github/workflows/ci.yml) — bump in lockstep with the
# linter config in .golangci.yml.
GOLANGCI_LINT_VERSION = v2.8.0

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

typecheck:
	cd web && npx tsc --noEmit

cover:
	go test -race -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out | tail -1
	cd web && npm test -- --coverage

# Per-package coverage floor. Bumping these is a deliberate ratchet — never
# lower a floor without recording why in the commit message. Floors sit
# slightly below current measured coverage to allow normal noise; run
# `make coverage-check` locally and update if a real improvement raises
# them.
coverage-check:
	@fail=0; \
	for entry in \
		"internal/httpapi:85" \
		"internal/model:90" \
		"internal/org:80" \
		"internal/snapshot:80" \
		"internal/pod:95" \
		"internal/parser:80" \
		"internal/autosave:60" \
		"internal/logbuf:70" ; do \
		pkg="$${entry%:*}"; floor="$${entry#*:}"; \
		cov=$$(go test -count=1 -cover ./$$pkg/ 2>&1 | grep -oE 'coverage: [0-9.]+%' | grep -oE '[0-9.]+' | head -1); \
		if [ -z "$$cov" ]; then \
			echo "  ERROR: no coverage reported for $$pkg"; \
			fail=$$((fail+1)); continue; \
		fi; \
		below=$$(awk -v c="$$cov" -v f="$$floor" 'BEGIN{print (c+0 < f+0) ? 1 : 0}'); \
		if [ "$$below" = "1" ]; then \
			echo "  FAIL: $$pkg coverage $$cov% below floor $$floor%"; \
			fail=$$((fail+1)); \
		else \
			echo "  ok:   $$pkg $$cov% (floor $$floor%)"; \
		fi; \
	done; \
	if [ $$fail -gt 0 ]; then \
		echo "$$fail package(s) below coverage floor"; exit 1; \
	fi

bench:
	go test -bench=. -benchmem ./internal/httpapi/ -count=3

fuzz:
	@echo "Running fuzz tests (5s each)..."
	go test -fuzz=FuzzInferMapping -fuzztime=5s ./internal/org/
	go test -fuzz=FuzzCSVUpload -fuzztime=5s ./internal/org/
	go test -fuzz='^FuzzAllRequiredHigh$$' -fuzztime=5s ./internal/org/
	go test -fuzz='^FuzzAllRequiredHighMultiField$$' -fuzztime=5s ./internal/org/
	go test -fuzz=FuzzUpdateFields -fuzztime=5s ./internal/org/
	go test -fuzz=FuzzSanitizeCell -fuzztime=5s ./internal/org/
	go test -fuzz=FuzzZipUpload -fuzztime=5s ./internal/org/
	go test -fuzz=FuzzParseZipFileList -fuzztime=5s ./internal/org/
	go test -fuzz=FuzzWouldCreateCycle -fuzztime=5s ./internal/org/

mutate:
	cd web && npx stryker run

TYGO = $(shell go env GOPATH)/bin/tygo

types-gen:
	@if [ ! -x "$(TYGO)" ]; then \
		echo "installing tygo..."; \
		go install github.com/gzuidhof/tygo@latest; \
	fi
	$(TYGO) generate

# Verifies the generated TS file is current. Fails CI if a Go-side
# apitypes change wasn't paired with `make types-gen`.
types-gen-check:
	@$(MAKE) -s types-gen
	@if ! git diff --quiet -- web/src/api/types.generated.ts 2>/dev/null && [ -n "$$(git diff --name-only -- web/src/api/types.generated.ts 2>/dev/null)" ]; then \
		echo "types.generated.ts is stale — run 'make types-gen' and commit the result"; \
		git diff -- web/src/api/types.generated.ts; \
		exit 1; \
	fi

lint: frontend
	golangci-lint run ./...
	cd web && npx eslint src/ --max-warnings 0 2>/dev/null || true

ci: typecheck lint test-all e2e bench fuzz check-scenarios
	@echo "CI checks passed."

check-scenarios:
	@echo "Checking scenario coverage..."
	@fail=0; \
	for f in docs/scenarios/*.md; do \
		ids=$$(grep "^\*\*ID\*\*:" $$f | sed 's/.*: //'); \
		for id in $$ids; do \
			if ! grep -rqw "$$id" --include='*_test.go' --include='*.test.ts' --include='*.test.tsx' --include='*.spec.ts' web/ internal/ integration_test.go 2>/dev/null; then \
				echo "  UNCOVERED: $$id ($$f)"; \
				fail=$$((fail+1)); \
			fi; \
		done; \
		if ! grep -q "^## Behavior" "$$f"; then \
			echo "  MISSING SECTION: ## Behavior in $$f"; \
			fail=$$((fail+1)); \
		fi; \
		if ! grep -q "^## Invariants" "$$f"; then \
			echo "  MISSING SECTION: ## Invariants in $$f"; \
			fail=$$((fail+1)); \
		fi; \
		if ! grep -q "^## Edge cases" "$$f"; then \
			echo "  MISSING SECTION: ## Edge cases in $$f"; \
			fail=$$((fail+1)); \
		fi; \
	done; \
	echo "Checking for orphaned test references..."; \
	defined_ids=$$(grep -rh '^\*\*ID\*\*:' docs/scenarios/*.md | sed 's/.*: //' | sort -u); \
	referenced_ids=$$(grep -rohw '[A-Z]\{2,\}-[0-9]\{3,\}' --include='*_test.go' --include='*.test.ts' --include='*.test.tsx' --include='*.spec.ts' internal/ web/src/ integration_test.go 2>/dev/null | sort -u); \
	orphans=0; \
	for ref_id in $$referenced_ids; do \
		if ! echo "$$defined_ids" | grep -qw "$$ref_id"; then \
			echo "  WARNING: orphaned test reference: $$ref_id (not in docs/scenarios/)"; \
			orphans=$$((orphans+1)); \
		fi; \
	done; \
	if [ $$orphans -gt 0 ]; then echo "$$orphans orphaned reference(s) (warnings only)"; fi; \
	if [ $$fail -gt 0 ]; then echo "$$fail issue(s) found"; exit 1; fi; \
	echo "All scenarios covered."

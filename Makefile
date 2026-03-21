.PHONY: frontend build dev clean

frontend:
	cd web && npm run build

build: frontend
	go build -o orgchart .

dev:
	@echo "Starting dev servers..."
	@cd web && npm run dev &
	@go run . serve --dev
	@wait

clean:
	rm -rf web/dist orgchart

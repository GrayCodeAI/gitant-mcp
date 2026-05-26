.PHONY: install build test run clean

## install: Install dependencies (requires Node.js 20+)
install:
	npm ci

## build: Compile TypeScript to dist/
build: install
	npm run build

## test: Run unit tests
test: install
	npm test

## run: Start the MCP server (stdio)
run: build
	node dist/index.js

## clean: Remove build artifacts
clean:
	rm -rf node_modules dist

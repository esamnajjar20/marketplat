.PHONY: build test vet fmt fmt-check check run

build:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/go-worker ./cmd/server

test:
	go test -race -count=1 ./...

vet:
	go vet ./...

fmt:
	gofmt -s -w .

fmt-check:
	@test -z "$$(gofmt -s -l .)" || (echo "gofmt needed on:"; gofmt -s -l .; exit 1)

# Run before opening a PR: formatting must be clean, vet and tests must pass.
check: fmt-check
	go vet ./...
	go test -race -count=1 ./...

run:
	go run ./cmd/server

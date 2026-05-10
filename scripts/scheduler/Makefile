build:
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o scheduler .

build-docker:
	docker run --rm -v "$(shell pwd):/src" -w /src golang:1.21-alpine \
		sh -c "go mod download && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags='-s -w' -o scheduler ."

clean:
	rm -f scheduler

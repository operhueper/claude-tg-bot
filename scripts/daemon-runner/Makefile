build:
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o daemon-runner main.go

clean:
	rm -f daemon-runner

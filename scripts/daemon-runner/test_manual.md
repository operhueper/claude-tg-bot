# Manual smoke test for daemon-runner

## 1. Build the image with daemon-runner as PID 1

```bash
cd /opt/claude-tg-bot
docker build -f Dockerfile.user -t claude-user-sandbox:test .
```

## 2. Create a test vault with manifest

```bash
TESTUID=999999
mkdir -p /tmp/vault-test/$TESTUID/logs /tmp/vault-test/$TESTUID/.daemons-events

cat > /tmp/vault-test/$TESTUID/.daemons.yaml <<'EOF'
daemons:
  - name: ping-loop
    cmd: ["sh", "-c", "while true; do echo tick $(date); sleep 2; done"]
    workdir: /workspace
    enabled: true
EOF
```

## 3. Start container

```bash
docker run -d --name dr-test \
  -e VAULT_DIR=/opt/vault/$TESTUID \
  -v /tmp/vault-test/$TESTUID:/opt/vault/$TESTUID \
  claude-user-sandbox:test

docker exec dr-test ps aux   # should show sh/while loop as child of daemon-runner
```

## 4. Verify log output

```bash
sleep 3
cat /tmp/vault-test/$TESTUID/logs/ping-loop.log
# Expected: [START] lines and tick output every 2s
```

## 5. Kill the child — verify restart

```bash
# Find the sh pid inside the container
docker exec dr-test sh -c "kill \$(pgrep -f 'while true')"
sleep 4
cat /tmp/vault-test/$TESTUID/logs/ping-loop.log
# Expected: [EXIT] line followed by [RESTART] and new [START]
```

## 6. Test crashloop detection (3 crashes in 10 min → STOPPED)

```bash
cat > /tmp/vault-test/$TESTUID/.daemons.yaml <<'EOF'
daemons:
  - name: crasher
    cmd: ["sh", "-c", "exit 1"]
    enabled: true
EOF

sleep 60   # wait for 3 rapid crashes (backoff: 1s+2s+5s ≈ 8s total)
cat /tmp/vault-test/$TESTUID/logs/crasher.log
# Expected: [STOPPED] crashloop detected
cat /tmp/vault-test/$TESTUID/.daemons-events/crasher-crashloop.json
# Expected: JSON with timestamp, daemon name, last_excerpt
```

## 7. Test daemon removal via manifest update

```bash
cat > /tmp/vault-test/$TESTUID/.daemons.yaml <<'EOF'
daemons: []
EOF
sleep 10
docker exec dr-test ps aux
# child processes should be gone
```

## 8. Test graceful shutdown

```bash
docker stop dr-test   # sends SIGTERM
# daemon-runner should SIGTERM children, wait up to 10s, then exit
docker logs dr-test 2>&1 | tail -5
# Expected: "shutdown signal received" and "all daemons stopped, exiting"
```

## 9. Cleanup

```bash
docker rm -f dr-test
rm -rf /tmp/vault-test
```

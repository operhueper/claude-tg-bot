#!/bin/bash
# Defense-in-depth iptables rules for guest containers.
#
# INPUT chain already has these (see scripts/firewall/setup-firewall.sh and
# the post-2026-05-08 hardening). DOCKER-USER mirrors them in case
# guest traffic ever flows through FORWARD (different bridge / new
# guest network / future routing change).
#
# Idempotent: uses iptables -C to check existence before -I.

set -e

GUEST_IF=claude-guest0
HOST_PORTS=(3847 3848 22)

ensure_rule() {
    local chain="$1"
    shift
    if ! iptables -C "$chain" "$@" 2>/dev/null; then
        iptables -I "$chain" "$@"
        echo "added: $chain $*"
    fi
}

for port in "${HOST_PORTS[@]}"; do
    ensure_rule DOCKER-USER \
        -i "$GUEST_IF" \
        -p tcp \
        --dport "$port" \
        -j DROP
done

echo "[docker-user-rules] done"

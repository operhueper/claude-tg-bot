#!/bin/bash
# remove-baseline-egress.sh — Remove the HTB egress cap for a specific container IP.
#
# Usage: remove-baseline-egress.sh <container-ip>
set -e

IFACE="claude-guest0"
IP="$1"

if [ -z "$IP" ]; then
  echo "usage: $0 <container-ip>" >&2
  exit 1
fi

# Derive the same numeric handle used in set-baseline-egress.sh.
IFS='.' read -r o1 o2 o3 o4 <<< "$IP"
MINOR=$(( (o3 << 8) + o4 ))
if [ "$MINOR" -eq 0 ]; then
  echo "error: derived handle minor is 0 (IP=$IP) — nothing to remove" >&2
  exit 1
fi

# Remove filter (best-effort — may not exist if set step was skipped).
tc filter del dev "$IFACE" parent 1: protocol ip prio "${MINOR}" 2>/dev/null || true

# Remove class (best-effort).
tc class del dev "$IFACE" parent 1: classid "1:${MINOR}" 2>/dev/null || true

echo "egress cap removed for ${IP} on ${IFACE} (class 1:${MINOR})"

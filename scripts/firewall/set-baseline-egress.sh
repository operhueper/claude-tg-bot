#!/bin/bash
# set-baseline-egress.sh — Apply a 20 Mbit/s HTB egress cap on the guest bridge
# for a specific container IP. Idempotent: replaces any existing rule for that IP.
#
# Usage: set-baseline-egress.sh <container-ip>
set -e

IFACE="claude-guest0"
RATE="20mbit"
BURST="32kbit"
IP="$1"

if [ -z "$IP" ]; then
  echo "usage: $0 <container-ip>" >&2
  exit 1
fi

# Derive a numeric handle from the last two octets of the IP so each container
# gets a unique class. E.g. 172.20.0.5 → handle 2:5 (octet3=0, octet4=5).
# We shift octet3 by 8 bits and add octet4 to get a unique 16-bit minor.
IFS='.' read -r o1 o2 o3 o4 <<< "$IP"
MINOR=$(( (o3 << 8) + o4 ))
if [ "$MINOR" -eq 0 ]; then
  echo "error: derived handle minor is 0 (IP=$IP) — refusing to use root class" >&2
  exit 1
fi

# Make sure the HTB root qdisc exists on the interface.
# If it already exists (handle 1:) we keep it; if not, we add it.
if ! tc qdisc show dev "$IFACE" | grep -q "htb 1:"; then
  tc qdisc add dev "$IFACE" root handle 1: htb default 9999
fi

# Make sure the default (unclassified traffic) class exists with a high rate
# so host traffic is not accidentally throttled.
if ! tc class show dev "$IFACE" | grep -q "1:9999"; then
  tc class add dev "$IFACE" parent 1: classid 1:9999 htb rate 1gbit burst 128kbit
fi

# Create or replace the per-IP class.
if tc class show dev "$IFACE" | grep -q "1:${MINOR}[[:space:]]"; then
  tc class change dev "$IFACE" parent 1: classid "1:${MINOR}" htb rate "$RATE" burst "$BURST"
else
  tc class add dev "$IFACE" parent 1: classid "1:${MINOR}" htb rate "$RATE" burst "$BURST"
fi

# Create or replace the u32 filter that matches src IP → class.
# We use a temporary handle (1:${MINOR}) as the filter handle for easy deletion.
# Remove any existing filter with this flowid first (best-effort).
tc filter del dev "$IFACE" parent 1: protocol ip prio "${MINOR}" 2>/dev/null || true

tc filter add dev "$IFACE" parent 1: protocol ip prio "${MINOR}" u32 \
  match ip src "${IP}/32" flowid "1:${MINOR}"

echo "egress cap ${RATE} applied for ${IP} on ${IFACE} (class 1:${MINOR})"

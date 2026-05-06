#!/usr/bin/env bash
# Install nginx site configs + bootstrap a self-signed cert + issue real LE
# certs covering all four proboi.site hostnames. Idempotent: safe to re-run.
#
# Run AFTER bootstrap-proboi.sh (nginx + certbot installed) and AFTER DNS
# has propagated. This is the only script you need — install.sh has been
# folded into here.
set -euo pipefail

EXPECTED_IP="89.167.125.175"
EMAIL="artemyasuoko@gmail.com"
HOSTS=(proboi.site www.proboi.site dash.proboi.site design.proboi.site)
LIVE_DIR="/etc/letsencrypt/live/proboi.site"
CERT_PATH="$LIVE_DIR/fullchain.pem"
KEY_PATH="$LIVE_DIR/privkey.pem"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITES_AVAILABLE="/etc/nginx/sites-available"
SITES_ENABLED="/etc/nginx/sites-enabled"
SNIPPETS="/etc/nginx/snippets"
SITE_CONFS=(proboi.site.conf dash.proboi.site.conf design.proboi.site.conf)

if [[ $EUID -ne 0 ]]; then
    echo "Must run as root." >&2
    exit 1
fi

# 1. DNS sanity check — fail loudly if any hostname doesn't point here.
echo "Checking DNS for ${HOSTS[*]} -> $EXPECTED_IP ..."
for host in "${HOSTS[@]}"; do
    resolved="$(dig +short A "$host" | tail -n1)"
    if [[ "$resolved" != "$EXPECTED_IP" ]]; then
        echo "DNS mismatch: $host resolves to '${resolved:-<empty>}', expected $EXPECTED_IP" >&2
        exit 1
    fi
    echo "  ok: $host -> $resolved"
done

# 2. Webroot for ACME http-01.
mkdir -p /var/www/certbot
chown -R www-data:www-data /var/www/certbot

# 3. Install snippet + site configs (was install.sh).
mkdir -p "$SITES_AVAILABLE" "$SITES_ENABLED" "$SNIPPETS"
install -m 0644 "$SCRIPT_DIR/snippets/security-headers.conf" "$SNIPPETS/security-headers.conf"
for conf in "${SITE_CONFS[@]}"; do
    install -m 0644 "$SCRIPT_DIR/sites-available/$conf" "$SITES_AVAILABLE/$conf"
    ln -sfn "$SITES_AVAILABLE/$conf" "$SITES_ENABLED/$conf"
    echo "installed: $conf"
done
# Drop stock default site (shadows our :80 catch-all).
if [[ -L "$SITES_ENABLED/default" ]]; then
    rm -f "$SITES_ENABLED/default"
    echo "removed: sites-enabled/default"
fi

# 4. Bootstrap self-signed cert if no real cert is in place yet.
# nginx refuses to load the HTTPS blocks without these files, and certbot
# --webroot needs nginx serving on :80 first — so we seed a 1-day fake cert.
if [[ ! -f "$CERT_PATH" ]]; then
    echo "No cert at $CERT_PATH — generating self-signed bootstrap ..."
    mkdir -p "$LIVE_DIR"
    openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
        -keyout "$KEY_PATH" -out "$CERT_PATH" \
        -subj "/CN=proboi.site" 2>/dev/null
    chmod 600 "$KEY_PATH"
    echo "  bootstrap cert in place"
fi

# 5. nginx config check + reload — real HTTPS blocks come up with the
# self-signed cert (or existing real cert).
nginx -t
systemctl reload nginx

# 6. One certbot call for all four names — single cert, single rate-limit slot.
# --webroot lets us keep our own nginx config untouched (no --nginx mutations).
domain_args=()
for host in "${HOSTS[@]}"; do domain_args+=(-d "$host"); done

certbot certonly --webroot -w /var/www/certbot \
    --non-interactive --agree-tos -m "$EMAIL" \
    --keep-until-expiring \
    "${domain_args[@]}"

# 7. Reload to pick up the real cert.
systemctl reload nginx

# 8. Verify the cert is from Let's Encrypt, not the self-signed bootstrap.
issuer="$(openssl x509 -in "$CERT_PATH" -issuer -noout)"
echo "Issuer: $issuer"
if [[ "$issuer" != *"Let's Encrypt"* ]]; then
    echo "ERROR: cert at $CERT_PATH is not from Let's Encrypt — still self-signed?" >&2
    exit 1
fi
echo "Real LE cert confirmed at $CERT_PATH"

# 9. Confirm renewal timer is armed (certbot ships one by default).
echo "Renewal timer status:"
systemctl list-timers --all | grep -E 'certbot|snap\.certbot' || {
    echo "WARN: no certbot timer found — auto-renewal may not run." >&2
}

echo "Done."

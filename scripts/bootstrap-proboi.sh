#!/usr/bin/env bash
#
# bootstrap-proboi.sh — idempotent Ubuntu 24.04 bootstrap for proboi-bot (Hetzner cx33).
# Re-runnable. Run as root.
#
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

log() { echo "[bootstrap] $(date -Iseconds) $*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "[bootstrap] must run as root" >&2
  exit 1
fi

log "starting bootstrap on $(hostname)"

# ---------------------------------------------------------------------------
# 1. apt update + upgrade
# ---------------------------------------------------------------------------
log "apt update + upgrade"
apt-get update -y
apt-get upgrade -y

# ---------------------------------------------------------------------------
# 2. base packages
# ---------------------------------------------------------------------------
log "installing base packages"
apt-get install -y \
  curl wget git rsync htop ncdu jq unzip \
  build-essential ca-certificates gnupg lsb-release \
  ufw fail2ban poppler-utils ffmpeg python3-pip \
  unattended-upgrades

# ---------------------------------------------------------------------------
# 3. timezone + NTP
# ---------------------------------------------------------------------------
log "setting timezone Europe/Moscow + enabling NTP"
timedatectl set-timezone Europe/Moscow
timedatectl set-ntp true

# ---------------------------------------------------------------------------
# 4. swap (4 GB)
# ---------------------------------------------------------------------------
if [ ! -f /swapfile ]; then
  log "creating 4 GB swapfile"
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '^/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
else
  log "swapfile already present, skipping"
  swapon /swapfile 2>/dev/null || true
fi

if ! grep -q '^vm.swappiness' /etc/sysctl.conf; then
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi
sysctl -w vm.swappiness=10 >/dev/null

# ---------------------------------------------------------------------------
# 5. Docker CE (official repo)
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker CE from official repo"
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  log "docker already installed: $(docker --version)"
fi
systemctl enable --now docker

# ---------------------------------------------------------------------------
# 6. Bun (system-wide)
# ---------------------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  log "installing Bun system-wide to /usr/local/bin"
  tmpdir="$(mktemp -d)"
  curl -fsSL -o "$tmpdir/bun.zip" \
    https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip
  ( cd "$tmpdir" && unzip -q bun.zip )
  install -m 0755 "$tmpdir/bun-linux-x64/bun" /usr/local/bin/bun
  rm -rf "$tmpdir"
else
  log "bun already installed: $(bun --version)"
fi
bun --version >/dev/null

# ---------------------------------------------------------------------------
# 7. Node.js 20 LTS + pnpm
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v24\.'; then
  log "installing Node.js 24 (current) via Nodesource — required by Open Design"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
else
  log "node already installed: $(node -v)"
fi

PNPM_PIN_VERSION="10.33.2"
if ! command -v pnpm >/dev/null 2>&1 || [ "$(pnpm --version 2>/dev/null)" != "$PNPM_PIN_VERSION" ]; then
  log "installing pnpm@${PNPM_PIN_VERSION} globally (matches Open Design lockfile)"
  npm i -g "pnpm@${PNPM_PIN_VERSION}"
else
  log "pnpm already installed: $(pnpm --version)"
fi

# ---------------------------------------------------------------------------
# 8. nginx
# ---------------------------------------------------------------------------
log "installing nginx"
apt-get install -y nginx
systemctl enable --now nginx
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

# ---------------------------------------------------------------------------
# 9. certbot + nginx plugin (no certs requested here)
# ---------------------------------------------------------------------------
log "installing certbot + nginx plugin"
apt-get install -y certbot python3-certbot-nginx

# ---------------------------------------------------------------------------
# 10. UFW firewall
# ---------------------------------------------------------------------------
log "configuring UFW (allow 22, 80, 443; default deny incoming)"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ---------------------------------------------------------------------------
# 11. fail2ban
# ---------------------------------------------------------------------------
log "enabling fail2ban"
systemctl enable --now fail2ban

# ---------------------------------------------------------------------------
# 12. unattended-upgrades (security only — Ubuntu default)
# ---------------------------------------------------------------------------
log "enabling unattended-upgrades"
dpkg-reconfigure -f noninteractive unattended-upgrades || true
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades

# ---------------------------------------------------------------------------
# 13. directories
# ---------------------------------------------------------------------------
log "creating directories"
install -d -m 0755 -o root -g root /opt/claude-tg-bot
install -d -m 0755 -o root -g root /opt/vault
install -d -m 0755 -o www-data -g www-data /var/www/proboi
install -d -m 0755 -o www-data -g www-data /var/www/u
install -d -m 0755 -o root -g root /var/log/claude-tg-bot

# ---------------------------------------------------------------------------
# 14. logrotate for the bot
# ---------------------------------------------------------------------------
log "writing logrotate config"
cat > /etc/logrotate.d/claude-tg-bot <<'EOF'
/var/log/claude-tg-bot/*.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
    copytruncate
}
EOF

# ---------------------------------------------------------------------------
# 15. SSH hardening
# ---------------------------------------------------------------------------
log "applying SSH hardening"
install -d -m 0755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
if sshd -t; then
  systemctl reload ssh || systemctl reload sshd || true
else
  echo "[bootstrap] sshd config test failed, NOT reloading" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 16. final summary
# ---------------------------------------------------------------------------
log "==================== summary ===================="
echo "bun:     $(bun --version 2>/dev/null || echo MISSING)"
echo "node:    $(node -v 2>/dev/null || echo MISSING)"
echo "pnpm:    $(pnpm --version 2>/dev/null || echo MISSING)"
echo "docker:  $(docker --version 2>/dev/null || echo MISSING)"
echo "nginx:   $(nginx -v 2>&1 || echo MISSING)"
echo "certbot: $(certbot --version 2>/dev/null || echo MISSING)"
echo "--- swap ---"
swapon --show || true
free -h | grep -i swap || true
echo "--- ufw ---"
ufw status verbose || true
echo "--- nginx service ---"
systemctl is-active nginx && systemctl is-enabled nginx || true
echo "--- time ---"
timedatectl | sed -n '1,8p'
log "bootstrap complete"

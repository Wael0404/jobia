#!/usr/bin/env bash
# One-command deployment on a fresh Ubuntu 22.04/24.04 VM (x86_64 or ARM64).
#
#   git clone https://github.com/wael0404/jobia.git && cd jobia
#   bash infra/deploy/deploy.sh          # first run: creates .env and asks you to fill it
#   bash infra/deploy/deploy.sh          # second run: builds and starts everything
#
# Re-running it later updates the app (git pull + rebuild + rolling restart).
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE=.env

log() { printf '\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

install_docker() {
  if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then return; fi
  log "Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
}

open_firewall() {
  # Oracle Cloud Ubuntu images ship restrictive iptables rules: open HTTP/HTTPS.
  if command -v iptables >/dev/null && sudo iptables -L INPUT -n 2>/dev/null | grep -q "REJECT"; then
    log "Opening ports 80/443 in iptables"
    sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
    sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
    if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi
  fi
}

ensure_swap() {
  # Next.js builds and Chromium are memory hungry; a swap file avoids OOM on small VMs.
  if [ "$(swapon --show | wc -l)" -eq 0 ] && [ "$(free -g | awk '/Mem:/ {print $2}')" -lt 8 ]; then
    log "Creating 4G swap file"
    sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  fi
}

set_secret() { # set KEY only if empty
  local key=$1 value=$2
  if grep -q "^${key}=$" "$ENV_FILE"; then sed -i "s|^${key}=$|${key}=${value}|" "$ENV_FILE"; fi
}

prepare_env() {
  if [ ! -f "$ENV_FILE" ]; then
    cp .env.example "$ENV_FILE"
    chmod 600 "$ENV_FILE"
  fi
  set_secret POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  set_secret REDIS_PASSWORD "$(openssl rand -hex 24)"
  set_secret MINIO_PASSWORD "$(openssl rand -hex 24)"
  set_secret JWT_ACCESS_SECRET "$(openssl rand -hex 32)"
  set_secret VAULT_MASTER_KEY "$(openssl rand -base64 32)"

  local missing=()
  for key in DOMAIN ACME_EMAIL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ANTHROPIC_API_KEY; do
    grep -qE "^${key}=.+" "$ENV_FILE" || missing+=("$key")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    die "Fill these values in $(pwd)/$ENV_FILE then re-run: ${missing[*]}  (guide: docs/DEPLOY.md)"
  fi
}

check_dns() {
  local domain ip public
  domain=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)
  ip=$(getent hosts "$domain" | awk '{print $1}' | head -1 || true)
  public=$(curl -fsS https://api.ipify.org || true)
  if [ -n "$public" ] && [ "$ip" != "$public" ]; then
    printf '\033[1;33m! %s resolves to "%s" but this server is %s — HTTPS will fail until DNS is fixed.\033[0m\n' "$domain" "$ip" "$public"
  fi
}

main() {
  command -v git >/dev/null || { sudo apt-get update -y && sudo apt-get install -y git; }
  install_docker
  open_firewall
  ensure_swap
  prepare_env
  check_dns

  log "Updating source"
  git -C ../.. pull --ff-only || true

  local compose=(sudo docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")
  log "Building images (first build takes ~10 min)"
  "${compose[@]}" build
  log "Starting services"
  "${compose[@]}" up -d --remove-orphans
  "${compose[@]}" ps

  local domain
  domain=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)
  log "Done → https://${domain}   (health: https://${domain}/health/ready)"
  echo "Back up $(pwd)/$ENV_FILE: without VAULT_MASTER_KEY stored credentials cannot be decrypted."
}

main "$@"

#!/usr/bin/env bash
# deploy.sh — Phase 1 manual deployment via SSH
# Usage: ./scripts/deploy.sh [user@host] [deploy_dir]
#
# This script:
#   1. Connects to the remote server via SSH
#   2. Pulls the latest code from main
#   3. Installs/syncs dependencies
#   4. Runs database migrations
#   5. Restarts infrastructure and application services
#
# Prerequisites:
#   - SSH key-based access to the target server
#   - uv installed on the remote server
#   - Git repo cloned at DEPLOY_DIR on the remote server

set -euo pipefail

REMOTE_HOST="${1:?Usage: $0 <user@host> [deploy_dir]}"
DEPLOY_DIR="${2:-/opt/ai-stock-research}"

echo "==> Deploying to ${REMOTE_HOST}:${DEPLOY_DIR}"

ssh "${REMOTE_HOST}" bash -s "${DEPLOY_DIR}" <<'REMOTE_SCRIPT'
set -euo pipefail
DEPLOY_DIR="$1"
cd "${DEPLOY_DIR}"

echo "[1/5] Pulling latest code..."
git fetch origin main
git reset --hard origin/main

echo "[2/5] Syncing dependencies..."
uv sync --all-extras

echo "[3/5] Running database migrations..."
uv run alembic upgrade head

echo "[4/5] Restarting infrastructure services..."
docker compose up -d

echo "[5/5] Restarting application..."
# Gracefully restart uvicorn via systemd (if configured) or direct process
if systemctl is-active --quiet ai-stock-research 2>/dev/null; then
    sudo systemctl restart ai-stock-research
    echo "Restarted via systemd"
else
    # Fallback: kill existing and start fresh
    pkill -f "uvicorn services.api.app:app" 2>/dev/null || true
    nohup uv run uvicorn services.api.app:app --host 0.0.0.0 --port 8000 \
        > /var/log/ai-stock-research.log 2>&1 &
    echo "Started uvicorn in background (PID: $!)"
fi

echo ""
echo "Deploy complete!"
REMOTE_SCRIPT

#!/bin/bash
# ============================================
# AI Agents Route Service — First-Time Setup
# ============================================
# Run this once after cloning to bootstrap the entire environment.
# Usage: ./init.sh
#
# What it does:
#   1. Installs Node.js workspace dependencies
#   2. Creates and populates .env from .env.example
#   3. Creates Python virtual environment + installs pip packages
#   4. Initializes Cloudflare D1 local database schema
#   5. Creates workspace directories
#   6. Verifies AI CLI tools are available
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

success() { echo -e "${GREEN}✓${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
info()    { echo -e "${BLUE}→${NC} $1"; }
header()  { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}\n"; }

# ─── Pre-flight checks ──────────────────────────
header "Pre-flight Checks"

# Node.js
if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v)
    success "Node.js ${NODE_VERSION} found"
else
    echo -e "${RED}✗ Node.js not found. Please install Node.js v20+ from https://nodejs.org${NC}"
    exit 1
fi

# Python
PYTHON_CMD=""
if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
fi

if [ -n "$PYTHON_CMD" ]; then
    PY_VERSION=$($PYTHON_CMD --version 2>&1)
    success "${PY_VERSION} found"
else
    echo -e "${RED}✗ Python 3 not found. Install it via:${NC}"
    echo "  macOS:  brew install python@3.11"
    echo "  Ubuntu: sudo apt install python3 python3-venv python3-pip"
    exit 1
fi

# Git
if command -v git &>/dev/null; then
    success "Git $(git --version | cut -d' ' -f3) found"
else
    warn "Git not found — workspace isolation may not function correctly"
fi

# ─── Step 1: Node Dependencies ──────────────────
header "Step 1/5 — Node.js Dependencies"

if [ -d "node_modules" ]; then
    success "node_modules already exists (skipping npm install)"
else
    info "Installing workspace dependencies..."
    npm install
    success "Node dependencies installed"
fi

# ─── Step 2: Environment Configuration ──────────
header "Step 2/5 — Environment Configuration"

if [ -f ".env" ]; then
    success ".env already exists"
    warn "Review your .env to ensure SESSION_WORKSPACE_BASE is configured"
else
    info "Creating .env from .env.example..."
    cp .env.example .env
    success ".env created — edit it to customize your configuration"
fi

# ─── Step 3: Python Virtual Environment ─────────
header "Step 3/5 — Python Virtual Environment"

VENV_DIR="packages/api_bridge/venv"

if [ -d "$VENV_DIR" ]; then
    success "Python venv already exists at ${VENV_DIR}"
else
    info "Creating Python virtual environment..."
    $PYTHON_CMD -m venv "$VENV_DIR"
    success "Virtual environment created"
fi

info "Installing Python dependencies..."
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet -r packages/api_bridge/requirements.txt
success "Python packages installed (fastapi, uvicorn, websockets, httpx, python-dotenv)"

# ─── Step 4: Database Initialization ─────────────
header "Step 4/5 — Database Initialization"

info "Initializing Cloudflare D1 local schema..."
cd packages/backend
npx wrangler d1 execute cli_db --local --file=schema.sql 2>/dev/null || warn "D1 init skipped (wrangler not configured — local SQLite will be used)"
cd "$SCRIPT_DIR"
success "Database schema ready"

# ─── Step 5: Workspace Directories ───────────────
header "Step 5/5 — Workspace Directories"

mkdir -p packages/workspaces/sessions
success "Created packages/workspaces/sessions/"

# ─── AI CLI Tool Detection ──────────────────────
header "AI Agent CLI Availability"

detect_tool() {
    local name=$1
    local cmd=$2
    if command -v "$cmd" &>/dev/null || npx --yes "$cmd" --version &>/dev/null 2>&1; then
        success "$name available"
    else
        warn "$name not detected (install globally or it will be fetched via npx on first use)"
    fi
}

# Check native availability (don't auto-install)
if command -v gemini &>/dev/null; then
    success "Gemini CLI available"
else
    warn "Gemini CLI not found globally (will use npx on demand)"
fi

if npx @anthropic-ai/claude-code --version &>/dev/null 2>&1; then
    success "Claude Code CLI available"
else
    warn "Claude Code CLI not found (will use npx on demand)"
fi

if npx codex --version &>/dev/null 2>&1; then
    success "OpenAI Codex CLI available"
else
    warn "Codex CLI not found (will use npx on demand)"
fi

# ─── Summary ────────────────────────────────────
header "Setup Complete!"

echo -e "${BOLD}Next steps:${NC}"
echo ""
echo -e "  1. ${CYAN}Edit .env${NC} to enable/disable AI agents"
echo -e "  2. ${CYAN}Authenticate AI CLIs${NC} if needed:"
echo -e "     npx @anthropic-ai/claude-code auth login"
echo -e "     npx gemini auth login"
echo -e "  3. ${CYAN}Start the service:${NC}"
echo -e "     ./start.sh"
echo ""
echo -e "  Or run services individually:"
echo -e "     ${BLUE}Backend:${NC}  cd packages/api_bridge && venv/bin/uvicorn app.main:app --port 8000"
echo -e "     ${BLUE}Frontend:${NC} npm run dev:frontend"
echo ""
echo -e "  ${GREEN}Dashboard:${NC} http://localhost:5173"
echo ""

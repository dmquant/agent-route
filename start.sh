#!/bin/bash

# AI Agents Route Service Startup Script

PID_FILE=".route-service.pid"

if [ -f "$PID_FILE" ]; then
    echo "⚠️  Service appears to be running already (found $PID_FILE). Run stop.sh first."
    exit 1
fi

echo "🚀 Starting AI Agents Route Service in the background..."

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing root dependencies..."
    npm install
fi

echo "🗄️ Guaranteeing database schema execution..."
cd packages/backend
if ! npx wrangler d1 execute cli_db --local --file schema.sql 2>/dev/null; then
    echo "⚠️  Schema conflict detected — resetting local D1 database..."
    rm -rf .wrangler/state
    npx wrangler d1 execute cli_db --local --file schema.sql
fi
cd ../../

# Create an empty PID file
> "$PID_FILE"

# Load environment variables into current shell from GLOBAL .env
if [ -f .env ]; then
    echo "⚙️  Loading global configuration from .env..."
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  No .env file found. Using default configurations. (Copy from .env.example to customize)"
fi

echo "🌟 Launching services concurrently..."
echo "=========================================="

# --------------------------
# Dynamic AI Agents Routing
# --------------------------

# Claude Remote Control Routing Check
if [ "$ENABLE_CLAUDE_REMOTE_CONTROL" = "true" ]; then
    echo "▶️  Claude Remote Control routing is verified enabled via .env"
else
    echo "⏸  Skipping Claude Remote Control routing (Disabled in .env)"
fi

# Placeholder for CODEX if enabled
if [ "$ENABLE_CODEX_SERVER" = "true" ]; then
    echo "▶️  Starting Codex Server hook (Placeholder)..."
    # nohup npm run start:codex > codex.log 2>&1 &
    # echo $! >> "$PID_FILE"
else
    echo "⏸  Skipping Codex Server (Disabled in .env)"
fi

echo "------------------------------------------"

# Start Core Infrastructure


# Start Python FastAPI Bridge (Desktop Backend Core)
echo "▶️  Starting Local Python Bridge Daemon (FastAPI)..."
cd packages/api_bridge
nohup venv/bin/uvicorn app.main:app --port 8000 > ../../bridge.log 2>&1 &
echo $! >> "../${PID_FILE}"
cd ../../

# Start frontend (Wait a second to ensure backend is preparing)
sleep 2
echo "▶️  Starting Frontend (React UI) on http://localhost:5173"
nohup npm run dev:frontend > frontend.log 2>&1 &
echo $! >> "$PID_FILE"

echo ""
echo "✅ All services successfully launched in the background!"
echo "📄 Logs:"
echo "   - Backend: tail -f backend.log"
echo "   - Bridge:  tail -f bridge.log"
echo "   - UI:      tail -f frontend.log"
echo ""
echo "🛑 To stop these services later, run: ./stop.sh"

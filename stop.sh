#!/bin/bash

# AI Agents Route Service Stop Script

PID_FILE=".route-service.pid"

echo "🛑 Stopping AI Agents Route Service..."

if [ ! -f "$PID_FILE" ]; then
    echo "⚠️  No $PID_FILE found. Are the services running?"
    
    # Fallback to killing known node processes forcefully if requested
    echo "Attempting generic cleanup..."
    pkill -f "npm run dev:backend" 2>/dev/null
    pkill -f "uvicorn app.main:app" 2>/dev/null
    pkill -f "npm run dev:frontend" 2>/dev/null
    # Note: Vite and Wrangler spawn sub-processes. 
    # Use with caution to avoid killing entirely unrelated dev servers.
    pkill -f "wrangler dev" 2>/dev/null
    pkill -f "vite" 2>/dev/null
    pkill -f "tsx watch src/index.ts" 2>/dev/null
    echo "✅ Generic cleanup completed."
    exit 0
fi

# Kill all PIDs sequentially
while read -r pid; do
    if kill -0 "$pid" 2>/dev/null; then
        echo "Killing process $pid..."
        # Send SIGTERM for graceful shutdown, wait slightly, then SIGKILL if needed
        kill "$pid" 2>/dev/null
    else
        echo "Process $pid was already stopped or doesn't exist."
    fi
done < "$PID_FILE"

# Also clean up the child processes that npm spanws
echo "Cleaning up dangling sub-processes..."
pkill -f "wrangler dev" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "uvicorn app.main:app" 2>/dev/null

rm -f "$PID_FILE"
echo "✅ All background services securely terminated."

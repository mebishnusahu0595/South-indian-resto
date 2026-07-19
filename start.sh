#!/bin/bash

# Terminate script on error
set -e

echo "============================================="
echo "  Starting Kea By The Pool Application Stack  "
echo "============================================="

# Function to kill all spawned child processes on exit
cleanup() {
    echo ""
    echo "Stopping all services..."
    if [ ! -z "$BACKEND_PID" ]; then
        echo "Stopping backend (PID: $BACKEND_PID)..."
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        echo "Stopping frontend (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    echo "All services stopped."
    exit 0
}

# Trap INT and TERM signals to trigger cleanup
trap cleanup SIGINT SIGTERM EXIT

# Start Backend in background
echo "Starting Backend API Server..."
cd backend
npm start &
BACKEND_PID=$!
cd ..
echo "Backend started with PID: $BACKEND_PID"

# Start Frontend in background
echo "Starting Frontend Dev Server..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..
echo "Frontend started with PID: $FRONTEND_PID"

echo "============================================="
echo "Services are running. Press Ctrl+C to stop."
echo "============================================="

# Keep script running and wait for background processes
wait

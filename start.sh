#!/bin/bash
# Invoice System - Start Server (Mac/Linux)
cd "$(dirname "$0")"
echo "Starting Invoice System on http://0.0.0.0:8090"
echo "Admin UI: http://localhost:8090/_/"
echo "Press Ctrl+C to stop"
./pocketbase serve --http=0.0.0.0:8090

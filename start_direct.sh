#!/bin/bash
# Direct MCP Server Startup Script

# 1. Navigate to Project Directory
cd "/Users/rohith/Desktop/Altrosynai/Browser Use"

# 2. Log startup attempt
echo "[Wrapper] Starting direct server..." >> /tmp/mcp_debug.log
echo "CWD: $(pwd)" >> /tmp/mcp_debug.log

# 3. Exec Node with Direct Server
# DO NOT redirect output, as Stdio is used for JSON-RPC transport!
exec /usr/local/bin/node src/mcp/direct_server.js

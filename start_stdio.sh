#!/bin/bash
# Unified MCP Server Startup

# 1. Navigate to Project Directory
cd "/Users/rohith/Desktop/Altrosynai/Browser Use"

# 2. Log startup
echo "[$(date)] Starting Unified MCP Server..." >> /tmp/browser_use_mcp_unified.log

# 3. Exec Node with Stdio Server
exec /usr/local/bin/node src/mcp/stdio_server.js

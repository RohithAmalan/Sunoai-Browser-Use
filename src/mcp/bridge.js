
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const EventSource = require("eventsource").EventSource;

const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(process.cwd(), 'bridge.log');

// Debug logging
function log(msg) {
    const timestamp = new Date().toISOString();
    const logMsg = `[Bridge ${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, logMsg);
    } catch (e) {
        // ignore
    }
    console.error(msg);
}

async function runBridge() {
    log("Starting Raw Proxy Bridge...");

    // 1. Setup Stdio (Connection to Claude)
    const stdio = new StdioServerTransport();
    await stdio.start();
    log("Stdio Transport Started");

    // 2. Setup SSE (Connection to Manual Server)
    const BASE_URL = "http://localhost:3000";
    let postUrl = null;

    log(`Connecting to SSE at ${BASE_URL}/sse...`);
    const es = new EventSource(`${BASE_URL}/sse`);

    es.onerror = (err) => {
        log(`CRITICAL SSE ERROR: ${JSON.stringify(err)}`);
        // If connection fails, keep process alive to show error in Claude
        setTimeout(() => { }, 10000);
    };

    es.onopen = () => {
        log("SSE Connected");
    };



    // Handle 'endpoint' event to get the POST URL
    es.addEventListener('endpoint', (event) => {
        const path = event.data; // e.g., "/messages?sessionId=..."
        postUrl = new URL(path, BASE_URL).toString();
        log(`Endpoint Received: ${postUrl}`);
    });

    // Handle 'message' event (Incoming from Server -> Send to Claude)
    es.onmessage = (event) => {
        if (!event.data) return;
        try {
            const msg = JSON.parse(event.data);
            // log(`Server -> Claude: ${JSON.stringify(msg).substring(0, 50)}...`);
            stdio.send(msg);
        } catch (e) {
            log(`Failed to parse SSE message: ${e.message}`);
        }
    };

    // Handle Stdio messages (Incoming from Claude -> Send to Server)
    stdio.onmessage = async (message) => {
        if (!postUrl) {
            log("Warn: Ignoring message from Claude (No session yet)");
            return;
        }

        try {
            // log(`Claude -> Server: ${JSON.stringify(message).substring(0, 50)}...`);
            await fetch(postUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(message)
            });
        } catch (e) {
            log(`Failed to post to server: ${e.message}`);
        }
    };

    log("Bridge Ready. Waiting for traffic...");
}

runBridge().catch((err) => {
    console.error("Fatal Error:", err);
});

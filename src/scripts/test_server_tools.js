
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const EventSource = require("eventsource").EventSource;

async function testServer() {
    console.log("Testing Connection to http://localhost:3000/sse ...");

    // 1. Connect
    const es = new EventSource("http://localhost:3000/sse");
    let postUrl = null;

    es.onerror = (err) => {
        console.error("SSE Error:", err);
        process.exit(1);
    };

    es.addEventListener('endpoint', (event) => {
        const path = event.data;
        postUrl = new URL(path, "http://localhost:3000").toString();
        console.log("Endpoint:", postUrl);

        // 2. Send Initialize
        sendRPC({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05", // Spec version
                capabilities: {},
                clientInfo: { name: "test-script", version: "1.0" }
            }
        });
    });

    es.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        console.log("Received:", JSON.stringify(msg, null, 2));

        if (msg.id === 1) {
            // Initialize response received. Now list tools.
            console.log("Initialized. Asking for tools...");
            sendRPC({
                jsonrpc: "2.0",
                id: 2,
                method: "tools/list",
                params: {}
            });
        }
        else if (msg.id === 2) {
            console.log("Tools received!");
            const tools = msg.result.tools;
            console.log("Tool Count:", tools.length);
            tools.forEach(t => console.log(` - ${t.name}`));
            process.exit(0);
        }
    };

    async function sendRPC(payload) {
        if (!postUrl) return;
        console.log("Sending RPC ID:", payload.id);
        try {
            const res = await fetch(postUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log("POST Status:", res.status);
            if (!res.ok) console.log("POST Error:", await res.text());
        } catch (e) {
            console.error("POST Failed:", e);
        }
    }
}

testServer();

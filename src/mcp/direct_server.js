
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SunoBot } from '../core/suno.js';
import fs from 'fs';
import path from 'path';

// --- logging setup ---
const LOG_FILE = path.join(process.cwd(), 'mcp_server.log');
function log(msg) {
    const timestamp = new Date().toISOString();
    try {
        fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
    } catch (e) { }
}

log("Starting Direct MCP Server...");

// --- server setup ---
const server = new Server(
    {
        name: "browser-automation-server-direct",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

let sunoBot = null;
let notebookBot = null; // Placeholder if needed

// --- tool handlers ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "generate_song",
                description: "Generate a new song on Suno AI.",
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: { type: "string" },
                        instrumental: { type: "boolean" }
                    },
                    required: ["prompt"]
                }
            },
            {
                name: "open_login_window",
                description: "Open visible Suno login window.",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    log(`Tool Call: ${name} ${JSON.stringify(args)}`);

    try {
        if (name === "open_login_window") {
            if (!sunoBot) sunoBot = new SunoBot();
            await sunoBot.initialize(false); // headful
            await sunoBot.ensureLoggedIn();
            return {
                content: [{ type: "text", text: "Login window opened. Please log in." }]
            };
        }

        if (name === "generate_song") {
            if (!sunoBot) {
                // Default to headless for generation if not already open
                sunoBot = new SunoBot();
                await sunoBot.initialize(true);
            }
            // Ensure logged in logic handled inside SunoBot usually
            await sunoBot.ensureLoggedIn();

            log("Generating song...");
            const result = await sunoBot.generateSong(args.prompt, args.instrumental);
            log(`Generation result: ${JSON.stringify(result)}`);

            return {
                content: [{ type: "text", text: `Song generation started/completed. Result: ${JSON.stringify(result)}` }]
            };
        }

        throw new Error(`Unknown tool: ${name}`);

    } catch (error) {
        log(`Error: ${error.message}`);
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
        };
    }
});

// --- startup ---
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("Direct Server Connected to Stdio");
}

run().catch((error) => {
    log(`Fatal Error: ${error}`);
    console.error(error);
});

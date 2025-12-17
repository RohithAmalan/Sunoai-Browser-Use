#!/usr/bin/env node

/**
 * Unified Browser Use MCP Server
 * ------------------------------
 * Uses StdioServerTransport for reliable local communication with Claude Desktop.
 * Combines SunoBot and NotebookBot capabilities.
 * Logs to <project_root>/mcp_Unified_server.log
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { SunoBot } from '../core/suno.js';
import { NotebookBot } from '../core/notebook.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Paths & Logging ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const LOG_FILE = path.join(PROJECT_ROOT, 'mcp_unified_server.log');

function log(msg) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, logMsg);
    } catch (e) {
        // If logging fails, we can't do much in Stdio mode as stdout is reserved for RPC
    }
}

// --- Global Console Override ---
// Vital for Stdio: Redirect console.log to file so it doesn't break JSON-RPC on stdout
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = function (...args) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    log(`[INFO] ${msg}`);
};

console.warn = function (...args) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    log(`[WARN] ${msg}`);
    // originalConsoleError.apply(console, args); // Optional: keep stderr for terminal visibility if needed
};

console.error = function (...args) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    log(`[ERROR] ${msg}`);
    originalConsoleError.apply(console, args); // Keep stderr as it doesn't break Stdio
};


// Ensure data directories exist
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DOWNLOADS_DIR = path.join(DATA_DIR, 'downloads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

log("--- Starting Unified MCP Server ---");
log(`Root: ${PROJECT_ROOT}`);

// --- Bot Instances ---
let sunoBot = null;
let notebookBot = null;

// Helper to get SunoBot instance
async function getSunoBot(headless = true) {
    if (!sunoBot) {
        const authPath = path.join(DATA_DIR, 'auth.json');
        sunoBot = new SunoBot(authPath);
        await sunoBot.initialize(headless);
        log(`SunoBot initialized (headless: ${headless})`);
    }
    return sunoBot;
}

// Helper to get NotebookBot instance
// Note: NotebookBot usually requires separate auth handling, assume default path inside bot class or passed here if needed.
async function getNotebookBot(headless = true) {
    if (!notebookBot) {
        notebookBot = new NotebookBot();
        await notebookBot.initialize(headless);
        log(`NotebookBot initialized (headless: ${headless})`);
    }
    return notebookBot;
}


// --- Server Setup ---
const server = new Server(
    {
        name: "browser-automation-unified",
        version: "2.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// --- Tool Definitions ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            // === SUNO TOOLS ===
            {
                name: "suno_generate_song",
                description: "Generate a new song on Suno AI.",
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: { type: "string", description: "Description of the song to generate" },
                        instrumental: { type: "boolean", description: "Whether to generate an instrumental track" }
                    },
                    required: ["prompt"]
                }
            },
            {
                name: "suno_open_login",
                description: "Open a visible browser window to log in to Suno AI manually.",
                inputSchema: { type: "object", properties: {} }
            },
            {
                name: "suno_download_recent",
                description: "Download the most recent songs from the library.",
                inputSchema: {
                    type: "object",
                    properties: { count: { type: "number", description: "Number of recent songs to download (default 1)" } }
                }
            },

            // === NOTEBOOK TOOLS ===
            {
                name: "notebook_open_login",
                description: "Open a visible browser window to log in to Google NotebookLLM manually.",
                inputSchema: { type: "object", properties: {} }
            },
            {
                name: "notebook_create",
                description: "Create a new notebook in NotebookLLM.",
                inputSchema: {
                    type: "object",
                    properties: { title: { type: "string", description: "Title of the new notebook" } },
                    required: ["title"]
                }
            },
            {
                name: "notebook_add_source",
                description: "Add a source (URL, YouTube, File, Text) to the current active notebook.",
                inputSchema: {
                    type: "object",
                    properties: {
                        type: { type: "string", enum: ["file", "url", "youtube", "text"] },
                        content: { type: "string", description: "The URL, file path, or text content" }
                    },
                    required: ["type", "content"]
                }
            },
            {
                name: "notebook_query",
                description: "Query the currently open notebook.",
                inputSchema: {
                    type: "object",
                    properties: { message: { type: "string", description: "The question or query to ask" } },
                    required: ["message"]
                }
            }
        ]
    };
});

// --- Tool Execution ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    log(`Executing Tool: ${name}`);

    try {
        // === SUNO HANDLERS ===
        if (name === "suno_open_login") {
            // Close existing if any to avoid conflicts
            if (sunoBot) { await sunoBot.close(); sunoBot = null; }

            const bot = await getSunoBot(false); // Headful
            await bot.ensureLoggedIn(); // This will wait/check for login

            // We keep it open or close? Typically for login helpers we might just verify and close, 
            // but the user might want to see it. Let's close after confirmation to save state.
            await bot.close();
            sunoBot = null;
            return { content: [{ type: "text", text: "Login verified and session saved." }] };
        }

        if (name === "suno_generate_song") {
            const bot = await getSunoBot(true); // Headless for backend processing
            await bot.ensureLoggedIn();
            const result = await bot.generateSong(args.prompt, args.instrumental === true, DOWNLOADS_DIR);

            if (!result.success) throw new Error(result.error || "Generation failed");

            return { content: [{ type: "text", text: `Song generated successfully!\nPath: ${JSON.stringify(result)}` }] };
        }

        if (name === "suno_download_recent") {
            const bot = await getSunoBot(true); // Headless
            await bot.ensureLoggedIn();
            await bot.downloadRecentSongs(args.count || 1, DOWNLOADS_DIR);
            return { content: [{ type: "text", text: `Recent song(s) downloaded to ${DOWNLOADS_DIR}` }] };
        }

        // === NOTEBOOK HANDLERS ===
        if (name === "notebook_open_login") {
            if (notebookBot) { await notebookBot.close(); notebookBot = null; }

            const bot = await getNotebookBot(false); // Headful
            await bot.ensureLoggedIn();

            // Save state and close
            if (bot.context) await bot.context.storageState({ path: bot.storageStatePath });
            await bot.close();
            notebookBot = null;

            return { content: [{ type: "text", text: "NotebookLLM login complete. Session saved." }] };
        }

        if (name === "notebook_create") {
            // Usually need headful for safety or complex UI interaction, but try headless if possible?
            // Safer to default to headful for Google properties to avoid bot detection issues, 
            // or stick to headless if our script is robust. Let's try Headless first.
            const bot = await getNotebookBot(true);
            await bot.ensureLoggedIn();
            const res = await bot.createNotebook(args.title);
            return { content: [{ type: "text", text: res.message }] };
        }

        if (name === "notebook_add_source") {
            const bot = await getNotebookBot(true);
            await bot.ensureLoggedIn();
            const res = await bot.addSource(args.type, args.content);
            return { content: [{ type: "text", text: res.message }] };
        }

        if (name === "notebook_query") {
            const bot = await getNotebookBot(true);
            await bot.ensureLoggedIn();
            const res = await bot.queryNotebook(args.message);
            return { content: [{ type: "text", text: res.answer }] };
        }

        throw new Error(`Unknown tool: ${name}`);

    } catch (error) {
        log(`Error executing ${name}: ${error.message}`);
        console.error(error); // This goes to stderr, which Claude desktop might capture or ignore, but good for debugging if we see it.
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
        };
    }
});

// --- Startup ---
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("Server connected to Stdio transport.");
}

run().catch((error) => {
    log(`Fatal Server Error: ${error}`);
    process.exit(1);
});

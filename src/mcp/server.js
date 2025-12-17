#!/usr/bin/env node

// ---------------------------------------------------------
// LOGGING SETUP
// Redirect console.log and console.error to a file
// ---------------------------------------------------------
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
const LOG_DIR = join(__dirname, '../../data');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const LOG_FILE = join(LOG_DIR, 'server.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function logToFile(type, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    logStream.write(`[${timestamp}] [${type}] ${message}\n`);
}

// Override console methods
// Console overrides removed to allow terminal output for manual execution
// console.log = (...args) => logToFile('INFO', args);
// console.error = (...args) => logToFile('ERROR', args);
// console.warn = (...args) => logToFile('WARN', args);

console.log('--- MCP Server Starting (Suno + NotebookLLM) ---');

// ---------------------------------------------------------
// IMPORTS
// ---------------------------------------------------------
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { SunoBot } from '../core/suno.js';
import { NotebookBot } from '../core/notebook.js';

// ---------------------------------------------------------
// BOT INSTANCES
// ---------------------------------------------------------

// 1. Suno Bot
const SUNO_AUTH_PATH = join(__dirname, '../../data/auth.json');
const sunoBot = new SunoBot(SUNO_AUTH_PATH);
let isSunoInitialized = false;

// 2. Notebook Bot
// Auth is handled internally by default path data/auth_notebook.json
const notebookBot = new NotebookBot();
let isNotebookInitialized = false;


// ---------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------

async function ensureSunoBot(headful = true) { // Defaulting to true (Headless) as per last revert, but let's respect user choice if passed
    if (!isSunoInitialized) {
        try {
            console.log(`[MCP] Initializing SunoBot (Headless: ${headful})...`);
            await sunoBot.initialize(headful);
            await sunoBot.ensureLoggedIn();
            isSunoInitialized = true;
            console.log('[MCP] SunoBot initialized.');
        } catch (error) {
            console.error('[MCP] Failed to initialize SunoBot:', error);
            throw error;
        }
    }
    return sunoBot;
}

async function ensureNotebookBot(headful = false) { // Notebook usually requires headful for first login
    if (!isNotebookInitialized) {
        try {
            console.log(`[MCP] Initializing NotebookBot (Headless: ${!headful})...`);
            // Note: NotebookBot.initialize takes 'headless' boolean. So if headful=true, headless=false.
            await notebookBot.initialize(!headful);
            // We do NOT call ensureLoggedIn() here automatically because it might need manual intervention first time.
            isNotebookInitialized = true;
            console.log('[MCP] NotebookBot driver initialized.');
        } catch (error) {
            console.error('[MCP] Failed to initialize NotebookBot:', error);
            throw error;
        }
    }
    return notebookBot;
}

// ---------------------------------------------------------
// MCP SERVER
// ---------------------------------------------------------

const server = new Server(
    {
        name: 'browser-automation-server', // Renamed generic
        version: '2.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Define Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            // --- SUNO TOOLS ---
            {
                name: 'generate_song',
                description: 'Generate a new song on Suno AI.',
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
                name: 'download_recent',
                description: 'Download recent Suno songs.',
                inputSchema: {
                    type: "object",
                    properties: { count: { type: "number" } }
                }
            },
            {
                name: 'open_login_window',
                description: 'Open visible Suno login window.',
                inputSchema: { type: "object", properties: {} }
            },

            // --- NOTEBOOK TOOLS ---
            {
                name: 'notebook_login',
                description: 'Opens a visible browser to log in to Google NotebookLLM. Run this once first!',
                inputSchema: { type: "object", properties: {} }
            },
            {
                name: 'notebook_create',
                description: 'Create a new notebook in NotebookLLM.',
                inputSchema: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "Title of the new notebook" }
                    },
                    required: ["title"]
                }
            },
            {
                name: 'notebook_add_source',
                description: 'Add a source to the current notebook.',
                inputSchema: {
                    type: "object",
                    properties: {
                        type: { type: "string", enum: ["file", "url", "youtube", "text"], description: "Type of source" },
                        content: { type: "string", description: "File path, URL, or Text content" }
                    },
                    required: ["type", "content"]
                }
            },
            {
                name: 'notebook_query',
                description: 'Ask a question to the current notebook.',
                inputSchema: {
                    type: "object",
                    properties: { message: { type: "string" } },
                    required: ["message"]
                }
            },
            {
                name: 'notebook_process_source',
                description: 'Create a notebook, add a source (file/url/youtube/text), and optionally query it.',
                inputSchema: {
                    type: "object",
                    properties: {
                        notebook_title: { type: "string" },
                        source_type: { type: "string", enum: ["file", "url", "youtube", "text"] },
                        source_content: { type: "string" },
                        query: { type: "string" }
                    },
                    required: ["source_type", "source_content"]
                }
            }
        ],
    };
});

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        const name = request.params.name;
        const args = request.params.arguments;
        console.log(`[MCP] Tool Call: ${name}`, args);

        // --- SUNO HANDLERS ---
        if (name === 'open_login_window') {
            if (isSunoInitialized) { await sunoBot.close(); isSunoInitialized = false; }
            await sunoBot.initialize(false); // Headful
            await sunoBot.ensureLoggedIn();
            await sunoBot.close();
            isSunoInitialized = false;
            return { content: [{ type: 'text', text: "Login successful!" }] };
        }

        if (name === 'generate_song') {
            await ensureSunoBot(true); // Headless default
            const dlDir = join(__dirname, '../../data/downloads');
            if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });

            const result = await sunoBot.generateSong(args.prompt, args.instrumental === true, dlDir, true);
            if (!result.success) throw new Error(result.error);
            return { content: [{ type: 'text', text: `Success: ${JSON.stringify(result)}` }] };
        }

        if (name === 'download_recent') {
            await ensureSunoBot(true);
            const dlDir = join(__dirname, '../../data/downloads');
            const count = args.count || 1;
            await sunoBot.downloadRecentSongs(count, dlDir);
            return { content: [{ type: 'text', text: "Downloads processed." }] };
        }

        // --- NOTEBOOK HANDLERS ---
        if (name === 'notebook_login') {
            console.log('[MCP] Opening NotebookLLM Login...');
            if (isNotebookInitialized) { await notebookBot.close(); isNotebookInitialized = false; }

            // Initialize Headful (false means NOT headless)
            await ensureNotebookBot(true); // pass true for "headful"; my helper logic flips it for initialize

            // Wait for explicit login check
            await notebookBot.ensureLoggedIn();

            // Keep it open? Or close? 
            // Ideally we close to save state, then reopen in "headless" or "headful" as needed.
            // But for Notebooks, we probably want to keep the session alive or reload it.
            await notebookBot.context.storageState({ path: notebookBot.storageStatePath });
            await notebookBot.close();
            isNotebookInitialized = false;

            return { content: [{ type: 'text', text: "Notebook Login successful! Session saved." }] };
        }

        if (name === 'notebook_create') {
            // Use headful for visual confirmation? Or headless? prompt user or default?
            // Let's use Headful (visible) for now to be safe with Google.
            await ensureNotebookBot(true);
            const result = await notebookBot.createNotebook(args.title);
            return { content: [{ type: 'text', text: result.message }] };
        }

        if (name === 'notebook_add_source') {
            await ensureNotebookBot(true);
            const result = await notebookBot.addSource(args.type, args.content);
            return { content: [{ type: 'text', text: result.message }] };
        }

        if (name === 'notebook_query') {
            await ensureNotebookBot(true);
            const result = await notebookBot.queryNotebook(args.message);
            return { content: [{ type: 'text', text: result.answer }] };
        }

        if (name === 'notebook_process_source') {
            await ensureNotebookBot(true); // Headful for safety

            let resultMsg = "";

            // 1. Create Notebook (if title provided) or ensure open
            if (args.notebook_title) {
                const createRes = await notebookBot.createNotebook(args.notebook_title);
                resultMsg += createRes.message + " ";
            } else {
                await notebookBot.ensureNotebookOpen();
            }

            // 2. Add Source
            const addRes = await notebookBot.addSource(args.source_type, args.source_content);
            resultMsg += addRes.message + " ";

            // 3. Query (if provided)
            let answer = null;
            if (args.query) {
                const queryRes = await notebookBot.queryNotebook(args.query);
                answer = queryRes.answer;
                resultMsg += "\n\nAnswer: " + answer;
            }

            return { content: [{ type: 'text', text: resultMsg }] };
        }

        throw new Error(`Tool ${name} not found`);
    } catch (error) {
        console.error('[MCP] Execution Error:', error);
        return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});

// ---------------------------------------------------------
// SERVER (Express + SSE)
// ---------------------------------------------------------

const app = express();

app.use(cors()); // Allow CORS for web clients
// app.use(express.json()); // Parse JSON bodies -- COMMENTED OUT: Conflicts with SDK transport stream reading





// Map to store active transports: sessionId -> transport
const transports = new Map();

app.get('/sse', async (req, res) => {
    console.log('[MCP] New SSE Connection Request');

    // Create new transport
    const transport = new SSEServerTransport('/messages', res);

    // Access the session ID (generated by the transport constructor usually, or we need to wait for start?)
    // The SDK's SSEServerTransport generates `this.sessionId`.

    console.log(`[MCP] Session Created: ${transport.sessionId}`);
    transports.set(transport.sessionId, transport);

    // Cleanup on close
    transport.onclose = () => {
        console.log(`[MCP] Session Closed: ${transport.sessionId}`);
        transports.delete(transport.sessionId);
    };

    await server.connect(transport);
});

app.post('/messages', async (req, res) => {
    console.log(`[MCP] Received POST /messages (Session: ${req.query.sessionId})`);
    console.log(`[MCP] Headers:`, req.headers);
    console.log(`[MCP] Body (if parsed):`, req.body);
    console.log(`[MCP] Stream Readable:`, req.readable);
    const sessionId = req.query.sessionId;
    if (!sessionId) {
        res.status(400).send('Missing sessionId');
        return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
        res.status(404).send('Session not found');
        return;
    }

    try {
        await transport.handlePostMessage(req, res);
    } catch (error) {
        console.error('[MCP] Error handling message:', error);
        res.status(500).send(error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[MCP] Server running on http://localhost:${PORT}/sse`);
    console.log(`[SETUP] Please update your claude_desktop_config.json to use this URL.`);
});

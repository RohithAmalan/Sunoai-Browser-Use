#!/usr/bin/env node
// Redirect console.log to console.error to prevent polluting stdout (which is used for MCP JSON-RPC)
console.log = console.error;

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { SunoBot } from './suno_automation.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create the SunoBot instance with ABSOLUTE path for auth
const AUTH_PATH = join(__dirname, 'auth.json');
const bot = new SunoBot(AUTH_PATH);
let isBotInitialized = false;
let sessionStartTime = 0;
const SESSION_LIFETIME = 60 * 60 * 1000; // 1 Hour

// Initialize the bot if not already done
async function ensureBot() {
    const needsRefresh = isBotInitialized && (Date.now() - sessionStartTime > SESSION_LIFETIME);

    if (needsRefresh) {
        console.error('[MCP] 🔄 Session expired (1h limit). Restarting browser...');
        try { await bot.close(); } catch (e) { }
        isBotInitialized = false;
    }

    if (!isBotInitialized) {
        try {
            console.error('[MCP] Initializing SunoBot (Headless)...');
            await bot.initialize(true); // Headless mode per user request
            await bot.ensureLoggedIn();
            isBotInitialized = true;
            sessionStartTime = Date.now();
        } catch (error) {
            console.error('[MCP] Failed to initialize bot:', error);
            throw error;
        }
    }
    return bot;
}

// Create the MCP server
const server = new Server(
    {
        name: 'suno-automation-server',
        version: '1.0.0',
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
            {
                name: 'generate_song',
                description: 'Generate a new song on Suno AI with a description and optional instrumental flag. Automatically downloads the resulting song.',
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "string",
                            description: "Description of the song style, lyrics, or mood"
                        },
                        instrumental: {
                            type: "boolean",
                            description: "Whether the song should be instrumental only (default: false)"
                        }
                    },
                    required: ["prompt"]
                }
            },
            {
                name: 'download_recent',
                description: 'Download the most recent songs from the Suno library.',
                inputSchema: {
                    type: "object",
                    properties: {
                        count: {
                            type: "number",
                            description: "Number of recent songs to download (default: 1)"
                        }
                    }
                }
            },
            {
                name: 'open_login_window',
                description: 'Opens a visible browser window for you to log in to Suno manually. Use this if authentication fails.',
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            },
            {
                name: 'list_songs',
                description: 'List all downloaded song files available on the server.',
                inputSchema: { type: "object", properties: {} }
            },
            {
                name: 'get_song',
                description: 'Retrieve a song file to play or download. Provide the filename from list_songs.',
                inputSchema: {
                    type: "object",
                    properties: {
                        filename: { type: "string", description: "Name of the file to retrieve (e.g. song.mp3)" }
                    },
                    required: ["filename"]
                }
            }
        ],
    };
});

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        if (request.params.name === 'open_login_window') {
            console.error('[MCP] Opening login window...');
            // Close existing headless bot
            if (isBotInitialized) {
                try { await bot.close(); } catch (e) { }
                isBotInitialized = false;
            }

            // Launch Headful
            await bot.initialize(false); // headless: false

            // This waits for the user to be on the create page
            await bot.ensureLoggedIn();

            // Login successful, now close it so we can go back to headless next time
            await bot.close();
            isBotInitialized = false;

            return {
                content: [
                    {
                        type: 'text',
                        text: "Login successful! Session saved. You can now use 'generate_song'.",
                    }
                ]
            };
        }

        await ensureBot();

        if (request.params.name === 'generate_song') {
            const { prompt, instrumental } = request.params.arguments;
            console.error(`[MCP] Generating song: "${prompt}" (Instr: ${instrumental})`);

            // Use absolute download path
            const downloadDir = join(__dirname, 'downloads');

            try {
                // Wait = true (User requested blocking wait)
                const result = await bot.generateSong(prompt, instrumental === true, downloadDir, true);

                if (!result.success) {
                    throw new Error(result.error || 'Unknown error');
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully generated and downloaded song. prompt: "${prompt}". Result: ${JSON.stringify(result)}`,
                        },
                    ],
                };
            } catch (err) {
                if (err.message.includes('TERM_LIMIT_EXCEEDED')) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `🚫 **GENERATION FAILED: OUT OF CREDITS**\n\nYour Suno account has reached its credit limit. You cannot generate more songs until your credits refresh.\n\nPlease log in explicitly to check your account status.`,
                            },
                        ],
                        isError: true,
                    };
                }
                throw err;
            }
        }

        if (request.params.name === 'download_recent') {
            const count = request.params.arguments?.count || 1;
            console.error(`[MCP] Downloading ${count} recent songs...`);

            const downloadDir = join(__dirname, 'downloads');
            await bot.downloadRecentSongs(count, downloadDir);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully processed downloads. Check directory: ${downloadDir}`,
                    },
                ],
            };
        }

        if (request.params.name === 'list_songs') {
            const downloadDir = join(__dirname, 'downloads');
            if (!fs.existsSync(downloadDir)) return { content: [{ type: 'text', text: "No downloads directory found." }] };

            const files = fs.readdirSync(downloadDir).filter(f => f.endsWith('.mp3'));
            return {
                content: [{ type: 'text', text: `Found ${files.length} songs:\n` + files.map(f => `- ${f}`).join('\n') }]
            };
        }

        if (request.params.name === 'get_song') {
            const { filename } = request.params.arguments;
            const downloadDir = join(__dirname, 'downloads');
            const filePath = join(downloadDir, filename);

            if (!fs.existsSync(filePath)) throw new Error('File not found');

            // Read file as base64
            const buffer = fs.readFileSync(filePath);
            const base64 = buffer.toString('base64');

            return {
                content: [
                    {
                        type: 'text',
                        text: `Here is the audio file: ${filename}`,
                    },
                    {
                        type: 'resource',
                        resource: {
                            uri: `file://${filePath}`,
                            mimeType: 'audio/mpeg',
                            text: base64
                        }
                    }
                ]
            };
        }

        throw new Error('Tool not found');
    } catch (error) {
        console.error('[MCP] Tool Execution Error:', error);
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: ${error.message}`,
                },
            ],
            isError: true,
        };
    }
});

// Start Server
async function runServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Suno MCP Server running on stdio...');
}

runServer().catch((error) => {
    console.error('Fatal MCP Server Error:', error);
    process.exit(1);
});

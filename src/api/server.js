import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { SunoBot } from '../core/suno.js';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// Global Error Handling to prevent server crashes
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err);
    // Keep the process alive, but maybe restart bot if needed?
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 UNHANDLED REJECTION:', reason);
});

// Single instance of the bot
const bot = new SunoBot();
let isInitialized = false;
let sessionStartTime = 0;
const SESSION_LIFETIME = 60 * 60 * 1000; // 1 Hour

// Middleware to check if bot is initialized & handle rotation
const requireAuth = async (req, res, next) => {
    if (!isInitialized) {
        return res.status(400).json({ error: 'Bot not initialized. Call /api/init first.' });
    }

    // Check for session expiry
    if (Date.now() - sessionStartTime > SESSION_LIFETIME) {
        console.log('🔄 Session expired (1h limit). Restarting browser...');
        try {
            await bot.close();
        } catch (e) { console.error('Error closing old session:', e); }

        try {
            await bot.initialize(true); // Re-init (Headless assumed if preserving state)
            await bot.ensureLoggedIn();
            sessionStartTime = Date.now();
            console.log('✅ Session refreshed successfully.');
        } catch (e) {
            console.error('❌ Failed to refresh session:', e);
            return res.status(500).json({ error: 'Session refresh failed', details: e.message });
        }
    }

    next();
};

/**
 * POST /api/init
 * Initializes the browser and verifies login.
 * Body: { "headless": false } (optional)
 */
app.post('/api/init', async (req, res) => {
    try {
        if (isInitialized) {
            return res.json({ message: 'Bot already initialized.' });
        }

        const body = req.body || {};
        const runHeadless = body.headless === true;

        console.log(`[API] Initializing bot (Headless: ${runHeadless})...`);
        await bot.initialize(runHeadless);

        console.log('[API] Check login...');
        await bot.ensureLoggedIn();

        isInitialized = true;
        sessionStartTime = Date.now();
        res.json({ message: 'Bot initialized and logged in successfully.' });

    } catch (error) {
        console.error('[API Error] Init failed:', error);
        res.status(500).json({ error: 'Initialization failed', details: error.message });
        // Cleanup if init failed
        try { await bot.close(); } catch (e) { }
    }
});

/**
 * POST /api/generate
 * Generates a song.
 * Body: { "prompt": "song description", "instrumental": false }
 */
app.post('/api/generate', requireAuth, async (req, res) => {
    try {
        const { prompt, instrumental } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        console.log(`[API] Generating song: "${prompt}"`);
        const result = await bot.generateSong(prompt, instrumental || false);

        res.json({ message: 'Generation and download completed', data: result });

    } catch (error) {
        console.error('[API Error] Generation failed:', error);
        res.status(500).json({ error: 'Generation failed', details: error.message });
    }
});

/**
 * POST /api/download
 * Downloads recent songs.
 * Body: { "count": 5 }
 */
app.post('/api/download', requireAuth, async (req, res) => {
    try {
        const count = req.body.count || 5;
        console.log(`[API] Downloading top ${count} songs...`);

        // Note: downloadRecentSongs prints to console, we rely on logs for now.
        // In a real API, we might want to capture return values.
        await bot.downloadRecentSongs(count);

        const downloadsPath = path.resolve(process.cwd(), 'downloads');
        res.json({ message: 'Download process completed', download_directory: downloadsPath });

    } catch (error) {
        console.error('[API Error] Download failed:', error);
        res.status(500).json({ error: 'Download failed', details: error.message });
    }
});

/**
 * POST /api/close
 * Closes the browser session.
 */
app.post('/api/close', async (req, res) => {
    try {
        if (isInitialized) {
            await bot.close();
            isInitialized = false;
        }
        res.json({ message: 'Browser closed.' });
    } catch (error) {
        res.status(500).json({ error: 'Error closing browser', details: error.message });
    }
});

// Start Server
try {
    const server = app.listen(PORT, () => {
        console.log(`\n🚀 Suno API Server running on http://localhost:${PORT}`);
        console.log('Endpoints:');
        console.log('  POST /api/init      - Start Browser');
        console.log('  POST /api/generate  - Generate Song');
        console.log('  POST /api/download  - Download Songs');
        console.log('  POST /api/close     - Stop Browser\n');
    });

    server.on('error', (e) => {
        console.error('❌ Server Error:', e);
    });

} catch (e) {
    console.error('❌ Failed to start server:', e);
}

process.on('exit', (code) => {
    console.log(`👋 Server process exiting with code: ${code}`);
});

process.on('SIGINT', () => {
    console.log('Caught interrupt signal (SIGINT). Exiting...');
    process.exit();
});

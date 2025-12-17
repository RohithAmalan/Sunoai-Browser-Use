import { SunoBot } from '../core/suno.js';

async function main() {
    const bot = new SunoBot();

    try {
        console.log('--- Suno Debug Start ---');

        // 1. Initialize Headful (Visible)
        console.log('Initializing Headful...');
        await bot.initialize(false); // false = headful

        // 2. Ensure Logged In
        console.log('Checking login state...');
        await bot.ensureLoggedIn();

        // 3. Generate Song
        const prompt = "A futuristic song about successful debugging and automation.";
        console.log(`Attempting generation with prompt: "${prompt}"`);

        // Disable waiting for download for the debug test (we just want to see creation work)
        const result = await bot.generateSong(prompt, false, null, true);

        console.log('Result:', result);

    } catch (e) {
        console.error('DEBUG FAILED:', e);
    } finally {
        // Keep open for a bit to inspect if needed
        console.log('Test complete. Keeping browser open for 30s...');
        await new Promise(r => setTimeout(r, 30000));
        await bot.close();
    }
}

main();

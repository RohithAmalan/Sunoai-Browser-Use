
import { SunoBot } from './suno_automation.js';

async function debugDirect() {
    console.log('--- Direct Debug Start ---');
    const bot = new SunoBot();

    try {
        await bot.initialize(false); // Headful
        await bot.ensureLoggedIn();

        console.log('Calling downloadRecentSongs(1)...');
        await bot.downloadRecentSongs(1);

    } catch (e) {
        console.error('CRITICAL ERROR:', e);
    } finally {
        console.log('--- Closing ---');
        await bot.close();
    }
}

debugDirect();

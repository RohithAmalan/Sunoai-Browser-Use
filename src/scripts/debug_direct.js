
import { SunoBot } from '../core/suno.js';

async function debugDirect() {
    console.log('--- Direct Debug Start ---');
    const bot = new SunoBot();

    try {
        await bot.initialize(false); // Headful
        await bot.ensureLoggedIn();

        console.log('Generating Test Song (Instrumental)...');
        await bot.generateSong("A fast upbeat techno song", true, null, true);

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

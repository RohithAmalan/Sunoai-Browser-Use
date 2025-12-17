
import { NotebookBot } from '../core/notebook.js';

async function debugNotebook() {
    console.log('--- Notebook Debug Start ---');
    const bot = new NotebookBot();

    try {
        console.log('Initializing Headful...');
        await bot.initialize(false); // Headful
        await bot.ensureLoggedIn();

        // Test Notebook Creation
        const title = `Debug Notebook ${Date.now()}`;
        await bot.createNotebook(title);

        console.log('--- TEST 1: YouTube ---');
        try {
            // Use a real video to test
            await bot.addSource('youtube', 'https://youtu.be/h_R3FafQrU8?si=RebtCwxj7vS0JKLg');
        } catch (e) {
            console.error('YouTube Failed:', e);
        }

        console.log('--- TEST 2: Querying ---');
        await bot.queryNotebook("Summarize this video in one paragraph.");

        // console.log('--- TEST 2: Website ---');
        // try {
        //     await bot.addSource('url', 'https://example.com');
        // } catch (e) {
        //     console.error('Website Failed:', e);
        // }

    } catch (e) {
        console.error('CRITICAL ERROR:', e);
    } finally {
        console.log('--- Closing ---');
        // await bot.close(); // Keep open to inspect
    }
}

debugNotebook();

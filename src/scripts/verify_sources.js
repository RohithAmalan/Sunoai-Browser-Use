
import { NotebookBot } from '../core/notebook.js';

async function verifySources() {
    console.log('--- Verification Start ---');
    const bot = new NotebookBot();

    try {
        console.log('Initializing Headful...');
        await bot.initialize(false); // Headful
        await bot.ensureLoggedIn();

        // TEST 1: YouTube
        console.log('\n--- TEST 1: YouTube ---');
        try {
            const title = `YouTube Test ${Date.now()}`;
            await bot.createNotebook(title);

            const ytUrl = 'https://youtu.be/h_R3FafQrU8?si=RebtCwxj7vS0JKLg';
            await bot.addSource('youtube', ytUrl);

            console.log('Querying YouTube summary...');
            const ytRes = await bot.queryNotebook("Summarize this video in one paragraph.");
            console.log('YouTube Summary:', ytRes.answer);

        } catch (e) {
            console.error('YouTube Test Failed:', e);
        }

        // TEST 2: Website
        console.log('\n--- TEST 2: Website ---');
        try {
            // Create new notebook for clean state
            const title = `Website Test ${Date.now()}`;
            await bot.createNotebook(title);

            const webUrl = 'https://www.geeksforgeeks.org/deep-learning/deep-learning-tutorial/';
            await bot.addSource('url', webUrl);

            console.log('Querying Website summary...');
            const webRes = await bot.queryNotebook("Summarize this article in one paragraph.");
            console.log('Website Summary:', webRes.answer);

        } catch (e) {
            console.error('Website Test Failed:', e);
        }

    } catch (e) {
        console.error('CRITICAL ERROR:', e);
    } finally {
        console.log('\n--- Closing ---');
        // await bot.close(); 
    }
}

verifySources();

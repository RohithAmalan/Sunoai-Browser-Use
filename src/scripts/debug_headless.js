
import { SunoBot } from '../core/suno.js';
import path from 'path';

async function debugHeadless() {
    console.log('--- Headless Debug Start ---');
    const bot = new SunoBot();

    try {
        console.log('Initializing Headless...');
        await bot.initialize(true); // Headless = true
        await bot.ensureLoggedIn();

        console.log('Generating song...');
        // We will trigger generation but NOT wait for the full download loop yet, 
        // seeing if we can even get to the "Creating..." state.

        // Actually, let's use the low-level functions to take screenshots
        await bot.page.goto('https://suno.com/create');
        await bot.page.waitForTimeout(3000);
        await bot.page.screenshot({ path: 'debug_step1_create_page.png' });
        console.log('Saved debug_step1_create_page.png');

        // Fill prompt
        const promptBox = bot.page.locator('textarea[placeholder*="song description"]');
        await promptBox.fill("A test song for debugging headless mode");
        await bot.page.screenshot({ path: 'debug_step2_filled.png' });
        console.log('Saved debug_step2_filled.png');

        // Click Create
        const createBtn = bot.page.locator('button:has-text("Create")').last();
        await createBtn.click();
        console.log('Clicked Create');

        await bot.page.waitForTimeout(5000); // Wait for generation to start
        await bot.page.screenshot({ path: 'debug_step3_generating.png' });
        console.log('Saved debug_step3_generating.png');

    } catch (e) {
        console.error('CRITICAL ERROR:', e);
        if (bot.page) {
            await bot.page.screenshot({ path: 'debug_error.png' });
            console.log('Saved debug_error.png');
        }
    } finally {
        console.log('--- Closing ---');
        await bot.close();
    }
}

debugHeadless();

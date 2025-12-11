
import { SunoBot } from './suno_automation.js';

async function debugDownload() {
    const bot = new SunoBot();
    try {
        await bot.initialize(false);
        await bot.ensureLoggedIn();

        console.log('--- Debugging Selectors ---');
        await bot.page.waitForTimeout(5000);

        // Dump all buttons to see what we have
        const buttons = bot.page.locator('button, [role="button"]');
        const count = await buttons.count();
        console.log(`Found ${count} total buttons/roles.`);

        for (let i = 0; i < Math.min(count, 20); i++) {
            const html = await buttons.nth(i).evaluate(el => el.outerHTML);
            // clean up newline for readability
            console.log(`[${i}] ${html.replace(/\s+/g, ' ').substring(0, 300)}...`);
        }

    } catch (e) {
        console.error('Debug session failed:', e);
    } finally {
        console.log('Done.');
        setTimeout(() => process.exit(0), 5000);
    }
}

debugDownload();

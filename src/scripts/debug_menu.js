
import { SunoBot } from '../core/suno.js';
import fs from 'fs';

async function debugMenuAll() {
    const bot = new SunoBot();
    try {
        await bot.initialize(false);
        await bot.ensureLoggedIn();

        console.log('--- DEBUGGING MENU (ALL BUTTONS) ---');
        await bot.page.waitForTimeout(5000);

        // Dump all buttons again, but filtering for those with SVGs
        const buttons = bot.page.locator('button:has(svg), div[role="button"]:has(svg)');
        const count = await buttons.count();
        console.log(`Found ${count} buttons/divs with SVGS.`);

        for (let i = 0; i < Math.min(count, 50); i++) {
            const el = buttons.nth(i);
            const html = await el.evaluate(e => e.outerHTML);
            const aria = await el.getAttribute('aria-label');
            const title = await el.getAttribute('title');

            // Log if it looks promising (no text, small size)
            // Or if it matches "More Actions"
            console.log(`[${i}] ARIA: "${aria}" TITLE: "${title}" \n    HTML: ${html.substring(0, 300)}...`);
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

debugMenuAll();

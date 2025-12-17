
import { SunoBot } from '../core/suno.js';

async function debugMenuContent() {
    const bot = new SunoBot();
    try {
        await bot.initialize(false);
        await bot.ensureLoggedIn();

        console.log('--- DEBUGGING MENU CONTENT ---');
        await bot.page.waitForTimeout(5000);

        const triggers = bot.page.locator('[data-context-menu-trigger="true"]');
        const count = await triggers.count();

        // Try clicking a few different ones, maybe index 0 is not a song
        const indices = [0, 1, 2];

        for (const i of indices) {
            if (i >= count) continue;
            console.log(`\nClicking trigger [${i}]...`);

            // Highlight it first if possible?
            // await triggers.nth(i).hover(); 
            await triggers.nth(i).click({ force: true });
            await bot.page.waitForTimeout(1000);

            // Look for any menu
            const menus = bot.page.locator('[role="menu"], [class*="content"]');
            // Radix menus often have role="menu"

            const menuCount = await menus.count();
            console.log(`Menus found: ${menuCount}`);

            // Dump text of visible menus
            for (let m = 0; m < menuCount; m++) {
                if (await menus.nth(m).isVisible()) {
                    console.log(`  Menu [${m}] text: "${(await menus.nth(m).innerText()).replace(/\n/g, ', ')}"`);
                }
            }

            // Also check for "Download" text globally
            const downloadCounts = await bot.page.getByText('Download').count();
            console.log(`  "Download" elements visible: ${downloadCounts}`);

            // Close menu by clicking body
            await bot.page.locator('body').click({ position: { x: 0, y: 0 } });
            await bot.page.waitForTimeout(500);
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        setTimeout(() => process.exit(0), 5000);
    }
}

debugMenuContent();

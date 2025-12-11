
import { SunoBot } from './suno_automation.js';

async function debugMenuClick() {
    const bot = new SunoBot();
    try {
        await bot.initialize(false);
        await bot.ensureLoggedIn();

        console.log('--- DEBUGGING MENU CLICK ---');
        await bot.page.waitForTimeout(5000);

        // Targeted Selector
        const menuTriggers = bot.page.locator('[data-context-menu-trigger="true"]');
        const count = await menuTriggers.count();
        console.log(`Found ${count} menu triggers.`);

        if (count > 0) {
            // Click the first one
            console.log('Clicking first menu trigger...');
            await menuTriggers.first().click();
            await bot.page.waitForTimeout(2000);

            // Check for "Download" text in the DOM now
            // Menu items usually appear in a portal layer at the end of the body
            const downloadOption = bot.page.getByText('Download', { exact: true });
            const isVisible = await downloadOption.isVisible();
            console.log(`"Download" option visible: ${isVisible}`);

            if (isVisible) {
                // Try clicking Download to see the sub-menu
                console.log('Clicking "Download"...');
                await downloadOption.click();
                await bot.page.waitForTimeout(1000);

                // Check for "MP3 Audio"
                const mp3Option = bot.page.getByText('MP3 Audio');
                const mp3Visible = await mp3Option.isVisible();
                console.log(`"MP3 Audio" option visible: ${mp3Visible}`);
            } else {
                // Maybe it's capitalized differently?
                const bodyText = await bot.page.innerText('body');
                if (bodyText.includes('Download')) {
                    console.log('Found "Download" in body text, but selector failed?');
                } else {
                    console.log('Did NOT find "Download" in body text.');
                }
            }
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        // process.exit(0);
        setTimeout(() => process.exit(0), 5000);
    }
}

debugMenuClick();

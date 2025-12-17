
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function debugMenu() {
    console.log('Launching browser for debug...');
    const browser = await chromium.launch({
        headless: false, // Need to see it
        args: ['--start-maximized']
    });

    try {
        const context = await browser.newContext({ storageState: 'auth.json' });
        const page = await context.newPage();

        console.log('Navigating to create page...');
        await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for ANY song item
        console.log('Waiting for song list...');
        // Generic selector for the row or card
        await page.waitForTimeout(5000);

        // Check for common "More" or "Menu" buttons
        console.log('Dumping all buttons...');
        const buttons = page.locator('button');
        const count = await buttons.count();
        console.log(`Found ${count} total buttons.`);

        for (let i = 0; i < Math.min(count, 20); i++) {
            const btn = buttons.nth(i);
            const label = await btn.getAttribute('aria-label').catch(() => '');
            const text = await btn.innerText().catch(() => '');
            const dataTestId = await btn.getAttribute('data-testid').catch(() => '');
            console.log(`Button ${i}: Text="${text}", Label="${label}", TestID="${dataTestId}"`);
        }

        await page.screenshot({ path: 'debug_page.png' });
        console.log('Saved screenshot to debug_page.png');

        // Strategy: Find a "Play" button, then find the menu button in the same container.
        console.log('Searching for Play buttons...');
        const playButtons = page.locator('button[aria-label^="Play"]');
        const playCount = await playButtons.count();
        console.log(`Found ${playCount} Play buttons.`);

        if (playCount > 0) {
            // Pick the first actual song play button (usually indices 0 might be main player, so check closely)
            // We want one inside a song list item.
            const firstPlay = playButtons.first();
            console.log('Inspecting first Play button...');

            // Go up to the row/card
            // We assume the song card is a parent div.
            // We can look for the common ancestor of Play and the Menu button.
            // The menu button is usually an empty button in the same container.

            // Let's get the parent of the play button
            const songCard = firstPlay.locator('xpath=./text()/parent::*'); // Hack to get parent
            // Actually, let's just scope to the row. The row usually contains the play button.
            // We can try to use near() or finding a button with correct icon in the same row.

            // Let's just look for "More actions" or similar aria-label if Play is found.
            // If the menu button has no text, maybe it has a specific aria-label like "More actions"?
            // The dump showed "null", which is annoying.

            // Let's dump the HTML of the parent of the play button to see siblings.
            const parent = firstPlay.locator('..').locator('..').locator('..'); // Go up 3 levels to be safe
            const html = await parent.innerHTML();
            // console.log('Song Card HTML snippet:', html);

            // Regex to find button props
            const hasMenuButton = html.includes('button');
            console.log('Contains buttons?', hasMenuButton);

            // Get all buttons in this container
            const siblingButtons = parent.locator('button');
            const siblingCount = await siblingButtons.count();
            console.log(`Found ${siblingCount} buttons in this song row.`);

            console.log(`Found ${siblingCount} buttons in this song row.`);

            for (let i = 0; i < siblingCount; i++) {
                const btn = siblingButtons.nth(i);
                const label = await btn.getAttribute('aria-label').catch(() => 'null');
                const html = await btn.innerHTML().catch(() => 'null');

                console.log(`\n--- Button ${i} ---`);
                console.log(`Label: ${label}`);
                console.log(`HTML: ${html.substring(0, 100)}...`); // Truncate to avoid spam

                // Heuristic: If it has "Play", skip. If it has SVG, check path.
                if (label && label.startsWith('Play')) continue;

                // If it looks like the menu (usually last one, or no text), try clicking
                if (html.includes('<svg')) {
                    console.log('Button has SVG. Attempting click...');
                    await btn.click().catch(e => console.log('Click error:', e));
                    await page.waitForTimeout(1000);

                    // Check if menu opened
                    if (await page.getByText('Download').isVisible()) {
                        console.log('✅ THIS BUTTON OPENED THE MENU!');
                        console.log(`SUCCESS INDEX: ${i}`);
                        break;
                    } else {
                        // Close potential wrong toggle (like upvote)
                        // await page.locator('body').click({position:{x:0, y:0}});
                    }
                }
            }

        } else {
            console.log('No Play buttons found. Page might not have loaded songs.');
        }

    } catch (e) {
        console.error('Debug failed:', e);
    } finally {
        console.log('Closing...');
        await browser.close();
    }
}

debugMenu();

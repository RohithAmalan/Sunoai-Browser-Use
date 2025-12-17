
import { chromium } from 'playwright';

async function debugSongRow() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: 'auth.json' });
    const page = await context.newPage();

    try {
        await page.goto('https://suno.com/create');
        await page.waitForTimeout(5000);

        const links = page.locator('a[href^="/song/"]');
        const count = await links.count();
        console.log(`Found ${count} song links.`);

        if (count > 0) {
            const link = links.first(); // Use the first actual song link
            console.log('Inspecting link:', await link.getAttribute('href'));

            let current = link;
            // Go up 6 levels to find the row
            for (let i = 1; i <= 6; i++) {
                current = current.locator('..');

                const tagName = await current.evaluate(el => el.tagName).catch(() => 'unknown');
                const classAttr = await current.getAttribute('class').catch(() => '');
                const html = await current.innerHTML();

                // Count buttons in this scope
                const btns = current.locator('button');
                const btnCount = await btns.count();

                console.log(`\n--- Level Up ${i} (${tagName}) ---`);
                console.log(`Class: ${classAttr.substring(0, 50)}...`);
                console.log(`Child Buttons: ${btnCount}`);

                if (btnCount > 0) {
                    for (let b = 0; b < Math.min(btnCount, 10); b++) {
                        const btn = btns.nth(b);
                        const label = await btn.getAttribute('aria-label') || 'null';
                        const text = await btn.innerText();
                        const innerHTML = await btn.innerHTML();
                        const hasSVG = innerHTML.includes('<svg');

                        // Skip play/pause for clarity
                        if (label.includes('Play') || label.includes('Pause')) {
                            // console.log(`   [Button ${b}] Play/Pause control`);
                            continue;
                        }

                        console.log(`   [Button ${b}] Label: "${label}", Text: "${text}", SVG: ${hasSVG}`);
                    }
                }
            }
        } else {
            console.log('No song links found.');
        }

    } catch (e) { console.error(e); }
    finally { await browser.close(); }
}

debugSongRow();

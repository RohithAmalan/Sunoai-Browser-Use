
import { chromium } from 'playwright';
import fs from 'fs';

async function debugParents() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: 'auth.json' });
    const page = await context.newPage();

    try {
        await page.goto('https://suno.com/create');
        await page.waitForTimeout(5000);

        const links = page.locator('a');
        const count = await links.count();
        console.log(`Found ${count} total links.`);

        for (let i = 0; i < Math.min(count, 20); i++) {
            console.log(`Link ${i}: ${await links.nth(i).getAttribute('href')}`);
        }

        const bodyText = await page.innerText('body');
        console.log('Body Text Snippet:', bodyText.substring(0, 500));

        let current = link;
        for (let i = 1; i <= 6; i++) {
            current = current.locator('..');
            const tagName = await current.evaluate(el => el.tagName);
            const classAttr = await current.getAttribute('class') || '';
            const html = await current.innerHTML();
            const hasButton = html.includes('<button');

            console.log(`\n--- Level Up ${i} (${tagName}.${classAttr.substring(0, 30)}...) ---`);
            console.log(`Contains Button? ${hasButton}`);
            console.log('Snippet:', html.substring(0, 150).replace(/\n/g, ' '));

            if (hasButton) {
                console.log('>>> THIS LEVEL HAS BUTTONS. Dumping buttons:');
                const btns = current.locator('button');
                const btnCount = await btns.count();
                for (let b = 0; b < Math.min(btnCount, 5); b++) {
                    const btn = btns.nth(b);
                    console.log(`   Btn ${b} Label: ${await btn.getAttribute('aria-label')}`);
                    console.log(`   Btn ${b} HTML: ${(await btn.innerHTML()).substring(0, 50)}`);
                }
            }
        }
    } catch (e) { console.error(e); }
    finally { await browser.close(); }
}

debugParents();

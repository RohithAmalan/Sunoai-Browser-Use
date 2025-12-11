
import { SunoBot } from './suno_automation.js';

async function debugSelectors() {
    const bot = new SunoBot();
    try {
        await bot.initialize(false);
        await bot.ensureLoggedIn();

        console.log('--- DEBUGGING SELECTORS ---');
        await bot.page.waitForTimeout(5000);

        // 1. Inspect Instrumental Toggle
        console.log('\n[Instrumental Toggle Analysis]');
        const instElements = bot.page.getByText('Instrumental');
        const instCount = await instElements.count();
        console.log(`Found ${instCount} elements with text "Instrumental":`);
        for (let i = 0; i < instCount; i++) {
            const el = instElements.nth(i);
            const html = await el.evaluate(e => e.outerHTML);
            const visible = await el.isVisible();
            console.log(`  [${i}] Visible: ${visible} | HTML: ${html}`);

            // Try to find a parent button or switch
            const parent = await el.locator('..').evaluate(e => e.outerHTML).catch(() => 'No parent');
            console.log(`      Parent: ${parent.substring(0, 150)}...`);
        }

        // Also look for specific switches/checkboxes
        const switches = bot.page.locator('[role="switch"], input[type="checkbox"]');
        const switchCount = await switches.count();
        console.log(`\nFound ${switchCount} switches/checkboxes:`);
        for (let i = 0; i < switchCount; i++) {
            const el = switches.nth(i);
            const html = await el.evaluate(e => e.outerHTML);
            const label = await el.textContent().catch(() => '');
            // Check aria-label
            const aria = await el.getAttribute('aria-label');
            console.log(`  [${i}] ARIA: "${aria}" | Label: "${label}" | HTML: ${html.substring(0, 150)}...`);
        }

        // 2. Inspect Menu Triggers (Is Version Button included?)
        console.log('\n[Menu Trigger Analysis]');
        const triggers = bot.page.locator('[data-context-menu-trigger="true"]');
        const trigCount = await triggers.count();
        console.log(`Found ${trigCount} triggers.`);

        for (let i = 0; i < trigCount; i++) {
            const el = triggers.nth(i);
            // Get screen position to guess if it's the version button (usually top leftish)
            const box = await el.boundingBox();
            const html = await el.evaluate(e => e.outerHTML);
            const text = await el.textContent();

            console.log(`  [${i}] Text: "${text}" | Box: x=${box?.x}, y=${box?.y} | HTML: ${html.substring(0, 150)}...`);
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        setTimeout(() => process.exit(0), 5000);
    }
}

debugSelectors();

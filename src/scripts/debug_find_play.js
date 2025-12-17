
import { SunoBot } from '../core/suno.js';

async function findSongRow() {
    const bot = new SunoBot();
    try {
        await bot.initialize(false);
        await bot.ensureLoggedIn();

        console.log('--- FINDING SONG ROW ---');
        await bot.page.waitForTimeout(5000);

        // dump all text to see what is visible
        // console.log(await bot.page.innerText('body'));

        // Look for typical song elements
        // The most reliable anchor is the song list container or the song title.
        // Let's look for ANY text that isn't UI text.
        // Or look for the specific "Play" SVG path if we knew it to be constant.

        // Let's try locating by "Play" text hidden in a tooltip?

        // New Strategy: Locate all SVGs, filter for those that look like Play icons (triangle)
        // A play icon usually has a path d starting with "M" and having 3-4 points.
        // But that's hard.

        // Let's look for the main list.
        const songList = bot.page.locator('div[role="grid"]'); // Many react apps use grid
        if (await songList.count() > 0) {
            console.log('Found grid!');
        }

        // Let's look for "time" stamps like "0:" or "1:" etc.
        const times = bot.page.getByText(/\d:\d\d/);
        const timeCount = await times.count();
        console.log(`Found time stamps: ${timeCount}`);

        if (timeCount > 0) {
            const firstTime = times.first();
            console.log('Time stamp HTML:', await firstTime.evaluate(el => el.outerHTML));
            // The play button is usually a sibling or cousin of the time stamp.
        }

        // Dump everything that looks like a button inside the main area
        // We'll define main area as central part of screen
        const buttons = bot.page.locator('div[role="button"], button');
        for (let i = 0; i < await buttons.count(); i++) {
            const b = buttons.nth(i);
            const aria = await b.getAttribute('aria-label');
            if (aria && aria.toLowerCase().includes('play')) {
                console.log(`Found aria-label Play: ${aria}`);
                console.log(await b.evaluate(el => el.outerHTML));
            }
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

findSongRow();

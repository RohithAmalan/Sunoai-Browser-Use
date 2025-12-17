import { chromium } from 'playwright';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SunoBot {
    constructor(storageStatePath = '../../data/auth.json') {
        this.storageStatePath = path.resolve(__dirname, storageStatePath);
        this.browser = null;
        this.context = null;
        this.page = null;
    }

    async initialize(headless = false) {
        // console.error('Launching browser...');
        this.browser = await chromium.launch({
            headless: headless,
            channel: 'chrome',
            args: [
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--start-maximized'
            ],
            ignoreDefaultArgs: ['--enable-automation'],
            ignoreHTTPSErrors: true
        });

        let contextOptions = { ignoreHTTPSErrors: true };
        if (fs.existsSync(this.storageStatePath)) {
            // console.error('Found existing session, loading...');
            contextOptions.storageState = this.storageStatePath;
        }

        this.context = await this.browser.newContext(contextOptions);
        this.page = await this.context.newPage();
    }

    async ensureLoggedIn() {
        // console.error('Navigating to Suno Create page...');
        try {
            await this.page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e) {
            console.warn(`Navigation error: ${e.message}`);
        }

        try {
            // console.error('Checking login status...');
            let loggedIn = false;

            for (let i = 0; i < 60; i++) {
                if (this.page.isClosed()) throw new Error('Browser closed by user.');

                const url = this.page.url();
                if (url.includes('/create')) {
                    // Check for common elements
                    const descLabel = this.page.getByText('Song Description');
                    const profileIcon = this.page.locator('button[data-testid="profile-menu"]');
                    const anywhereInput = this.page.locator('textarea, [contenteditable="true"]');

                    if (await descLabel.isVisible() || await profileIcon.count() > 0 || await anywhereInput.count() > 0) {
                        loggedIn = true;
                        // console.error('Login confirmed!');
                        break;
                    }
                }

                if (this.browser._options?.headless && i === 2) {
                    console.warn('\n⚠️ WARNING: Headless mode detected. Login might be invisible.\n');
                }

                await this.page.waitForTimeout(5000);
            }

            if (!loggedIn) throw new Error('Login timeout.');

            await this.context.storageState({ path: this.storageStatePath });
            // // console.error(`Session saved.`);

        } catch (e) {
            // console.error('Login check failed:', e.message);
            throw e;
        }
    }

    async generateSong(prompt, instrumental = false, customDownloadDir = null, wait = true) {
        if (!prompt) throw new Error('Prompt is required');

        // console.log(`Entering prompt: "${prompt}"`);

        try {
            // 1. LOCATE THE INPUT (Robust Strategy)
            // It could be a textarea OR a contenteditable div
            let inputElement = null;

            // Strategy A: Try Placeholder (Most reliable for Suno)
            try {
                const placeholderInput = this.page.getByPlaceholder('Song Description', { exact: false });
                if (await placeholderInput.count() > 0 && await placeholderInput.first().isVisible()) {
                    inputElement = placeholderInput.first();
                    // console.error('  Found input by placeholder.');
                }
            } catch (e) { }

            // Strategy B: contenteditable (div/p) or textbox role
            if (!inputElement) {
                const editable = this.page.locator('div[contenteditable="true"], div[role="textbox"], span[contenteditable="true"]');
                if (await editable.count() > 0) {
                    // Filter for visible ones
                    for (const el of await editable.all()) {
                        if (await el.isVisible()) {
                            inputElement = el;
                            // console.error('  Found input by contenteditable/role.');
                            break;
                        }
                    }
                }
            }

            // Strategy C: Visible Textarea (Backup)
            if (!inputElement) {
                const textareas = this.page.locator('textarea:visible');
                if (await textareas.count() > 0) {
                    inputElement = textareas.first();
                    // console.error('  Found input by textarea tag.');
                }
            }

            // Strategy C: Label (Careful validation needed)
            if (!inputElement) {
                try {
                    const labeledInput = this.page.getByLabel('Song Description');
                    if (await labeledInput.isVisible()) {
                        // Validate it's not a button (Suno has a "Generate random" button with this label sometimes)
                        const tagName = await labeledInput.evaluate(el => el.tagName.toLowerCase());
                        const isEditable = await labeledInput.evaluate(el => el.isContentEditable || ['textarea', 'input'].includes(el.tagName.toLowerCase()));

                        if (isEditable && tagName !== 'button') {
                            inputElement = labeledInput;
                            // console.error('  Found input by label.');
                        } else {
                            // console.error('  Skipping label match (it was a button or non-editable).');
                        }
                    }
                } catch (e) { }
            }

            if (!inputElement) throw new Error('Could not find prompts input (textarea/Song Description)');

            // 2. FILL THE INPUT (Pure Keyboard Strategy)
            // This automates the "manual human filling process" exactly
            // console.error('  Focusing input...');
            await inputElement.click();
            await this.page.waitForTimeout(500);

            // Select All and Delete (Cmd+A / Ctrl+A -> Backspace)
            const isMac = process.platform === 'darwin';
            const modifier = isMac ? 'Meta' : 'Control';

            // console.error(`  Clearing text using ${modifier}+A...`);
            await this.page.keyboard.press(`${modifier}+A`);
            await this.page.waitForTimeout(200);
            await this.page.keyboard.press('Backspace');
            await this.page.waitForTimeout(200);

            // Type the prompt exactly like a human
            // console.error(`  Typing prompt: "${prompt}"...`);
            await this.page.keyboard.type(prompt, { delay: 50 }); // 50ms per key
            await this.page.waitForTimeout(1000);

            // Verify content
            const finalVal = await inputElement.inputValue().catch(() => inputElement.textContent());
            console.error(`  Verifying input: "${finalVal ? finalVal.substring(0, 20) : 'EMPTY'}..."`);

            // Fallback if keyboard failed (rare)
            if (!finalVal || !finalVal.includes(prompt.substring(0, 3))) {
                console.warn('  ⚠️ Keyboard typing ineffective. Trying fallback fill...');
                await inputElement.fill(prompt);
            }

            // Click outside to blur/validate
            await this.page.locator('body').click({ position: { x: 0, y: 0 } });
            await this.page.waitForTimeout(1000);

            // 3. INSTRUMENTAL
            // We ensure the state matches the request using aria-labels
            try {
                const enableBtn = this.page.locator('button[aria-label="Enable instrumental mode"]');
                const disableBtn = this.page.locator('button[aria-label="Disable instrumental mode"]');
                // (Note: Suno's label might be slightly different, but usually they toggle labels or use aria-pressed)
                // If we can't find specific labels, we might rely on state checking. 
                // But for now, assuming "Enable" exists when off is safe based on previous observation.

                if (instrumental) {
                    if (await enableBtn.count() > 0 && await enableBtn.isVisible()) {
                        // console.error('  Switching Instrumental ON...');
                        await enableBtn.click();
                    }
                    // else: it effectively means it's already ON or checking failed.
                } else {
                    // We want it OFF.
                    // If we see a "Disable" button, click it to turn off.
                    if (await disableBtn.count() > 0 && await disableBtn.isVisible()) {
                        // console.error('  Switching Instrumental OFF...');
                        await disableBtn.click();
                    }
                    // Also check if the "Enable" button has a pressed state?
                    // Safe cleanup: just ensure we didn't leave it on from previous run.
                }
            } catch (e) { console.error('Instrumental toggle warning:', e.message); }

            // CHECK FOR CREDITS
            const limitMsg = this.page.getByText('Out of Credits', { exact: false });
            const zeroCredits = this.page.getByText('0 credits left', { exact: false });

            if (await limitMsg.isVisible() || await zeroCredits.isVisible()) {
                throw new Error('TERM_LIMIT_EXCEEDED: You have run out of credits on Suno.');
            }

            // 4. CLICK CREATE & CAPTURE STATE

            // Capture existing song IDs BEFORE clicking Create
            const preCreateLinks = this.page.locator('a[href^="/song/"]');
            const preCount = await preCreateLinks.count();
            const existingIds = new Set();
            for (let i = 0; i < Math.min(preCount, 20); i++) {
                const href = await preCreateLinks.nth(i).getAttribute('href');
                if (href) existingIds.add(href.split('/').pop());
            }
            // console.error(`  Captured ${existingIds.size} existing songs.`);

            // console.error('Clicking Create...');
            const createBtn = this.page.locator('button').filter({ hasText: /^Create$/ }).first();

            // Wait for it to enable
            try {
                await createBtn.waitFor({ state: 'visible', timeout: 5000 });
            } catch (e) { }

            // Log button state for debugging
            const isDisabled = await createBtn.getAttribute('disabled') !== null;

            if (!isDisabled) {
                await createBtn.click();
            } else {
                // console.error('⚠️ Create button disabled. Attempting force click...');
                await createBtn.click({ force: true });
            }

            // console.error('⏳ Waiting for NEW songs to appear in list...');

            // Define the polling function
            const pollForDownloads = async () => {
                let songsDownloaded = 0;
                const maxAttempts = 60; // 60 * 5s = 5 mins
                const processedIds = new Set();
                const downloadedPaths = [];

                const downloadDir = customDownloadDir || path.resolve(process.cwd(), 'downloads');
                if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

                // Loop to wait for new songs
                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    if (songsDownloaded >= 2) break;

                    try {
                        // Scan for new songs
                        const currentLinks = this.page.locator('a[href^="/song/"]');
                        const linkCount = await currentLinks.count();

                        // Inspect top 4 items
                        for (let i = 0; i < Math.min(linkCount, 4); i++) {
                            if (songsDownloaded >= 2) break;

                            const link = currentLinks.nth(i);
                            const href = await link.getAttribute('href');
                            if (!href) continue;

                            const songId = href.split('/').pop();

                            // CRITICAL CHECK: Is this a NEW song?
                            if (existingIds.has(songId)) {
                                // This is an old song, ignore it.
                                // Since new songs appear at the top, if we see an old song at index 0, 
                                // it means new songs haven't appeared yet.
                                continue;
                            }

                            // It is a NEW song!
                            if (processedIds.has(songId)) continue; // Already handled this new one

                            // console.error(`    🆕 New Song Detected: ${songId}`);

                            // Find the card/menu button using robust selector
                            let card = link.locator('xpath=./ancestor::div[contains(@class, "clip-row")]').first();
                            if (await card.count() === 0) card = link.locator('xpath=../../../../../..');

                            const buttons = card.locator('button');
                            const btnCount = await buttons.count();

                            let menuBtn = null;
                            if (btnCount > 0) {
                                for (let b = btnCount - 1; b >= 0; b--) {
                                    const btn = buttons.nth(b);
                                    const txt = await btn.innerText();
                                    const h = await btn.innerHTML();
                                    if (txt.trim() === '' && h.includes('<svg')) {
                                        menuBtn = btn;
                                        break;
                                    }
                                }
                            }

                            if (menuBtn) {
                                // Try to download
                                const result = await this.downloadSongViaMenu(menuBtn, i, downloadDir);
                                if (result) {
                                    // console.error(`    ✅ Downloaded NEW song (${songId})`);
                                    songsDownloaded++;
                                    processedIds.add(songId);
                                    downloadedPaths.push(result); // Result is the path
                                } else {
                                    // Failure might mean "Generation not ready". 
                                    // The download function usually closes menu on fail.
                                    // We will retry next loop iteration.
                                    // console.error(`    ⏳ Song ${songId} not ready (or menu failed). Retrying...`);
                                }
                            }
                        }
                    } catch (pollErr) { console.error('Poll error', pollErr); }

                    // if we haven't found new songs yet, let's wait a bit
                    await this.page.waitForTimeout(5000);
                }

                if (songsDownloaded < 2) {
                    console.warn(`⚠️ Timed out. Only downloaded ${songsDownloaded}/2 songs.`);
                } else {
                    // console.error(`✅ Successfully generated and downloaded all songs.`);
                }
                return downloadedPaths;
            };

            if (wait) {
                const paths = await pollForDownloads();
                return { success: true, message: "Generation and download complete.", paths: paths };
            } else {
                // Background mode: Fire and forget (but catch errors to prevent crashing)
                pollForDownloads().catch(e => console.error('Background polling validation failed:', e));
                return { success: true, message: "Generation started in background. Please check list_songs in a few minutes." };
            }

        } catch (e) {
            // console.error('Generation process failed:', e);
            return { success: false, error: e.message };
        }
    }

    async downloadRecentSongs(count = 50, customDownloadDir = null) {
        // console.log(`Downloading ${count} songs via Hub/Link Strategy...`);
        const downloadDir = customDownloadDir || path.resolve(process.cwd(), 'downloads');
        if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

        await this.page.waitForTimeout(3000);

        // 1. Find all Song Links to identify rows
        // Songs usually have a link to /song/id
        const songLinks = this.page.locator('a[href^="/song/"]');
        let linkCount = await songLinks.count();
        // console.error(`Found ${linkCount} song links.`);

        // If no links found, try the old trigger method as backup
        if (linkCount === 0) {
            // console.error('⚠️ No song links found. Falling back to context menu trigger...');
            // ... (keep old logic or just fail gracefully)
        }

        let songsDownloaded = 0;
        const processedIds = new Set();

        for (let i = 0; i < linkCount; i++) {
            if (songsDownloaded >= count) break;

            const link = songLinks.nth(i);
            const href = await link.getAttribute('href');

            // Avoid processing same song twice (title and cover might both link)
            const songId = href.split('/').pop();
            if (processedIds.has(songId)) continue;
            processedIds.add(songId);

            // console.error(`Processing Song ID: ${songId}...`);

            // Find the Row/Card container
            // We go up 4-5 levels to find the container that holds both the link and the menu button.
            // Heuristic: The row usually has class "flex" or "grid".
            // We can look for a "More actions" button in the vicinity.

            // Access the common parent container
            // Debugging showed the row is ~6 levels up and has class 'clip-row'
            let card = link.locator('xpath=./ancestor::div[contains(@class, "clip-row")]').first();

            // Fallback if class name changes: Go 6 levels up
            if (await card.count() === 0) {
                // // console.error('  ⚠️ "clip-row" not found, using generic 6-level ancestor...');
                card = link.locator('xpath=../../../../../..');
            }

            const cardCount = await card.count();
            // // console.error(`  Card count: ${cardCount}`);

            if (cardCount === 0) {
                // console.error('  ⚠️ Could not determine song card container.');
                continue;
            }

            // Find the menu button within this card
            const buttons = card.locator('button');
            const btnCount = await buttons.count();
            // // console.error(`  Card found. Buttons in card: ${btnCount}`);

            let menuBtn = null;

            // The menu button is typically the last one (Three dots)
            // We scan backwards or pick the last button that looks like a menu (icon w/o text)
            if (btnCount > 0) {
                // Try simple heuristic: Last button with SVG and no text
                for (let b = btnCount - 1; b >= 0; b--) {
                    const btn = buttons.nth(b);
                    const txt = await btn.innerText();
                    const h = await btn.innerHTML();

                    if (txt.trim() === '' && h.includes('<svg')) {
                        menuBtn = btn;
                        break;
                    }
                }
            }

            if (menuBtn) {
                // console.error('  Invoking menu click...');
                const success = await this.downloadSongViaMenu(menuBtn, songsDownloaded, downloadDir);
                if (success) {
                    // console.error('  ✅ Success!');
                    songsDownloaded++;
                    await this.page.waitForTimeout(1000);
                } else {
                    // console.error('  ❌ Failed to download via menu.');
                }
            } else {
                // console.error('  ⚠️ Could not find menu button for this song (checked ' + btnCount + ' buttons).');
            }
        }

        // console.error(`Process Complete. Downloaded ${songsDownloaded} songs.`);
    }

    async downloadSongViaMenu(triggerLocator, index, downloadDir) {
        try {
            if (!await triggerLocator.isVisible()) return false;

            // 1. Click the Menu button
            // // console.error('  Clicking menu...');
            await triggerLocator.click();

            // 2. Wait for Menu Content "Download"
            // It might be in a portal (at root body), so we search globally
            const downloadOption = this.page.getByRole('menuitem', { name: 'Download' }).or(this.page.getByText('Download', { exact: true }));

            try {
                await downloadOption.first().waitFor({ state: 'visible', timeout: 3000 });
            } catch (e) {
                // Not a menu or wrong button?
                // // console.error('  ❌ Download option not found. Closing menu.');
                await this.page.locator('body').click({ position: { x: 0, y: 0 } }); // Close
                return false;
            }

            // 3. Click Download
            await downloadOption.first().click();

            // 4. Look for "MP3 Audio" or generic "Audio"
            const mp3Option = this.page.getByText('MP3 Audio').last();
            const genericAudio = this.page.getByText('Audio').filter({ hasNotText: 'Video' }).last();

            let finalOption = null;
            if (await mp3Option.isVisible()) finalOption = mp3Option;
            else if (await genericAudio.isVisible()) finalOption = genericAudio;

            if (finalOption) {
                // Setup download wait
                const downloadPromise = this.page.waitForEvent('download', { timeout: 15000 }).catch(() => null);

                await finalOption.click();

                // 5. Handle potential "Commercial Rights" popup
                // Look for "Download Anyway" button
                const popupBtn = this.page.getByRole('button', { name: 'Download Anyway' });
                try {
                    await popupBtn.waitFor({ state: 'visible', timeout: 2000 });
                    if (await popupBtn.isVisible()) {
                        // console.error('  ⚠️ Handling Commercial Rights popup...');
                        await popupBtn.click();
                    }
                } catch (e) { }

                // 6. Wait for file
                const download = await downloadPromise;
                if (download) {
                    const suggestName = download.suggestedFilename();
                    const cleanName = suggestName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                    const savePath = path.join(downloadDir, cleanName);

                    await download.saveAs(savePath);
                    // console.error(`  ✅ Downloaded: ${cleanName}`);

                    // Cleanup: Close menu if stuck open (clicking body)
                    await this.page.locator('body').click({ position: { x: 0, y: 0 } });
                    return savePath; // Return the PATH
                } else {
                    // console.error('  ❌ Download timed out.');
                }
            } else {
                // console.error('  ❌ MP3/Audio option not found in submenu.');
            }

            // Cleanup
            await this.page.locator('body').click({ position: { x: 0, y: 0 } });
            return null;

        } catch (e) {
            // console.error(`  ❌ Error on item ${index}: ${e.message}`);
            await this.page.locator('body').click({ position: { x: 0, y: 0 } });
            return null;
        }
    }

    async close() {
        if (this.browser) {
            await this.context.storageState({ path: this.storageStatePath });
            await this.browser.close();
        }
    }
}

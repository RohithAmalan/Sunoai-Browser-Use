
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

export class SunoBot {
    constructor(storageStatePath = 'auth.json') {
        this.storageStatePath = path.resolve(storageStatePath);
        this.browser = null;
        this.context = null;
        this.page = null;
    }

    async initialize(headless = false) {
        console.log('Launching browser...');
        this.browser = await chromium.launch({
            headless: headless,
            channel: 'chrome', // Try to use the installed Google Chrome
            args: [
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled', // Mask automation
                '--start-maximized'
            ],
            ignoreDefaultArgs: ['--enable-automation'] // Hide "Chrome is being controlled by automated software"
        });

        let contextOptions = {};
        if (fs.existsSync(this.storageStatePath)) {
            console.log('Found existing session, loading...');
            contextOptions.storageState = this.storageStatePath;
        }

        this.context = await this.browser.newContext(contextOptions);
        this.page = await this.context.newPage();

        // Save storage state on close or periodically if possible, 
        // but definitely after login success is detected.
    }

    async ensureLoggedIn() {
        console.log('Navigating to Suno Create page...');
        await this.page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded' });

        try {
            console.log('Checking login status...');

            // Wait for the prompt input to appear. 
            // We loop this to provide feedback to the user.
            const promptSelector = 'textarea, [contenteditable="true"]';
            let loggedIn = false;

            // Check for 5 minutes (300 seconds)
            for (let i = 0; i < 60; i++) {
                try {
                    // Check if we are on the create page
                    if (this.page.url().includes('/create')) {
                        // Check for "Song Description" text which indicates the form is loaded
                        const descriptionLabel = this.page.getByText('Song Description');
                        if (await descriptionLabel.isVisible()) {
                            loggedIn = true;
                            console.log('Detected "Song Description" label - Login confirmed!');
                            break;
                        }

                        // Fallback to searching for a textarea
                        const textarea = this.page.locator('textarea');
                        if (await textarea.count() > 0) {
                            loggedIn = true;
                            console.log('Detected textarea - Login confirmed!');
                            break;
                        }
                    }

                    // Wait a bit before retrying
                    await this.page.waitForTimeout(5000);

                } catch (e) {
                    console.log(`Waiting for login... (${(i + 1) * 5}/300s) - Please log in manually.`);
                    await this.page.waitForTimeout(5000);
                }
            }

            if (!loggedIn) {
                throw new Error('Login timeout. Please try again.');
            }

            console.log('Logged in successfully!');
            console.log('Saving session state...');
            await this.context.storageState({ path: this.storageStatePath });
            console.log(`Session saved to ${this.storageStatePath}`);

        } catch (e) {
            console.error('Login failed or timed out:', e.message);
            throw e;
        }
    }

    async generateSong(prompt, instrumental = false) {
        if (!prompt) {
            throw new Error('Prompt is required');
        }

        console.log(`Entering prompt: "${prompt}"`);

        // Selectors (Updating these based on typical Suno structure, but may need adjustment if site changes)
        // The main prompt area is usually a textarea.
        // We specifically want the VISIBLE textarea to avoid interacting with hidden ones (e.g. from other tabs/modes)
        const promptSelector = 'textarea:visible';

        // Wait for it to be ready
        const promptInput = this.page.locator(promptSelector).first();
        await promptInput.waitFor({ state: 'visible', timeout: 10000 });

        await promptInput.fill(prompt);

        // If instrumental, find the toggle. 
        if (instrumental) {
            console.log('Selecting Instrumental...');
            try {
                // Try to find the switch or button. 
                // Based on screenshot, it might be a button with text "Instrumental"
                // We need to check if it's already active to avoid toggling it OFF.
                const instrumentalBtn = this.page.getByText('Instrumental', { exact: true });
                if (await instrumentalBtn.isVisible()) {
                    await instrumentalBtn.click();
                } else {
                    console.warn('Instrumental element not visible.');
                }
            } catch (e) {
                console.warn('Could not set Instrumental:', e.message);
            }
        }

        console.log('Clicking Create button...');
        try {
            // Wait for the button to be potentially enabled
            await this.page.waitForTimeout(1000);

            // Try to find the specific yellow/primary create button.
            // We use a broad text match restricted to visible buttons.
            const createBtn = this.page.locator('button')
                .filter({ hasText: /Create|Generate/i })
                .filter({ hasNotText: /Custom/i }) // Avoid "Custom Mode" toggle if exists
                .locator('visible=true')
                .last(); // Usually the main action is at the bottom or later in DOM

            await createBtn.waitFor({ state: 'visible', timeout: 5000 });

            // Check if it's disabled (e.g. empty prompt)
            if (await createBtn.isDisabled()) {
                console.log('Create button is disabled. Checking prompt...');
                // Maybe prompt didn't stick?
                await promptInput.press('Space');
                await promptInput.press('Backspace');
                await this.page.waitForTimeout(500);
            }

            await createBtn.click();

        } catch (e) {
            console.log('Primary Create button click failed, searching generic buttons...');
            // Fallback: Click any visible button that says "Create" exactly
            await this.page.locator('button:text-is("Create"):visible').click();
        }

        console.log('Create clicked. Waiting for generation to start...');

        // Wait for the new item to appear
        console.log('Waiting for new song to register...');
        await this.page.waitForTimeout(10000); // Wait for potential list refresh

        try {
            // Broad selector for the most recent song item (assuming top of list)
            // We look for a "Play" button which indicates a playable track, or "Generating" text.

            console.log('Monitoring generation status (this may take 1-2 minutes)...');

            let audioSrc = null;
            let title = 'generated_song';

            // Poll for up to 5 minutes
            for (let i = 0; i < 60; i++) {
                // Look for audio elements
                const audios = await this.page.locator('audio').all();

                // Strategy: Find the first audio element that has a valid HTTPS src (not blob/empty).
                // Suno often initializes with blobs or no src. 
                // We also want to ensure the "Generating" state is gone.
                // We'll trust the presence of a valid CDN URL as completion.

                for (const audio of audios) {
                    const src = await audio.getAttribute('src');
                    // Check for valid CDN url (usually cdn1.suno.ai)
                    // FILTER OUT VALID-LOOKING BUT PLACEHOLDER FILES like "sil-100.mp3" (silence)
                    if (src && src.includes('http') && !src.includes('blob:') && !src.includes('sil-100')) {
                        audioSrc = src;
                        console.log('Found valid audio source:', src);
                        break;
                    }
                }

                if (audioSrc) {
                    // Start downloading
                    break;
                }

                console.log(`Waiting for actual audio content... (${(i + 1) * 5}s)`);
                await this.page.waitForTimeout(5000);
            }

            if (!audioSrc) {
                console.log('Timed out waiting for audio URL. Song might still be generating or failed.');
                return {
                    timestamp: new Date().toISOString(),
                    prompt: prompt,
                    status: 'Timeout waiting for audio'
                };
            }

            // Clean up title
            title = prompt.slice(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();

            // Download the file
            console.log(`Downloading audio from ${audioSrc}...`);
            const response = await this.context.request.get(audioSrc);
            const buffer = await response.body();

            // Save to 'downloads' folder
            const downloadDir = path.join(process.cwd(), 'downloads');
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir);
            }

            const fileName = `${title}_${Date.now()}.mp3`;
            const filePath = path.join(downloadDir, fileName);

            fs.writeFileSync(filePath, buffer);
            console.log(`Audio saved to: ${filePath}`);

            return {
                timestamp: new Date().toISOString(),
                prompt: prompt,
                status: 'Completed',
                file: filePath
            };

        } catch (e) {
            console.warn('Error during download process:', e.message);
            return {
                timestamp: new Date().toISOString(),
                prompt: prompt,
                status: 'Error: ' + e.message
            };
        }
    }
    async close() {
        if (this.browser) {
            await this.context.storageState({ path: this.storageStatePath }); // Save state one last time
            await this.browser.close();
        }
    }
}

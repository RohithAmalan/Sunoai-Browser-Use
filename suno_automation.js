
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
            // Strategy 1: The "Create" button at the bottom of the form
            // It often has a specific class or ID, but text is best.
            // We'll try specific role first.
            const createBtn = this.page.getByRole('button', { name: /^Create$/i }).first();

            if (await createBtn.isVisible()) {
                await createBtn.click();
            } else {
                throw new Error('Role button not found');
            }

        } catch (e) {
            console.log('Primary button strategy failed. Trying alternatives...');
            try {
                // Strategy 2: Click the visible text "Create" that acts as a button
                // This catches divs/spans with onClick handlers
                const createText = this.page.locator(':text-matches("^Create$", "i")')
                    .locator('visible=true')
                    .last(); // Often the last one is the main action
                await createText.click({ timeout: 3000 });
            } catch (e2) {
                console.log('Text click failed. Trying Enter key in prompt...');
                // Strategy 3: Press Enter in the prompt textarea (often submits)
                const promptSelector = 'textarea:visible';
                await this.page.locator(promptSelector).first().press('Enter');
            }
        }

        console.log('Create clicked. Waiting for generation to start...');

        // Wait for the new item to appear
        console.log('Waiting for new song to register...');
        await this.page.waitForTimeout(10000); // Wait for potential list refresh

        try {
            // Broad selector for the most recent song item (assuming top of list)
            // We look for a "Play" button which indicates a playable track, or "Generating" text.

            // NEW STRATEGY: Network Response Interception
            // Instead of fighting the UI menus, we will listen for the audio file being fetched by the browser.
            // When we click "Play", the browser requests the MP3/WAV from the CDN. We catch that.

            console.log('Monitoring network traffic for audio');

            let downloadPromiseResolve;
            const downloadPromise = new Promise(resolve => downloadPromiseResolve = resolve);

            // Set up listener for MP3/WAV responses
            const responseHandler = async (response) => {
                const url = response.url();
                const headers = response.headers();
                const contentType = headers['content-type'] || '';

                // Debug log to see what's happening
                // if (url.includes('.mp3') || contentType.includes('audio')) console.log(`Traffic: ${url} [${contentType}]`);

                // Check if it's an audio file from Suno's CDN
                // We accept .mp3 extension OR audio/mpeg content type
                // We exclude silence and tiny chunks if possible
                if ((url.includes('.mp3') || contentType.includes('audio/mpeg') || contentType.includes('audio/wav')) && !url.includes('sil-100')) {
                    console.log(`\nIntercepted candidate audio URL: ${url}`);
                    downloadPromiseResolve(url); // Just resolve with URL, don't read body yet
                }
            };

            this.page.on('response', responseHandler);

            // Trigger Loop: Click Play periodically to force the request
            const startTime = Date.now();
            const timeout = 300000; // 5 mins

            let capturedUrl = null;
            let title = 'generated_song'; // Define title here for scope

            while (Date.now() - startTime < timeout) {
                // Check if our promise resolved (we found a file)
                const raceResult = await Promise.race([
                    downloadPromise,
                    new Promise(r => setTimeout(r, 2000)) // 2s tick
                ]);

                if (raceResult && typeof raceResult === 'string') {
                    capturedUrl = raceResult;
                    break;
                }

                // If not found yet, try clicking Play on the first item
                try {
                    // Try generic play button or specific ones
                    // Suno often has a big play button or list play buttons.
                    const firstPlayBtn = this.page.locator('button[aria-label="Play"], button[title="Play"], [data-testid="play-button"]').first();
                    if (await firstPlayBtn.isVisible()) {
                        await firstPlayBtn.click({ timeout: 1000 }).catch(() => { });
                    }
                } catch (e) { }

                // Feedback
                const generatingLabel = this.page.getByText('Generating...', { exact: false }).first();
                if (await generatingLabel.isVisible()) {
                    if ((Date.now() - startTime) % 10000 < 2000) console.log('Song is still generating...');
                } else {
                    if ((Date.now() - startTime) % 5000 < 1000) process.stdout.write('.');
                }

                await this.page.waitForTimeout(1000);
            }

            // cleanup listener
            this.page.removeListener('response', responseHandler);

            if (capturedUrl) {
                console.log(`\nDownloading captured URL: ${capturedUrl}...`);

                const downloadDir = path.join(process.cwd(), 'downloads');
                if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

                title = prompt.slice(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const fileName = `${title}_${Date.now()}.mp3`;
                const filePath = path.join(downloadDir, fileName);

                // Perform separate download request
                const response = await this.context.request.get(capturedUrl);
                const buffer = await response.body();

                fs.writeFileSync(filePath, buffer);
                console.log(`Audio saved to: ${filePath}`);

                return {
                    timestamp: new Date().toISOString(),
                    prompt: prompt,
                    status: 'Completed',
                    file: filePath
                };
            } else {
                console.log('\nTimed out waiting for audio network request.');
                return {
                    timestamp: new Date().toISOString(),
                    prompt: prompt,
                    status: 'Timeout waiting for audio network request'
                };
            }

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

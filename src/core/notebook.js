
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES Module Shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class NotebookBot {
    constructor(storageStatePath) {
        // Use absolute path for auth storage
        if (!storageStatePath) {
            this.storageStatePath = path.resolve(__dirname, '../../data/auth_notebook.json');
        } else {
            this.storageStatePath = path.resolve(storageStatePath);
        }

        this.browser = null;
        this.context = null;
        this.page = null;
        this.activeNotebookUrl = null;
    }

    async initialize(headless = false) {
        // console.log(`[NotebookBot] Launching browser (Headless: ${headless})...`);

        this.browser = await chromium.launch({
            headless: headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled', // Help bypass detection
            ]
        });

        // Check for existing auth state
        if (fs.existsSync(this.storageStatePath)) {
            // console.log('[NotebookBot] Loading session...');
            this.context = await this.browser.newContext({ storageState: this.storageStatePath });
        } else {
            // console.log('[NotebookBot] No session found. Starting fresh context.');
            this.context = await this.browser.newContext();
        }

        this.page = await this.context.newPage();

        // Stealth modifications
        await this.page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
    }

    async ensureLoggedIn() {
        if (!this.page) throw new Error('Browser not initialized');

        // Check if we are already on NotebookLLM. If so, don't reload/navigate away, 
        // as that might kick us out of a specific notebook.
        const currentUrl = this.page.url();
        if (!currentUrl.includes('notebooklm.google.com')) {
            console.log('[NotebookBot] Navigating to NotebookLLM...');
            try {
                await this.page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch (e) {
                console.log('[NotebookBot] Navigation warning (might be okay if redirected):', e.message);
            }
        } else {
            console.log('[NotebookBot] Already on NotebookLLM. Preserving current page.');
        }

        console.log('[NotebookBot] Checking login state...');
        await this.page.waitForTimeout(2000);

        // Check for login indicators
        const isLoginLink = await this.page.getByRole('link', { name: /Sign in|Login/i }).count() > 0;
        const isLoginBtn = await this.page.getByRole('button', { name: /Sign in/i }).count() > 0;
        const isGoogleUrl = this.page.url().includes('accounts.google.com');

        console.log(`[NotebookBot] State: URL=${this.page.url()} LoginLink=${isLoginLink} LoginBtn=${isLoginBtn} GoogleURL=${isGoogleUrl}`);

        if (isGoogleUrl || isLoginLink || isLoginBtn) {
            console.log('[NotebookBot] ⚠️ Not logged in. Please log in manually in the browser window.');

            // Wait indefinitely for user to login if visible, or fail if headless
            // If headless, we can't login manually.
            try {
                // Determine if we are truly headless or if user can see it.
                // For this implementation, we assume ensureLoggedIn is called in Headful mode first.
                // We'll wait until we see the "Create new" button or specific dashboard element.
                await this.page.waitForSelector('button:has-text("Create new"), div[role="button"]:has-text("Create new")', { timeout: 0 }); // Wait forever for manual login

                // Save state after login
                await this.context.storageState({ path: this.storageStatePath });
                console.log('[NotebookBot] Login detected! Session saved.');
            } catch (e) {
                throw new Error('Login failed or timed out.');
            }
        }
    }

    async createNotebook(title) {
        console.log(`[NotebookBot] Creating notebook: "${title}"`);
        await this.ensureLoggedIn();

        // Force go to dashboard to ensure we can create a NEW notebook
        // (Unless we are already on the dashboard root)
        if (this.page.url() !== 'https://notebooklm.google.com/') {
            console.log('[NotebookBot] navigating to dashboard root...');
            await this.page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(2000);
        }

        // 1. Click "Create new"
        const createBtn = this.page.locator('button:has-text("Create new"), div[role="button"]:has-text("Create new")').first();

        try {
            await createBtn.waitFor({ state: 'visible', timeout: 5000 });
            await createBtn.click();
        } catch (e) {
            console.log("Create button not found (or timeout).");
            throw new Error("Failed to find 'Create new' button. Am I logged in?");
        }

        // 2. Wait for navigation to a notebook URL
        try {
            await this.page.waitForURL(url => url.toString().includes('/notebook/'), { timeout: 15000 });
        } catch (e) {
            console.log("Warning: URL didn't change to /notebook/, might create issues.");
        }

        // 3. Try to Rename (Optional / Best Effort)
        try {
            const titleInput = this.page.locator('input[value="Untitled notebook"], div[contenteditable="true"]').first();
            if (await titleInput.isVisible()) {
                await titleInput.click();
                await titleInput.fill(title);
                await this.page.keyboard.press('Enter');
            }
        } catch (e) {
            console.log("Could not rename notebook (non-critical).");
        }

        // Save current URL as active
        this.activeNotebookUrl = this.page.url();
        console.log(`[NotebookBot] Active notebook set to: ${this.activeNotebookUrl}`);

        return { success: true, message: `Notebook "${title}" created (or attempted).` };
    }

    async ensureNotebookOpen() {
        await this.ensureLoggedIn();

        const currentUrl = this.page.url();
        if (currentUrl.includes('/notebook/')) {
            // Update active URL just in case
            this.activeNotebookUrl = currentUrl;
            return;
        }

        console.log('[NotebookBot] Not in a notebook. Attempting to navigate...');

        // Try known active URL
        if (this.activeNotebookUrl) {
            console.log(`[NotebookBot] Navigating to active notebook: ${this.activeNotebookUrl}`);
            await this.page.goto(this.activeNotebookUrl, { waitUntil: 'domcontentloaded' });
            return;
        }

        // Fallback: Click the first notebook on the dashboard
        console.log('[NotebookBot] No active notebook known. Opening the first one found...');

        // Generic selector for any notebook link
        const firstNotebook = this.page.locator('a[href*="/notebook/"]').first();

        try {
            // Wait for list to load
            await this.page.waitForSelector('a[href*="/notebook/"]', { timeout: 5000 });

            if (await firstNotebook.count() > 0) {
                const title = await firstNotebook.innerText();
                console.log(`[NotebookBot] Found notebook: "${title}". Clicking...`);
                await firstNotebook.click();
                await this.page.waitForURL(url => url.toString().includes('/notebook/'), { timeout: 10000 });

                this.activeNotebookUrl = this.page.url();
                console.log(`[NotebookBot] Restored active notebook: ${this.activeNotebookUrl}`);
                return;
            }
        } catch (e) {
            console.log("[NotebookBot] Failed to auto-open notebook from dashboard:", e.message);
        }

        throw new Error("Could not find or open a notebook. Please open one manually.");
    }

    async clickAddSourceButton() {
        // Helper to click "Add source" robustly (handling overlays)
        const addSourceBtns = this.page.locator('button[aria-label="Add source"], div[role="button"]:has-text("Add source")');

        if (await addSourceBtns.count() > 0) {
            const btn = addSourceBtns.first();
            try {
                // Try normal click
                await btn.click({ timeout: 2000 });
            } catch (e) {
                console.log('[NotebookBot] Add Source click intercepted. Attempting Force Click & Escape...');
                try {
                    await this.page.keyboard.press('Escape'); // Dismiss potential popups
                    await this.page.waitForTimeout(500);
                    await btn.click({ force: true });
                } catch (e2) {
                    console.log("[NotebookBot] Force click failed:", e2.message);
                    // It might be that the button is physically covered.
                    // We can try via JS dispatch?
                    await btn.evaluate(b => b.click());
                }
            }
            await this.page.waitForTimeout(1000);
            return true;
        }
        return false;
    }

    async addSource(sourceType, content) {
        console.log(`[NotebookBot] Adding source: ${sourceType} -> ${content}`);
        await this.ensureNotebookOpen();

        // 1. Ensure "Add sources" modal is visible
        // Check if modal is already open (text "Add sources" or "Upload sources")
        const modalVisible = await this.page.locator('text="Add sources"').count() > 0;

        if (!modalVisible) {
            console.log('[NotebookBot] Modal not found. Clicking sidebar "Add source"...');
            await this.clickAddSourceButton();
        }

        // 2. Handle Source Types
        if (sourceType === 'youtube') {
            console.log('[NotebookBot] Selecting YouTube...');

            // USER: <span matchipcontent="" class="mat-mdc-chip-action ..."><span ...>YouTube</span></span>
            // We target the action span directly.
            const btn = this.page.locator('span.mat-mdc-chip-action').filter({ hasText: 'YouTube' }).first();

            try {
                await btn.waitFor({ state: 'visible', timeout: 5000 });
                // Force click to avoid "moving up and down" (scrolling issues)
                await btn.click({ force: true });
            } catch (e) {
                console.log('[NotebookBot] YouTube chip not found/clickable. Retrying...');
                // Try fallback icon selector just in case text fails
                try {
                    const iconBtn = this.page.locator('mat-icon:has-text("video_youtube")').first();
                    await iconBtn.click({ force: true });
                } catch (e2) {
                    if (await this.clickAddSourceButton()) {
                        await btn.click({ force: true });
                    } else {
                        throw e;
                    }
                }
            }

            // Wait for modal animation
            await this.page.waitForTimeout(2000);

            await this.fillSourceInput(content);

        } else if (sourceType === 'url') {
            console.log('[NotebookBot] Selecting Website...');

            // Same logic for Website
            const btn = this.page.locator('span.mat-mdc-chip-action').filter({ hasText: 'Website' }).first();

            try {
                await btn.waitFor({ state: 'visible', timeout: 5000 });
                await btn.click({ force: true });
            } catch (e) {
                console.log('[NotebookBot] Website chip not found/clickable. Retrying...');
                try {
                    const iconBtn = this.page.locator('mat-icon:has-text("link")').first();
                    await iconBtn.click({ force: true });
                } catch (e2) {
                    if (await this.clickAddSourceButton()) {
                        await btn.click({ force: true });
                    } else {
                        throw e;
                    }
                }
            }

            // Wait for modal animation
            await this.page.waitForTimeout(1500);

            await this.fillSourceInput(content);

        } else if (sourceType === 'text') {
            console.log('[NotebookBot] Selecting Paste Text...');
            const btn = this.page.locator('text="Copied text"').last();
            await btn.click();

            await this.page.waitForTimeout(1000);
            const input = this.page.locator('textarea, div[contenteditable="true"]').last();
            await input.waitFor({ state: 'visible', timeout: 5000 });
            await input.fill(content);

            await this.page.waitForTimeout(500);
            const insertBtn = this.page.locator('button:has-text("Insert")').last();
            await insertBtn.click();

        } else if (sourceType === 'file') {
            console.log('[NotebookBot] Uploading file...');

            // Explicitly wait for "Upload sources" text to ensure we are in the correct valid state
            try {
                await this.page.waitForSelector('text="Upload sources"', { timeout: 5000 });
            } catch (e) {
                console.log('[NotebookBot] "Upload sources" text not found, attempting blindly...');
            }

            const fileInput = this.page.locator('input[type="file"]').first();
            // Ensure input is present
            await fileInput.waitFor({ state: 'attached', timeout: 10000 });

            await fileInput.setInputFiles(content);
            console.log(`[NotebookBot] File set: ${content}`);

            // Give it a moment to process the change event
            await this.page.waitForTimeout(2000);
        }

        await this.page.waitForTimeout(5000); // Wait for processing
        return { success: true, message: `Added source: ${content}` };
    }

    async fillSourceInput(content) {
        console.log(`[NotebookBot] Filling source input: ${content}`);

        // Strategy: specific valid selectors for YouTube/Web modal
        // The screenshot shows "Paste YouTube URL *" as placeholder or label.

        try {
            // Priority 1: User provided selector (Angular form control)
            const specificInput = this.page.locator('input[formcontrolname="newUrl"]');

            // Priority 2: ID based (less robust but matches snippet)
            const idInput = this.page.locator('#mat-input-1');

            // Priority 3: Fallback specific placeholder
            const placeholderInput = this.page.locator('input[placeholder*="Paste YouTube URL"], input[placeholder*="Paste URL"]');

            if (await specificInput.count() > 0) {
                console.log('[NotebookBot] Found input by formcontrolname="newUrl".');
                await specificInput.first().fill(content);
            } else if (await idInput.count() > 0) {
                console.log('[NotebookBot] Found input by ID.');
                await idInput.first().fill(content);
            } else if (await placeholderInput.count() > 0) {
                console.log('[NotebookBot] Found input by placeholder.');
                await placeholderInput.first().fill(content);
            } else {
                // Fallback to generic dialog input
                console.log('[NotebookBot] Specific input not found, trying generic dialog input...');
                const dialog = this.page.locator('div[role="dialog"]');
                await dialog.waitFor({ state: 'visible', timeout: 3000 });

                const input = dialog.locator('input[type="text"], input[type="url"]').first();
                await input.waitFor({ state: 'visible', timeout: 3000 });
                await input.click();
                await input.fill(content);
            }
        } catch (e) {
            console.error("Input interaction failed:", e);
            // Last ditch: global active input if user focused it? 
            // Better to throw so we know.
            throw new Error("Failed to find or type in input field: " + e.message);
        }

        await this.page.waitForTimeout(2000); // Wait for validation

        // "Insert" or "Add" button
        const insertBtn = this.page.locator('button mat-icon:has-text("add"), button .mdc-button__label:has-text("Insert"), button:has-text("Insert")').last();

        // Wait - often disabled until valid input
        try {
            await insertBtn.waitFor({ state: 'visible', timeout: 5000 });
            await insertBtn.waitFor({ state: 'enabled', timeout: 3000 });
            console.log('[NotebookBot] Insert button valid.');
        } catch (e) {
            console.log("[NotebookBot] Insert button might be disabled. Clicking anyway...");
        }

        await insertBtn.click();
    }

    async queryNotebook(message) {
        console.log(`[NotebookBot] Querying notebook: "${message}"`);
        await this.ensureNotebookOpen();

        // 1. Find Chat Input
        const chatInput = this.page.locator('textarea, input[placeholder*="Ask"], div[contenteditable="true"][aria-label*="Ask"]').last();
        await chatInput.waitFor({ state: 'visible', timeout: 10000 });
        await chatInput.click();
        await chatInput.fill(message);

        // Capture state before sending
        const initialBubbles = await this.page.locator('.message-bubble, .model-response, button[aria-label="Copy"]').count();

        await this.page.keyboard.press('Enter');

        console.log('[NotebookBot] Message sent. Waiting for response...');

        // 2. Wait for response
        try {
            // Wait for a new element to appear (a new copy button is a good proxy for a completed message)
            await this.page.waitForFunction((count) => {
                return document.querySelectorAll('button[aria-label="Copy"]').length > count;
            }, initialBubbles, { timeout: 45000 });
        } catch (e) {
            console.log('[NotebookBot] Warning: Timeout waiting for specific response indicator. proceeding to scrape...');
        }

        await this.page.waitForTimeout(2000); // Settle

        // 3. Scrape logic
        const scrapedAnswer = await this.page.evaluate(() => {
            // Helper to clean text
            const clean = (t) => t ? t.innerText.trim() : '';

            // Strategy 1: Look for specific message containers (Angular/Material)
            const possibleSelects = [
                'app-message-bubble',
                '.message-content',
                '.model-response',
                '.response-content',
                'div[data-message-id]',
                '.markdown-content'
            ];

            let allBubbles = [];
            for (const sel of possibleSelects) {
                const nodes = document.querySelectorAll(sel);
                if (nodes.length > 0) {
                    allBubbles = allBubbles.concat(Array.from(nodes));
                }
            }

            // Filter out UI noise (Studio, Sidebar)
            // The Studio often contains "Audio Overview", "Study Guide", "Mind Map"
            const invalidPhrases = ["Audio Overview", "Study Guide", "Mind Map", "Saved sources", "Click Add source"];

            const validBubbles = allBubbles.filter(el => {
                const text = el.innerText;
                if (!text || text.length < 10) return false;
                // Exclude if it contains typically Studio-only phrases
                if (invalidPhrases.some(phrase => text.includes(phrase))) return false;
                return true;
            });

            if (validBubbles.length > 0) {
                // Return validity from the last one
                return validBubbles[validBubbles.length - 1].innerText;
            }

            // Strategy 2: Main Area Text Analysis
            // If specific classes fail, grab all paragraphs in the main area
            const main = document.querySelector('main');
            if (main) {
                const paragraphs = Array.from(main.querySelectorAll('p, h1, h2, h3, li'));
                const validP = paragraphs.filter(p => {
                    const t = p.innerText;
                    if (t.length < 50) return false; // Too short to be a summary
                    if (invalidPhrases.some(phrase => t.includes(phrase))) return false;
                    return true;
                });

                if (validP.length > 0) {
                    // Return the last substantial paragraph (likely the end of the summary)
                    // Or combine the last few?
                    // Let's try to return the last one for now.
                    return validP[validP.length - 1].innerText;
                }
            }

            return null;
        });

        if (scrapedAnswer) {
            console.log(`[NotebookBot] Scraped Answer: ${scrapedAnswer.substring(0, 50)}...`);
            return { success: true, answer: scrapedAnswer };
        }

        // Final Fallback: Snapshot the whole main area text
        // But exclude the known "Studio" text if possible
        const mainText = await this.page.locator('main').innerText();
        return { success: true, answer: mainText.slice(-2000) }; // Return more text so user can see it
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

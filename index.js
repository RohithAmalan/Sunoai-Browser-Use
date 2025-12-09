
import { SunoBot } from './suno_automation.js';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

(async () => {
    const bot = new SunoBot();

    try {
        // Check if auth file exists to offer background mode
        const fs = await import('fs');
        let runHeadless = false;

        if (fs.existsSync('auth.json')) {
            const answer = await askQuestion('Run in background (headless)? (y/n): ');
            if (answer.toLowerCase().startsWith('y')) {
                runHeadless = true;
            }
        }

        // Launch browser
        await bot.initialize(runHeadless);

        // If headless, we won't see login visually, but ensureLoggedIn will handle the wait/check.
        await bot.ensureLoggedIn();

        console.log('\n-----------------------------------');
        console.log('READY FOR INPUT');
        console.log('Please check this terminal window!');
        console.log('-----------------------------------\n');

        const prompt = await askQuestion('Enter your song description: ');
        if (prompt.trim()) {
            const instrumentalInput = await askQuestion('Instrumental only? (y/n): ');
            const instrumental = instrumentalInput.toLowerCase().startsWith('y');

            const songInfo = await bot.generateSong(prompt, instrumental);

            console.log('Song generation triggered!');

            // Save to file
            const fs = await import('fs');
            const songsFile = 'generated_songs.json';
            let songs = [];
            if (fs.existsSync(songsFile)) {
                songs = JSON.parse(fs.readFileSync(songsFile, 'utf8'));
            }
            songs.push(songInfo);
            fs.writeFileSync(songsFile, JSON.stringify(songs, null, 2));
            console.log(`Song info saved to ${songsFile}`);

        } else {
            console.log('No prompt entered, exiting.');
        }

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        const keepOpen = await askQuestion('Press Enter to close browser...');
        await bot.close();
        rl.close();
        process.exit(0);
    }
})();

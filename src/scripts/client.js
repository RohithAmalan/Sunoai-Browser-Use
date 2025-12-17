import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => {
    return new Promise((resolve) => rl.question(query, resolve));
};

async function main() {
    console.log('\n--- Suno AI Client (Headless Mode) ---');
    console.log('Ensure "node server.js" is running.');

    try {
        // 1. Initialize Headless
        console.log('Initializing background browser...');
        const initRes = await fetch('http://localhost:3000/api/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headless: true })
        });

        if (!initRes.ok) {
            const err = await initRes.json();
            if (err.message !== 'Bot already initialized.') {
                console.log('⚠️ Server Status:', err);
            } else {
                console.log('✅ Connected to existing session.');
            }
        } else {
            console.log('✅ Browser initialized successfully.');
        }

        // 2. Loop
        while (true) {
            console.log('\n🎵 CREATE NEW SONG');
            const prompt = await askQuestion('   Description: ');

            if (!prompt || prompt.toLowerCase() === 'exit') {
                if (prompt && prompt.toLowerCase() === 'exit') break;
                console.log('   (Prompt cannot be empty)');
                continue;
            }

            const instrStr = await askQuestion('   Instrumental? (y/n) [n]: ');
            const instrumental = instrStr.toLowerCase().startsWith('y');

            console.log(`\n🚀 Generating: "${prompt}"...`);

            const res = await fetch('http://localhost:3000/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, instrumental })
            });

            const data = await res.json();
            if (res.ok) {
                console.log('✅ Done! Song generated and downloaded.');
            } else {
                console.log('❌ Error:', data.error || data);
            }
        }

        // Cleanup
        await fetch('http://localhost:3000/api/close', { method: 'POST' });
        console.log('👋 Bye!');

    } catch (error) {
        console.error('\n❌ Error connecting to server:', error.message);
        console.log('Make sure "node server.js" is running!');
    } finally {
        rl.close();
    }
}

main();


// Native fetch is available in Node 18+

async function testDownload() {
    console.log('Test: Initializing...');
    await fetch('http://localhost:3000/api/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headless: false })
    });

    console.log('Test: Requesting Download of 1 recent song...');
    const res = await fetch('http://localhost:3000/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 1 })
    });

    const data = await res.json();
    console.log('Result:', data);
}

testDownload();

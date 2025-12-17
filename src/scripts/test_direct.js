
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.join(__dirname, '../mcp/direct_server.js');
console.log(`Starting server: ${serverPath}`);

const server = spawn('/usr/local/bin/node', [serverPath], {
    cwd: path.join(__dirname, '../..'),
    stdio: ['pipe', 'pipe', 'inherit']
});

server.stdout.on('data', (data) => {
    console.log(`[Server Output] ${data}`);
});

// Send initialize request
const initReq = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-script", version: "1.0" }
    }
};

console.log('Sending Initialize...');
server.stdin.write(JSON.stringify(initReq) + '\n');

// Send tools/list request after a brief delay
setTimeout(() => {
    const listReq = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list"
    };
    console.log('Sending tools/list...');
    server.stdin.write(JSON.stringify(listReq) + '\n');
}, 1000);

// Close after test
setTimeout(() => {
    console.log('Closing server...');
    server.kill();
}, 3000);

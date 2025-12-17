
import { createRequire } from "module";
const require = createRequire(import.meta.url);

try {
    const ES = require("eventsource");
    console.log("Type of require('eventsource'):", typeof ES);
    console.log("Is it a constructor?", typeof ES === 'function' && /^\s*class\s+/.test(ES.toString()));
    console.log("Keys:", Object.keys(ES));

    if (ES.default) {
        console.log("ES.default exists. Type:", typeof ES.default);
    }

    try {
        new ES("http://localhost");
        console.log("SUCCESS: new ES() worked");
    } catch (e) {
        console.log("FAIL: new ES() failed:", e.message);
    }

    try {
        new ES.default("http://localhost");
        console.log("SUCCESS: new ES.default() worked");
    } catch (e) {
        console.log("FAIL: new ES.default() failed:", e.message);
    }

} catch (e) {
    console.error("Require failed:", e);
}

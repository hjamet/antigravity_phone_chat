import { getChatHistory } from '../src/cdp/manager.js';
import { connectCdp } from '../src/cdp/cdp_connector.js';

async function test() {
    try {
        const cdp = await connectCdp();
        if (!cdp) {
            console.error("Agent Manager not connected");
            process.exit(1);
        }
        console.log("Connected to CDP. Fetching history...");
        const result = await getChatHistory(cdp);
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
test();

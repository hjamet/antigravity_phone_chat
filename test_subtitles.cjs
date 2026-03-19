// Test script to inspect the raw debug-dom output
const http = require('http');

const req = http.get('http://localhost:3000/debug-dom', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const j = JSON.parse(data);
        const turns = j.turns || [];
        console.log('Total turns:', turns.length);
        
        // Look at AGENT turns with isolateBlocks
        turns.filter(t => t.type === 'agent' && t.isolateBlocks && t.isolateBlocks.length > 0).forEach(t => {
            console.log('\n=== AGENT TURN', t.idx, '===');
            t.isolateBlocks.forEach((b, i) => {
                console.log('  BLOCK', i, '{');
                console.log('    title:', b.title);
                console.log('    paragraphLen:', b.paragraphLen);
                const pts = b.progressTitles || [];
                console.log('    progressTitles (' + pts.length + '):');
                pts.forEach((p, pi) => {
                    console.log('      [' + pi + ']', p.substring(0, 120));
                });
                console.log('  }');
            });
        });
    });
});
req.on('error', e => console.error(e));

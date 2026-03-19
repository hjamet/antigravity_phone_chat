import { connectCdp } from './src/cdp/cdp-client.js';

async function inspectChat() {
    let client;
    try {
        client = await connectCdp({ port: 9000 });
        const targets = await client.listTargets();
        const managerTarget = targets.find(t => t.url && t.url.includes('index.html') && t.type === 'page');
        
        if (!managerTarget) {
            console.log('Manager target not found');
            return;
        }
        
        await client.attachToTarget(managerTarget.id);
        
        const expression = `(function() {
            const chatBox = document.querySelector('#conversation') || document.querySelector('#chat');
            if (!chatBox) return 'No chat box';
            
            const turnsContainer = Array.from(chatBox.querySelectorAll('div')).find(div => {
                const cls = Array.from(div.classList);
                return cls.includes('flex') && cls.includes('gap-4') && div.children.length > 0;
            }) || chatBox.querySelector('.flex.flex-col.gap-4') || chatBox.querySelector('div.flex.flex-col');
            
            if (!turnsContainer) return 'No turns container';
            
            const turns = Array.from(turnsContainer.children);
            if (turns.length === 0) return 'No turns';
            
            const lastTurn = turns[turns.length - 1];
            
            // Analyze children
            const childInfo = Array.from(lastTurn.children).map(c => ({
                tag: c.tagName,
                classes: Array.from(c.classList).join(' '),
                textStart: c.innerText?.substring(0, 50).replace(/\\n/g, ' '),
                contentLength: c.innerText?.length || 0,
                isMarkdownBody: !!c.querySelector('.markdown-body') || c.classList.contains('markdown-body')
            }));
            
            return {
                turnClasses: Array.from(lastTurn.classList).join(' '),
                childCount: lastTurn.children.length,
                children: childInfo
            };
        })()`;
        
        const result = await client.call("Runtime.evaluate", { 
            expression, 
            returnByValue: true, 
            awaitPromise: true,
            contextId: undefined // Let it evaluate in main context
        });
        
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("Error:", err);
    } finally {
        if (client) client.close();
    }
}

inspectChat();

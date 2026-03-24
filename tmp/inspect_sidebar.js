import CDP from 'chrome-remote-interface';
import fs from 'fs';

async function main() {
    let client;
    try {
        console.log("Connexion au CDP sur le port 9222...");
        client = await CDP({ port: 9222 });
        const { Runtime } = client;

        console.log("Exécution du script d'inspection...");
        const expression = `(() => {
            // Trouver tous les boutons qui pourraient ressembler à un toggle sidebar
            const buttons = Array.from(document.querySelectorAll('button, [role="button"], a, div[role="button"]'));
            const possibleToggles = buttons.filter(b => {
                const title = b.getAttribute('title') || b.getAttribute('aria-label') || '';
                const html = b.innerHTML.toLowerCase();
                return title.toLowerCase().includes('sidebar') || title.toLowerCase().includes('panel') || title.toLowerCase().includes('secondary') || html.includes('panel') || title.toLowerCase().includes('aux');
            }).map(b => ({
                tag: b.tagName,
                title: b.getAttribute('title'),
                ariaLabel: b.getAttribute('aria-label'),
                className: b.className,
                html: b.innerHTML.substring(0, 100)
            }));

            // Trouver les potentiels containers de la sidebar droite
            const panels = Array.from(document.querySelectorAll('div'))
                .filter(d => d.className.includes('bg-sideBar-background') || d.className.includes('sidebar'))
                .map(d => ({
                    className: d.className,
                    text: d.innerText ? d.innerText.substring(0, 50).replace(/\\n/g, ' ') : ''
                }));

            return { toggles: possibleToggles, panels: panels };
        })()`;

        const result = await Runtime.evaluate({
            expression: expression,
            returnByValue: true,
            awaitPromise: true
        });

        console.log(JSON.stringify(result.result.value, null, 2));
    } catch (err) {
        console.error("Erreur CDP :", err);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

main();

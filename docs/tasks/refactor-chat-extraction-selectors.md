# Refactoring de l'Extraction Chat (No-Fallback)

## 1. Contexte & Discussion (Narratif)
En réalisant un audit avec l'utilisateur (d'après les conventions `no-fallback.md`), nous avons constaté que la fonction `captureSnapshot` dans `src/cdp/manager.js` utilise massivement des heuristiques basées sur du texte (`innerText.includes('Progress Updates')`, listes de mots à ignorer, etc.) pour parser la structure du Chat (titres, paragraphes, sous-titres).
C'est extrêmement fragile. Si une mise à jour d'Antigravity modifie un label ou ajoute une icône, l'extraction casse silencieusement.
Le but est de confier à un Agent Dev le soin de diagnostiquer sa *propre* conversation en direct (via `capture_dom.mjs` ou `ui_inspector.js`) pour cartographier les sélecteurs CSS CSS réels qui encapsulent les statuts de tâche, les titres et les résumés.

## 2. Fichiers Concernés
- `src/cdp/manager.js` (fonction `captureSnapshot`)
- `src/config/selectors.js` (nouvelle section `agentTask` ou extension de `chat`)
- Optionnel : `src/server/services/ChatHistoryService.js` si le filtrage métier peut être simplifié.

## 3. Objectifs (Definition of Done)
* Remplacement intégral des heuristiques textuelles (`includes(...)`) par des sélecteurs CSS stricts et centralisés.
* Ajout de ces sélecteurs dans `src/config/selectors.js`.
* Si un sélecteur casse, la fonction ne doit plus essayer de "deviner" ou renvoyer un tableau vide, elle doit logger une erreur explicative (`Fail-Fast`).
* Le rendu final de la conversation (titres formatés, numéros, HTML pur) doit rester graphiquement identique (régression visuelle nulle).

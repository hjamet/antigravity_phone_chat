# Fix Auto-Ouverture Agent Manager

## 1. Contexte & Discussion (Narratif)
> Au démarrage, le serveur Phone Connect doit automatiquement ouvrir l'Agent Manager si celui-ci n'est pas déjà ouvert. Le flux est : `server.js → initCDP() → si pas de Manager trouvé → workbenchCdp.autoOpenManager()`.
>
> La fonction `autoOpenManager()` dans `workbench.js` cherchait un bouton par mot-clé (title/aria-label/innerText contenant "agent manager") avec un fallback CSS fragile. **Cela viole la règle No-Fallback**.
>
> **Sélecteur correct** (identifié par l'utilisateur) :
> ```javascript
> document.querySelector("#workbench\\.parts\\.titlebar > div > div.titlebar-right > div.action-toolbar-container > a")
> ```
>
> **Règle absolue** : Pas de recherche heuristique, pas de fallback. Si le sélecteur ne trouve pas l'élément → `throw new Error(...)` immédiat avec message explicite indiquant quel sélecteur est cassé.

## 2. Fichiers Concernés
- `src/cdp/workbench.js` — fonction `autoOpenManager()` à réécrire
- `src/config/selectors.js` — ajouter le sélecteur du bouton Manager dans la section `workbench`
- `server.js` — adapter `initCDP()` pour gérer proprement les erreurs throw

## 3. Objectifs (Definition of Done)
* **Le sélecteur** est centralisé dans `src/config/selectors.js` sous `workbench.managerButton`
* **La fonction** `autoOpenManager()` utilise UNIQUEMENT ce sélecteur ciblé, sans aucune recherche heuristique ni fallback
* **Si le sélecteur casse** (mise à jour Antigravity), une erreur explicite est levée immédiatement avec le message : `[CDP] Selector broken: "..." — element not found in autoOpenManager(). Update src/config/selectors.js`
* **Vérifiable** : Lancer `node server.js` → l'Agent Manager s'ouvre automatiquement

# Refactoring des Commandes de Contrôle CDP (No-Fallback)

## 1. Contexte & Discussion (Narratif)
> Suite à la refonte réussie de `captureSnapshot()` (Tâche 20), on a constaté que **toutes les autres fonctions de contrôle CDP** dans `src/cdp/manager.js` utilisent encore des heuristiques textuelles fragiles pour interagir avec l'interface de l'Agent Manager.
>
> Concrètement, des fonctions comme `getAppState`, `setModel`, `setMode` et `getAvailableModels` font des `document.querySelectorAll('*')` puis filtrent par `innerText.includes("Gemini")` ou `innerText.includes("Claude")`. Cela viole directement la règle `no-fallback.md`.
>
> L'Architecte a identifié ce problème lors de la revue post-refactoring de la Tâche 20. L'utilisateur a validé l'ajout de cette tâche à la Roadmap.

## 2. Fichiers Concernés
- `src/cdp/manager.js` — fonctions `getAppState`, `setModel`, `setMode`, `getAvailableModels`, `injectMessage`, `stopGeneration`, `startNewChat`, `clickElement`, `hasChatOpen`, `getChatHistory`
- `src/config/selectors.js` — ajout de nouvelles sections de sélecteurs
- `src/cdp/ui_inspector.js` — utilisation pour le diagnostic DOM

## 3. Objectifs (Definition of Done)
* Toutes les fonctions de contrôle CDP utilisent **exclusivement** des sélecteurs CSS stricts centralisés dans `src/config/selectors.js`.
* **Aucune** recherche par `innerText`, `textContent`, ou mot-clé heuristique pour la sélection d'éléments.
* Chaque sélecteur qui échoue lève une **erreur explicite** (fail-fast) conformément à `no-fallback.md`.
* Les sélecteurs sont identifiés via le workflow `/inspect-dom` sur l'Agent Manager live.
* Le format de sortie et le comportement des routes REST restent inchangés (zéro régression).

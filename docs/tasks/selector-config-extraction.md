# Extraction des Sélecteurs CSS dans un Fichier de Configuration

## 1. Contexte & Discussion (Narratif)
> Aujourd'hui, les sélecteurs CSS (`.bg-gray-500`, `.isolate`, `[class*="scrollbar-hide"]`, etc.) sont codés en dur dans le template string `CAPTURE_SCRIPT` de `manager.js`. Si Google change son interface, il faut fouiller un script injecté de 400 lignes pour retrouver et corriger chaque sélecteur.
>
> L'architecte propose de centraliser tous les sélecteurs dans un fichier de configuration unique (`src/config/selectors.js`), importé par `manager.js`, qui les injecte dynamiquement dans le script CDP.
>
> Cela permet aussi de créer des tests : on injecte les sélecteurs de test pour vérifier que la mécanique d'extraction fonctionne, indépendamment du DOM réel.

## 2. Fichiers Concernés
- `src/cdp/manager.js` — Remplacer les sélecteurs hardcodés par des variables injectées
- `src/config/selectors.js` — **[NEW]** Dictionnaire de tous les sélecteurs CSS utilisés
- `docs/architecture/selectors.md` — **[NEW]** Documentation des sélecteurs et de leur rôle

## 3. Objectifs (Definition of Done)
* Aucun sélecteur CSS n'est hardcodé directement dans le template string de `manager.js`.
* Un fichier `selectors.js` unique contient tous les sélecteurs, organisés par section (chat, user, agent, progress).
* `manager.js` injecte ces sélecteurs en paramètre du script CDP avant son exécution.
* La documentation décrit chaque sélecteur et son rôle dans l'interface Antigravity.

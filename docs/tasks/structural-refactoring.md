# Refactoring Structurel (Dette Technique)

## 1. Contexte & Discussion (Narratif)
> *Handover* : Suite à la migration réussie du Chat History sur le Manager CDP, l'Architecte a relevé une importante dette technique et conceptuelle. `server.js` (2200+ lignes) et `public/js/app.js` (1300+ lignes) sont devenus de gros monolithes difficiles à maintenir. De plus, on continue d'utiliser le nom de variable `launchpad` pour un target CDP qui s'appelle `Manager` (et qui affiche d'ailleurs Agent Manager sur le PC).
> L'utilisateur a validé un "refactoring d'urgence" pour assainir la base de code AVANT de s'attaquer à la grande migration de l'injection des messages (Tâche 9).

## 2. Fichiers Concernés
- `server.js`
- `public/js/app.js`
- Tous les fichiers où le mot `launchpad` est utilisé comme identifiant CDP.

## 3. Objectifs (Definition of Done)
* **Modularisation Backend** : Extraire les énormes blobs de code injectés via `Runtime.evaluate` (CDP scripts) dans un nouveau dossier `src/cdp/` ou `src/scripts/`. `server.js` doit faire moins de 1000 lignes idéalement.
* **Modularisation Frontend** : Découper `app.js` en modules ES (par ex. `api.js`, `history.js`, `projects.js`, `chat.js`).
* **Cohérence Sémantique** : Renommer toutes les occurrences de `launchpad` et ses dépendances en `manager` pour refléter la réalité de l'application (Agent Manager).
* **Zéro Régression** : Aucune fonctionnalité existante ne doit être cassée après ce refactoring. Le fonctionnement global doit rester identique à l'utilisateur final.

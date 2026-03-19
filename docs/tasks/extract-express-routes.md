# Extraction des Routes Express

## 1. Contexte & Discussion (Narratif)
> *Handover* : Suite au refactoring structurel (Tâche 8), l'Architecte a identifié que `server.js`, bien qu'allégé des scripts CDP, reste un monolithe côté routing. Il contient encore toutes les routes REST Express et la logique WebSocket imbriquées dans le fichier principal. L'utilisateur a validé l'extraction en tant que tâche de la roadmap pour atteindre un backend modulaire parfait.

## 2. Fichiers Concernés
- `server.js`
- `src/server/routes.js` (à créer)
- `src/server/ws.js` (à créer)

## 3. Objectifs (Definition of Done)
* **Extraction Routes REST** : Déplacer toutes les définitions de routes (`app.get`, `app.post`) dans un module dédié `src/server/routes.js`, importé par `server.js`.
* **Extraction WebSocket** : Déplacer la logique de gestion WebSocket (`wss.on('connection', ...)`) dans `src/server/ws.js`.
* **`server.js` minimal** : Le fichier principal ne doit contenir que le bootstrap (imports, création du serveur HTTP/HTTPS, appel à `initCDP`, et démarrage du listener).
* **Zéro Régression** : Aucune fonctionnalité ne doit être cassée.

# Refonte API & Architecture en Couches

## 1. Contexte & Discussion (Narratif)
> L'application actuelle fonctionne avec une architecture "spaghetti" où `server.js` gère directement la timeline des messages (`global.chatTimeline`), où `manager.js` mélange scraping DOM et logique de nettoyage, et où `routes.js` appelle les fonctions CDP sans couche intermédiaire.
>
> L'utilisateur et l'architecte ont convenu que cette approche est fragile : une simple mise à jour des classes CSS par Google Deepmind casserait silencieusement toute l'extraction sans aucun signal.
>
> La décision a été prise de refactorer en **3 couches distinctes** :
> - **Infrastructure (Adapter CDP)** : `manager.js` ne fait que du scraping brut.
> - **Service (Métier)** : Un `ChatHistoryService` valide et gère la chronologie.
> - **Présentation (API)** : `routes.js` expose les données proprement.

## 2. Fichiers Concernés
- `server.js` — Logique de polling et `global.chatTimeline` à extraire
- `src/cdp/manager.js` — Script `CAPTURE_SCRIPT` à simplifier
- `src/server/routes.js` — Routes à simplifier
- `src/server/services/ChatHistoryService.js` — **[NEW]** Service dédié
- `src/config/selectors.js` — **[NEW]** Fichier de configuration des sélecteurs CSS

## 3. Objectifs (Definition of Done)
* Le polling de `server.js` délègue entièrement la gestion de la timeline au `ChatHistoryService`.
* `manager.js` retourne des données brutes structurées.
* `ChatHistoryService` centralise la déduplication, la validation et le groupement.
* Les routes n'appellent plus directement les fonctions CDP mais passent par le Service.
* La logique `global.chatTimeline` n'existe plus dans `server.js`.

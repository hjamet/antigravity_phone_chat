# Nettoyage de `routes.js` (Extraction Debug)

## 1. Contexte & Discussion (Narratif)
Suite à un audit d'architecture, nous avons constaté que la quasi-totalité de l'app respecte une stricte séparation des préoccupations (Routes -> Services / CDP).
Cependant, la route `GET /debug-dom` dans `src/server/routes.js` embarque directement plus de 100 lignes de script CDP injecté (in-browser JS).
Ceci casse l'isolation de la couche réseau et crée de la dette technique. La logique doit être extraite pour préserver la propreté du contrôleur.

## 2. Fichiers Concernés
- `src/server/routes.js`
- Fichier cible dans la couche CDP (ex : `src/cdp/ui_inspector.js` ou fonction dans `manager.js`)

## 3. Objectifs (Definition of Done)
* La route `/debug-dom` dans Express ne fait qu'appeler une courte fonction module (ex: `managerCdp.getDomDebug()`).
* Le script CDP (le long "DEBUG_SCRIPT") a été entièrement migré vers un des fichiers de la couche `src/cdp/`.
* Le comportement technique du endpoint reste strictement identique.

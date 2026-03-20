# Nettoyage Fichiers Debug & Test

## 1. Contexte & Discussion (Narratif)
> Identifié lors de la session Architect du 2026-03-20. La racine du dépôt est polluée par des fichiers de test et de debug éparpillés. Cela nuit à la lisibilité et crée de la confusion entre scripts de production et scripts jetables.
>
> De plus, la route `/remote-scroll` est dupliquée dans `routes.js` (L138 et L284), ce qui est un bug potentiel.

## 2. Fichiers Concernés

### Fichiers de test à déplacer/supprimer
- `test_cdp.js` (racine)
- `test_cdp_dom.cjs` (racine)
- `test_chat_dom.js` (racine)
- `test_manager.mjs` (racine)
- `test_manager_extraction.cjs` (racine)
- `test_subtitles.cjs` (racine)

### Fichiers de sortie debug à supprimer
- `dom_debug.json` (racine)
- `snapshot_debug.json` (racine)
- `test_output.html` (racine)
- `test_output.txt` (racine)
- `server_log.txt` (racine)
- `cloudflared_log.txt` (racine)

### Bug à corriger
- `src/server/routes.js` — route `/remote-scroll` dupliquée (L138 et L284)

## 3. Objectifs (Definition of Done)
* **Fichiers de test** déplacés dans `debug/` ou supprimés s'ils sont obsolètes
* **Fichiers de sortie** ajoutés au `.gitignore` et/ou supprimés
* **Route dupliquée** corrigée dans `routes.js`
* **Racine propre** : seuls `server.js`, configs, et fichiers légitimes restent

# Nettoyage Complet du Dépôt & Alignement Structurel

## 1. Contexte & Discussion (Narratif)
> Suite au refactoring majeur (Tâches 8, 9, 10), l'architecture applicative est saine : `server.js` est un bootstrap léger, les routes Express et WebSocket sont dans `src/server/`, la logique CDP est dans `src/cdp/`. Cependant, la **racine du dépôt** est devenue un fourre-tout de scripts et d'utilitaires qui ne respectent pas l'arborescence décrite dans le README. L'Architecte a identifié cette dette lors de sa revue post-refactoring.

## 2. Fichiers Concernés
- `start_ag_phone_connect.bat` / `.sh` (racine → `startup_scripts/`)
- `start_ag_phone_connect_web.bat` / `.sh` (racine → `startup_scripts/`)
- `install_context_menu.bat` / `.sh` (racine → `startup_scripts/`)
- `launcher.py` (racine → `startup_scripts/`)
- `ui_inspector.js` (racine → `src/utils/` ou `src/cdp/`)
- `generate_ssl.js` (racine → `scripts/` ou `startup_scripts/`)
- `cloudflared_log.txt` / `server_log.txt` (racine → à gitignore)
- `scratch/` / `debug/` (racine → vérifier contenu, potentiellement à gitignore)
- `CODE_DOCUMENTATION.md`, `CONTRIBUTING.md`, `DESIGN_PHILOSOPHY.md`, `RELEASE_NOTES.md`, `SECURITY.md`, `SOCIAL_MEDIA.md` (racine → évaluer si certains vont dans `docs/`)
- `README.md` (mise à jour de l'arborescence et de la roadmap)
- `.gitignore` (ajout des fichiers de log)
- `server.js` (mise à jour des imports si `ui_inspector.js` est déplacé)
- `docs/index_tasks.md` (mise à jour de l'index)

## 3. Objectifs (Definition of Done)
* La racine du dépôt ne contient **que** les fichiers essentiels : `server.js`, `package.json`, `README.md`, `LICENSE`, `.env`, `.gitignore`, et les fichiers de config standards.
* Tous les scripts de lancement (.bat, .sh, .py) sont dans un dossier dédié (`startup_scripts/`).
* Les utilitaires JS (`ui_inspector.js`, `generate_ssl.js`) sont rangés dans des sous-dossiers appropriés.
* Les fichiers de log (`*.txt`) sont dans le `.gitignore`.
* Le `README.md` reflète **exactement** la structure réelle du dépôt.
* Tous les imports et références internes sont mis à jour pour refléter les déplacements.
* Les fichiers `.md` à la racine sont évalués : garder uniquement ceux qui ont un sens à la racine (README, LICENSE, CONTRIBUTING), déplacer le reste dans `docs/`.

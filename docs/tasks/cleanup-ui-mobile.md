# Cleanup UI Mobile

## 1. Contexte & Discussion (Narratif)
> L'utilisateur souhaite épurer l'interface mobile du projet antigravity_phone_chat.
> Les quick-actions en bas de page (Continue, Explain, Fix Bugs, Create Docs) encombrent l'écran mobile sans grande utilité.
> L'objectif est une interface plus propre et plus mobile-first.

## 2. Fichiers Concernés
- `public/index.html` — Suppression du bloc `.quick-actions`
- `public/css/style.css` — Nettoyage CSS associé, ajustements responsive
- `public/js/app.js` — Suppression des handlers `quickAction()`

## 3. Objectifs (Definition of Done)
* Le bloc "quick-actions" (Continue, Explain, Fix Bugs, Create Docs) est supprimé du HTML.
* Le CSS des `.quick-actions` et `.action-chip` est supprimé.
* La fonction `quickAction()` et ses appels sont retirés de `app.js`.
* Le chat occupe bien tout l'espace libéré sur mobile.
* L'interface reste fonctionnelle sur desktop et mobile (pas de régression).

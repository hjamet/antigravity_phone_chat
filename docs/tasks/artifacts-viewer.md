# Artefacts & Commentaires

## 1. Contexte & Discussion (Narratif)
> L'utilisateur souhaite pouvoir visualiser les artefacts Antigravity (Implementation Plan, Task, Walkthrough) directement depuis l'interface mobile, sans avoir à basculer sur le desktop. Il doit aussi pouvoir laisser des commentaires sur ces artefacts, ce qui replique la fonctionnalité native d'Antigravity via CDP.

- L'exploration DOM a révélé que les artefacts sont listés dans le panel latéral auxiliaire (toggle via `[data-testid="toggle-aux-sidebar"]`).
- Cliquer sur un artefact ouvre un viewer markdown rendu avec un header contenant les boutons back/forward/edit/Review/Proceed/download/close.
- Le bouton **Review** (`aria-haspopup="dialog"`) ouvre un dialog de commentaire avec un éditeur `contenteditable`.
- L'utilisateur a choisi l'option B (commentaires CDP bidirectionnels) plutôt que l'option A (localStorage local).

## 2. Fichiers Concernés
- `src/config/selectors.js` — 14 nouveaux sélecteurs `artifacts.*`
- `src/cdp/manager.js` — 3 fonctions CDP : `listArtifacts()`, `getArtifactContent()`, `addArtifactComment()`
- `src/server/routes.js` — 3 routes API : `GET /api/artifacts`, `GET /api/artifacts/:name`, `POST /api/artifacts/:name/comment`
- `public/js/artifacts.js` — Module frontend ESM
- `public/index.html` — Bouton Artifacts, layer liste, viewer half-screen
- `public/css/style.css` — ~300 lignes de styles
- `public/js/main.js` — Import et intégration du module

## 3. Objectifs (Definition of Done)
* L'utilisateur peut voir la liste des artefacts depuis l'interface mobile.
* Cliquer sur un artefact ouvre un viewer plein écran avec le contenu markdown fidèlement rendu.
* L'utilisateur peut laisser un commentaire qui est envoyé via CDP à l'instance Antigravity Desktop.
* Le viewer supporte le rendu markdown complet : titres, listes, code, tableaux, alertes GitHub.

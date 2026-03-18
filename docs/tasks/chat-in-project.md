# Chat dans un Projet (Start New Conversation + Sélecteur)

## 1. Contexte & Discussion (Narratif)
> L'utilisateur veut pouvoir démarrer un nouveau chat dans un projet spécifique depuis son téléphone.
> Le flux serait : cliquer "New Conversation" → sélectionner un projet dans la liste (récupérée via le Launchpad)
> → le serveur ouvre le projet dans Antigravity et crée un nouveau chat via CDP.
>
> Actuellement, le bouton "New Chat" dans l'interface mobile déclenche Ctrl+Shift+L dans le workbench actif.
> Il faudra étendre cela pour intégrer le choix de projet.

## 2. Fichiers Concernés
- `server.js` — Orchestration : ouverture projet + nouveau chat
- `public/index.html` — Modification du flux "New Chat" pour inclure le sélecteur
- `public/js/app.js` — Logique frontend du sélecteur de projet

## 3. Objectifs (Definition of Done)
* Le bouton "New Chat" propose optionnellement de choisir un projet avant de créer le chat.
* Le serveur orchestre : ouverture du projet via Launchpad → attente de la fenêtre → nouveau chat.
* Si un seul projet est ouvert, le chat est créé directement (pas de sélecteur).

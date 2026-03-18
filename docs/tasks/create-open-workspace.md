# Création de Projet (Open Workspace)

## 1. Contexte & Discussion (Narratif)
> L'utilisateur souhaite pouvoir créer/ouvrir un nouveau workspace directement depuis l'interface mobile.
> Dans Antigravity, cela passe par File > Open Workspace (ou similaire).
> L'exploration CDP devra déterminer le sélecteur exact de cette action dans le menu.
> Une fois implémenté, le téléphone pourra déclencher l'ouverture d'un dossier projet
> (potentiellement via un file picker ou une liste prédéfinie).

## 2. Fichiers Concernés
- `server.js` — Route API pour déclencher "Open Workspace" via CDP
- `public/index.html` et `public/js/app.js` — Bouton d'ouverture dans l'UI mobile

## 3. Objectifs (Definition of Done)
* L'utilisateur peut déclencher l'action "Open Workspace" depuis le téléphone.
* Le serveur simule l'action via CDP dans la fenêtre workbench.
* L'interface mobile permet de saisir un chemin ou de sélectionner un projet récent.

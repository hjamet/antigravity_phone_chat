# Interface Projets Mobile

## 1. Contexte & Discussion (Narratif)
> Une fois le pont CDP en place, l'interface mobile doit exposer un sélecteur de projets 
> qui permet à l'utilisateur de voir ses projets récents et d'en ouvrir un depuis son téléphone.
> L'élément remplacera les quick-actions supprimées et sera accessible depuis le header.

## 2. Fichiers Concernés
- `public/index.html` — Ajout du bouton/dialogue de sélection de projet dans le header
- `public/css/style.css` — Styles du sélecteur (glassmorphism, mobile-first)
- `public/js/app.js` — Logique d'appel API, rendu de la liste, gestion du clic

## 3. Objectifs (Definition of Done)
* Un bouton "Projets" est visible dans le header mobile.
* Un clic ouvre un panneau/dialogue listant les projets (appel `GET /api/projects`).
* Le projet actif est visuellement distingué.
* Un clic sur un projet déclenche `POST /api/projects/open` et le chat se met à jour avec le nouveau snapshot.
* Le design suit le glassmorphism existant et est cohérent avec le reste de l'UI.

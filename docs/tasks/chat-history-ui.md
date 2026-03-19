# Historique Récent — Chat History Amélioré

## 1. Contexte & Discussion (Narratif)
> L'interface mobile dispose déjà d'un accès à l'historique des conversations (bouton existant).
> Cependant, l'UX d'affichage des conversations passées peut être améliorée :
> navigation plus fluide, preview des messages, recherche, et gestion (suppression, renommage).
>
> Cette tâche est distincte du "Cleanup UI Mobile" (tâche 6) qui se concentre
> sur la suppression des quick-actions et l'optimisation responsive générale.
> Ici, l'objectif est d'enrichir spécifiquement le panneau d'historique des conversations.

## 2. Fichiers Concernés
- `public/index.html` — Section historique (modal ou panneau dédié)
- `public/css/style.css` — Styles du panneau historique
- `public/js/app.js` — Logique de chargement et navigation dans l'historique
- `server.js` — Éventuellement, routes API pour la pagination ou le filtrage

## 3. Objectifs (Definition of Done)
* L'historique des conversations s'affiche dans un panneau dédié, clair et responsive.
* Chaque conversation affiche un aperçu (titre ou premier message, date).
* La navigation entre les conversations est fluide (pas de rechargement complet).
* L'interface reste cohérente avec le design premium existant (dark mode, glassmorphism).

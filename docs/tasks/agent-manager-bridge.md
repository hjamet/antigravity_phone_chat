# Pont CDP Agent Manager

## 1. Contexte & Discussion (Narratif)
> L'exploration CDP a révélé que l'Agent Manager est une target séparée appelée "Launchpad" 
> (`workbench-jetski-agent.html`), accessible sur le même port debug (9000).
> Son DOM contient un input de recherche et une liste de projets récents sous forme de divs cliquables.
> Chaque projet a un nom (`span.text-sm > span`) et un chemin (`span.text-xs.opacity-50 > span`).
>
> L'objectif est d'étendre `server.js` pour gérer une seconde connexion CDP vers le Launchpad,
> exposer des API REST pour lister et ouvrir les projets, et gérer le changement de target workbench
> quand un projet est ouvert.

## 2. Fichiers Concernés
- `server.js` — Ajout de la connexion CDP au Launchpad, nouvelles routes API
- `public/js/app.js` — Appel aux nouvelles routes (depuis le frontend)

## 3. Objectifs (Definition of Done)
* Le serveur peut se connecter à la target "Launchpad" via CDP en parallèle du workbench.
* Route `GET /api/projects` retourne la liste des projets (nom + chemin) extraite du DOM Launchpad.
* Route `POST /api/projects/open` clique sur un projet donné dans le Launchpad pour ouvrir la fenêtre.
* Le serveur détecte la nouvelle fenêtre workbench et s'y ré-attache automatiquement pour le snapshot.
* Gestion gracieuse du cas où le Launchpad n'est pas ouvert (erreur claire pour le client).

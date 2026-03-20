# Fix Sélection des Workspaces

## 1. Contexte & Discussion (Narratif)
> Le bouton "Select Projects" sur l'interface mobile doit lister les workspaces actuellement ouverts dans la sidebar de l'Agent Manager. Actuellement, un clic renvoie "No Workspaces Found" car `listProjects()` dans `manager.js` utilise des **recherches heuristiques par mot-clé** (innerText "Workspaces", bouton contenant "add", items par rôle ARIA) qui sont toutes cassées.
>
> **Cela viole la règle No-Fallback à 3 endroits** :
> 1. Recherche par `innerText === 'Workspaces'` au lieu d'un sélecteur ciblé
> 2. Fallback `button` contenant `add` text
> 3. Sélecteurs mixtes heuristiques pour les items du menu
>
> **Prérequis** : Le script de diagnostic DOM (tâche #15) doit être exécuté pour identifier les bons sélecteurs CSS de la sidebar et du bouton "New Conversation in Workspace".
>
> **Règle absolue** : Sélecteurs ciblés centralisés dans `src/config/selectors.js`, throw Error immédiat si un élément n'est pas trouvé.

## 2. Fichiers Concernés
- `src/cdp/manager.js` — fonctions `listProjects()` et `openProject()` à réécrire
- `src/config/selectors.js` — ajouter les sélecteurs sidebar/workspace sous une section dédiée
- `src/server/routes.js` — routes `GET /api/projects` et `POST /api/projects/open` (adapter si le format change)
- `public/js/projects.js` — adapter l'affichage si le format de données change

## 3. Objectifs (Definition of Done)
* **Les sélecteurs** sont centralisés dans `src/config/selectors.js` sous `sidebar.workspaceList`, `sidebar.newConversationButton`, etc.
* **`listProjects()`** utilise UNIQUEMENT des sélecteurs ciblés, sans aucune recherche par mot-clé
* **Si un sélecteur casse**, une erreur explicite est levée immédiatement : `[CDP] Selector broken: "..." — element not found in listProjects(). Update src/config/selectors.js`
* **Le frontend** affiche les projets disponibles correctement
* **Vérifiable** : Ouvrir un projet dans Antigravity → "Select Projects" sur mobile affiche ce projet → cliquer dessus l'ouvre

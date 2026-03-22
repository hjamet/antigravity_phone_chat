# Fix Workflow Selection & Auto-Cleanup

## 1. Contexte & Discussion (Narratif)
> Le système de workflow permettait de sélectionner un workflow dans l'interface mobile (via `/`), mais le clic réel n'était pas répercuté dans l'Agent Manager desktop. De plus, si l'utilisateur effaçait le `/` manuellement, le badge workflow restait affiché, créant une confusion visuelle.

- Discussion avec l'utilisateur sur le manque de synchronisation du clic CDP.
- Identification du besoin de nettoyage automatique du badge lors de la suppression du trigger `/`.

## 2. Fichiers Concernés
- `public/js/picker.js` : Ajout de l'appel API `/api/picker/select-workflow` dans `selectWorkflow`.
- `public/js/main.js` : Ajout d'un listener `input` pour détecter la suppression du slash.

## 3. Objectifs (Definition of Done)
* Le clic sur un workflow dans le menu mobile déclenche le clic correspondant dans Agent Manager via CDP.
* Le badge workflow disparaît automatiquement si l'input devient vide (slash supprimé).
* La communication entre le frontend web et le backend CDP est parfaitement synchronisée pour les workflows.

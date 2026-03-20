# Script de Diagnostic DOM

## 1. Contexte & Discussion (Narratif)
> Les sélecteurs CDP qui pilotent l'Agent Manager (auto-ouverture, workspaces, chat snapshot) sont régulièrement cassés par les mises à jour d'Antigravity. Aujourd'hui, on a besoin d'un script de diagnostic robuste qui capture le DOM du Workbench ET du Manager de manière structurée pour faciliter l'identification des bons sélecteurs.
>
> Le script `debug/explore_target.mjs` existe déjà mais exporte uniquement le HTML brut complet — pas pratique pour analyser. Le workflow `inspect-dom.md` documente l'approche mais nécessite un script concret implémenté.

- Le script doit se connecter aux targets CDP (Manager et Workbench)
- Il doit exporter un résumé structuré : IDs, roles, boutons, textes, attributs data-*
- Il doit aussi exporter des sections spécifiques : titlebar, sidebar, zone de chat
- Sortie dans `scratch/` pour ne pas polluer la racine

## 2. Fichiers Concernés
- `debug/capture_dom.mjs` (NEW)
- `debug/explore_target.mjs` (référence existante)
- `.agents/workflows/inspect-dom.md` (mise à jour éventuelle)

## 3. Objectifs (Definition of Done)
* **Script fonctionnel** `debug/capture_dom.mjs` qui, lancé avec `node debug/capture_dom.mjs`, capture le DOM du Manager et du Workbench
* **Sortie structurée** en JSON dans `scratch/` avec :
  - Liste de tous les boutons visibles (texte, title, aria-label, data-tooltip-id)
  - Liste de tous les éléments avec IDs
  - Liste de tous les éléments scrollables
  - Arbre simplifié de la sidebar et de la titlebar
* **Utilisable** par un agent développeur pour corriger les sélecteurs de `manager.js` et `workbench.js`

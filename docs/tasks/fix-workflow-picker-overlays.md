# Fix Workflow Picker Overlays

## 1. Contexte & Discussion (Narratif)
Le retour de l'utilisateur signalait une erreur CDP sur le sélecteur `div[role=...` dans la fonction `triggerPicker()`. Après vérification, il s'avère que l'interface de l'Agent Manager a évolué nativement : la frappe de '/' ou '@' ouvre directement la fenêtre de suggestion ("Typeahead menu") sous forme d'overlay en position absolue, plutôt que d'ouvrir un menu de "Catégories" formel nécessitant un clic intermédiaire.
Le correctif consiste à s'adapter à ce nouveau flux (Single-Step) en supprimant la logique d'attente et de clic sur le menu de configuration initial, tout en ajustant les sélecteurs pour correspondre correctement au DOM contemporain (sans rôle `dialog`).

## 2. Fichiers Concernés
- `src/config/selectors.js`
- `src/cdp/manager.js`

## 3. Objectifs (Definition of Done)
- Supprimer l'obligation de trouver un `div[role="dialog"]` pour la recherche de workflows.
- Permettre à l'historique et au polling CDP de localiser directement la liste `workflowList` en s'orientant vers la pop-up de Typeahead existante.
- Éliminer le crash CDP silencieux qui bloque le système dans `triggerPicker()` et `selectWorkflowItem()`.

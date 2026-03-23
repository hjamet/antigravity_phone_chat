# Fix State Inference during Chat Switch

## 1. Contexte & Discussion (Narratif)

Lorsqu'on change de conversation depuis l'historique (sidebar), deux éléments de l'UI ne se mettent pas à jour correctement :
- Le bouton **Envoyer / Stop** reste figé dans son ancien état (ne détecte pas si le nouveau chat est en cours de génération ou terminé).
- La **barre de raccourcis d'artefacts** conserve les artefacts de la conversation précédente ou reste vide.

L'analyse a révélé 3 causes racines :
1. `captureSnapshot()` dans `src/cdp/manager.js` détecte `isStreaming` via un spinner CSS (`progress_activity`) dans le scroll container, ce qui est fragile pendant les transitions de DOM.
2. `ChatHistoryService.js` ne met à jour `availableArtifacts` que si le snapshot contient une liste non-vide, ce qui empêche de vider les artefacts quand une conversation n'en a légitimement pas.
3. `history.js` émet un event `snapshot-update` qui n'est écouté nulle part dans le code actuel (vestige mort).

## 2. Fichiers Concernés
- `src/cdp/manager.js` (fonction `captureSnapshot`)
- `src/server/services/ChatHistoryService.js` (méthode `processSnapshot`)
- `public/js/history.js` (fonction `selectChat`)
- `src/config/selectors.js` (sélecteur `controls.cancelButton` déjà défini)

## 3. Objectifs (Definition of Done)
* Le bouton Envoyer/Stop reflète **immédiatement** l'état réel de la conversation switchée (en cours ou terminée).
* La barre d'artefacts se met à jour correctement lors d'un switch — elle affiche les artefacts de la nouvelle conversation ou disparaît si aucun artefact n'existe.
* Le code mort (`snapshot-update` event) est nettoyé.
* Aucune régression sur le polling normal (sans switch).

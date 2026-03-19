# Architecture : Sélecteurs CSS de l'Agent Manager

Afin d'éviter que le pont CDP (via `manager.js`) ne se casse silencieusement à la moindre mise à jour de l'interface par Google Deepmind, tous les sélecteurs CSS pertinents pour extraire la **Timeline Chat** sont centralisés.

## Configuration Principale (`src/config/selectors.js`)

Ces sélecteurs sont injectés dynamiquement dans les scripts exécutés sur le navigateur via `Runtime.evaluate`.

### `chat.scrollContainer`
* **Valeur** : `'[class*="scrollbar-hide"][class*="overflow-y"]'`
* **Rôle** : Cible le conteneur principal qui détient l'historique et gère le défilement.
* **Extraction** : Permet de calculer la hauteur de la vue (`scrollTop`, `scrollHeight`).

### `chat.turnsContainer`
* **Valeur** : `'[class*="flex"][class*="flex-col"][class*="gap-y"]'`
* **Rôle** : Cible la liste flex qui contient tous les "tours" (turns) de parole.
* **Extraction** : C'est le parent direct itéré pour extraire chaque message.

### `chat.streamingIndicator`
* **Valeur** : `'[class*="progress_activity"],[class*="animate-spin"],[class*="animate-pulse"]'`
* **Rôle** : Détecte l'animation de chargement indiquant que l'agent génère une réponse (Stream).
* **Extraction** : Permet de définir `isStreaming: true`.

### `user.messageBlock`
* **Valeur** : `'[class*="bg-gray-500"][class*="select-text"]'`
* **Rôle** : Cible les bulles de textes claires entrées par l'utilisateur.
* **Extraction** : Texte brut des requêtes utilisateurs (type `user`).

### `agent.taskBlock`
* **Valeur** : `'.isolate'`
* **Rôle** : Cible les blocs narratifs / d'actions complexes de l'Agent qui incluent souvent des composants custom ou du Markdown formaté.
* **Extraction** : Utilisé pour recomposer l'état interne (`taskTitle`, `taskSummary`, `allStatuses`).

### `agent.directMessage`
* **Valeur** : `'.select-text.leading-relaxed'`
* **Rôle** : Cible les réponses directes textuelles de l'agent n'utilisant pas les blocs isolés (utilisé par exemple pour `notify_user` simples).
* **Extraction** : Texte de réponse standard de l'IA (type `agent`).

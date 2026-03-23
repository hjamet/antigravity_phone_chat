# [TASK] Correction Autoplay Mobile TTS & Bouton Play/Stop

> **[Terminé]** Mises à jour : bouton manuel injecté dans `ui.js`, logiques `playTTS` et `stopTTS` globales sur `main.js`, CSS inline avec état `playing` ajouté dans `style.css`.

## 1. Contexte & Discussion (Narratif)
> *Suite à des tests sur téléphone, le TTS (Text-To-Speech) ne fonctionnait pas en raison des politiques strictes de blocage d'autoplay (asynchrone) sur iOS/Android.*
- L'application tentait de jouer l'audio via la boucle de polling `pollChatState()` de façon asynchrone, ce qui entraînait une erreur `NotAllowedError` sur mobile.
- L'erreur était silencieusement interceptée, faisant disparaître arbitrairement l'indicateur visuel TTS sans feedback.
- Pour régler le problème proprement et améliorer l'UX, l'utilisateur a décidé d'ajouter un bouton explicite "Play/Stop" attaché aux réponses finales de l'agent.

## 2. Fichiers Concernés
- `public/js/main.js` (Logique de gestion audio : play, stop, queue, capture des erreurs persistantes)
- `public/js/ui.js` (Injection du bouton de lecteur dans le DOM des messages finaux de l'agent)
- `public/css/style.css` (Style de l'icône / bouton "Play TTS")

## 3. Objectifs (Definition of Done)
* Les tentatives d'autoplay échouant de manière asynchrone doivent être supprimées ou proposer un fallback propre.
* L'interface doit injecter un nouveau bouton (icône Play) à côté ou en bas des messages définitifs de l'agent.
* Au clic (interaction utilisateur explicite qui débloque les navigateurs webkits !), déclencher la lecture TTS pour *ce message spécifique*.
* Pendant la lecture, le bouton devient une version "Stop" (et l'indicateur global reste visible).
* Mettre fin à la lecture (via clic sur "Stop" ou bouton off) arrête le son et réinitialise l'icône Play.

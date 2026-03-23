# Lecture Auto TTS

## 1. Contexte & Discussion (Narratif)
> *Inspire-toi du style "Handover" : Raconte pourquoi on fait ça.*
- L'utilisateur souhaitait un feedback audio naturel lorsque l'agent a fini de répondre.
- La décision s'est portée sur le Web Speech API (`window.speechSynthesis`) pour de la lecture vocale (TTS) automatique côté client, offrant une réactivité immédiate dès réception de la notification de fin de message.
- Ajout d'un bouton permettant d'activer ou désactiver cette lecture par défaut, directement dans la barre de réglages rapides.

## 2. Fichiers Concernés
- `public/index.html`
- `public/js/ui.js`
- `public/js/main.js`

## 3. Objectifs (Definition of Done)
* Un bouton `TTS` est présent dans l'interface, juste à côté de la sélection de composants (Modèles/Modes).
* À la réception du dernier message de l'agent signalant la fin de la génération, le message textuel "nettoyé" de ses caractères superflus (markdown) est lu à haute voix par le navigateur.
* L'état du TTS (On/Off) est mémorisé (via `localStorage`) pour éviter une reconfiguration à chaque rafraîchissement.

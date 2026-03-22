# Fix New Chat Button

## Contexte & Discussion
L'utilisateur a signalé que le bouton "+" (New Chat) ne permettait pas d'envoyer de messages. L'exploration a révélé que la page "Nouvelle Conversation" (qui s'affiche à la création d'un chat ou à l'ouverture d'un projet sans historique) possède un DOM légèrement différent : le bouton d'envoi change d'identifiant (`tooltip-id`) et la zone de scroll des messages n'existe pas encore.

## Fichiers Concernés
- `src/config/selectors.js` : Sélecteur du bouton submit.
- `src/cdp/manager.js` : Fonction `captureSnapshot` et `injectMessage`.
- `README.md` : Mise à jour de la roadmap.

## Objectifs (DoD)
- [x] Le bouton submit est trouvé sur une page Nouvelle Conversation.
- [x] L'envoi de message fonctionne sur une page Nouvelle Conversation.
- [x] `captureSnapshot` ne crash pas sur une page sans historique.
- [x] Le flux "New Chat" est fluide de bout en bout.

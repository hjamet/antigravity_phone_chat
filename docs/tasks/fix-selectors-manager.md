# Fix Selectors Manager

## 1. Contexte & Discussion
- L'utilisateur s'est plaint qu'aucun bouton ni envoi de message ne fonctionnait, malgré l'indication d'une connexion réussie à Antigravity.
- Bien que le système marchait parfaitement sur un ancien poste, l'installation actuelle de l'Agent Manager (ou une mise à jour d'Antigravity) a supprimé l'ID `antigravity.agentSidePanelInputBox` et remplacé la classe `scrollbar-hide` du conteneur de messages par des classes Tailwind génériques.
- En accord avec notre politique "No Fallback" (Fail Fast), `manager.js` levait des erreurs explicites lors de ses tentatives d'injection et de lecture au lieu d'échouer silencieusement.

## 2. Fichiers Concernés
- `src/config/selectors.js`
- `README.md`

## 3. Objectifs (Definition of Done)
- Inspecter le DOM actuel de l'Agent Manager via un dump CDP (`test_cdp.js`).
- Mettre à jour `chat.scrollContainer` pour utiliser `[class*="overflow-y"]`.
- Mettre à jour le noeud racine de l'input `controls.inputBox` pour utiliser un conteneur générique résilient (`body`) qui servira de point de départ pour l'éditeur et le bouton d'envoi.
- Assurer la fonctionnalité de l'application mobile de bout en bout pour le chat.

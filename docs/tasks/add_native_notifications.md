# Ajout des Notifications Natives

## 1. Contexte & Discussion (Narratif)
L'utilisateur a fait remarquer que bien qu'une jolie notification s'affiche dans l'interface (le toast UI) lorsque l'agent a terminé de répondre, aucune notification native au niveau du système d'exploitation ne prévient l'utilisateur s'il se trouve sur un autre onglet ou une autre application.

L'objectif est d'utiliser l'API Web Notification pour déclencher une notification push sur le bureau/mobile afin que l'utilisateur soit alerté instantanément de la fin de la réponse de l'agent.

## 2. Fichiers Concernés
- `public/js/main.js`

## 3. Objectifs (Definition of Done)
- Lorsqu'un utilisateur interagit avec le chat (par ex. en envoyant un message), le navigateur lui demande la permission d'afficher des notifications (si non accordé précédemment).
- Lorsque l'agent finit de générer sa réponse (`isStreaming` passe de vrai à faux), une notification OS "Antigravity - ✅ Agent a terminé de répondre" apparaît avec l'icône du projet.
- L'ancienne notification "toast" UI continue de fonctionner comme avant en parallèle.

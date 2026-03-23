# Server-Side TTS 

## 1. Contexte & Discussion (Narratif)
> L'API Web Speech native des navigateurs mobiles (`SpeechSynthesis`) s'est révélée trop restrictive et capricieuse pour une application background/PWA (blocages liés aux stratégies d'Autoplay, pause automatique de l'audio-context, pertes aléatoires de contexte phonétique, etc.). 
 L'Architecte et l'utilisateur ont validé une migration vers une synthèse vocale côté serveur. Le serveur générera le flux audio (MP3) ou construira des URLs distantes (ex: Google TTS non-officiel) et enverra la donnée au frontend, qui se contentera d'utiliser une simple balise `<audio>` HTML5. Une simple lecture neutre de `<audio>` au moment d'un clic utilisateur suffit généralement à déverrouiller définitivement la lecture asynchrone pour le reste de la session.

## 2. Fichiers Concernés
- `package.json` (ajout éventuel d'un package TTS)
- `src/server/routes.js`
- `public/js/main.js`
- `public/index.html` (ajout de la balise `<audio>`)

## 3. Objectifs (Definition of Done)
*   **API Serveur** : Disposer d'une route `POST /api/tts` qui reçoit le texte brut de l'agent.
*   **Génération Audio** : La route renvoie une chaîne MP3 (Base64) ou un tableau d'URLs audio prêtes à être lues chronologiquement par le client.
*   **Déverrouillage Client** : Lors d'une interaction utilisateur (ex: "Envoyer"), la balise `<audio>` client est initialisée (`.play()` silencieux) pour autoriser la lecture future.
*   **Lecture Asynchrone Fiable** : À l'issue d'une génération de réponse, le client reçoit la réponse TTS et lit l'audio avec un taux de succès de 100% sur mobile.

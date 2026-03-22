# Transcription Vocale (Voice-to-Text) 🎤

## 1. Contexte & Discussion (Narratif)
> *L'usage mobile d'un agent IA est souvent dicté par la mobilité : taper du texte sur un clavier virtuel est fatiguant et lent. La transcription vocale permet une interaction plus naturelle et immédiate.*

L'idée est d'ajouter un bouton "Micro" dans la zone d'input du Phone Connect. Ce bouton déclenchera l'enregistrement audio via le navigateur (WebAudio API). Le flux audio sera soit :
- **Option A** : Transcrit localement par le navigateur (`SpeechRecognition` API) pour une latence zéro.
- **Option B** : Envoyé au serveur Node.js pour traitement via un modèle Whisper (local ou API) pour une précision maximale.

L'Architecte recommande de privilégier la précision pour un usage professionnel de l'agent.

## 2. Fichiers Concernés
- `public/js/main.js` : Gestion de l'audio button click.
- `public/js/audio.js` [NEW] : Module de capture et traitement audio.
- `src/server/routes.js` : Route `/api/audio/transcribe` [NEW].
- `public/index.html` : Intégration du bouton micro (Google Symbol 'mic').
- `src/config/selectors.js` : Sélecteur pour le mic button (`controls.audioButton`).

## 3. Objectifs (Definition of Done)
* **Capture** : L'utilisateur peut enregistrer un segment audio clair depuis son téléphone.
* **Transcription** : Le texte transcrit remplit automatiquement l'input box du chat.
* **Injection** : Le message peut être envoyé à Antigravity après correction manuelle.
* **UX** : Un indicateur visuel (pulse-animation) montre que l'enregistrement est en cours.

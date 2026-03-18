# Transcription Vocale Mobile

## 1. Contexte & Discussion (Narratif)
> L'utilisateur souhaite à terme intégrer un système de transcription vocale dans l'interface mobile.
> Cela permettrait de dicter ses messages au lieu de les taper sur le petit clavier du téléphone.
> C'est une feature "future" — pas urgente, mais à planifier.
>
> Options techniques possibles :
> - Web Speech API (native browser, gratuit, mais qualité variable)
> - Whisper.js (local, haute qualité, mais WASM/ML lourd)
> - Service cloud (Google STT, OpenAI Whisper API — nécessite clé API)

## 2. Fichiers Concernés
- `public/index.html` — Bouton micro dans la barre d'input
- `public/js/app.js` — Logique d'enregistrement et transcription
- `public/css/style.css` — Animation du bouton micro (recording state)

## 3. Objectifs (Definition of Done)
* Un bouton micro est visible à côté de la zone de saisie.
* En appuyant, le micro enregistre la voix de l'utilisateur.
* Le texte transcrit apparaît dans la zone de saisie.
* L'utilisateur peut éditer avant d'envoyer.

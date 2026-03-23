# Bouton Sélecteur de Workflow Mobile

## 1. Contexte & Discussion (Narratif)
> L'utilisateur a remarqué que sur téléphone, taper le caractère `/` avec le clavier virtuel pour accéder à la liste des agents/workflows est fastidieux. L'objectif est de simplifier l'UX en ajoutant un bouton dédié, clair et accessible, qui ouvrira la liste des workflows sans requérir la saisie manuelle de la "slash command". Côté serveur, le fonctionnement doit rester transparent (le système continuera d'injecter `/` dans l'Agent Manager de l'ordinateur via CDP).

## 2. Fichiers Concernés
- `public/index.html`
- `public/css/style.css`
- `public/js/picker.js`
- `public/js/ui.js`

## 3. Objectifs (Definition of Done)
*   **Accessibilité UX** : Un nouveau bouton ⚡ (ou similaire) doit être présent dans la zone de saisie (à côté du placeholder ou du bouton micro).
*   **Déclenchement direct** : Appuyer sur ce bouton appelle la fonction d'invocation des workflows existante côté frontend, affichant la liste des options à l'écran.
*   **Non-régression CDP** : La logique serveur / CDP (`manager.js`) qui écoute et intercepte le caractère `/` ne doit subir aucune modification majeure, garantissant la compatibilité avec Antigravity Desktop.
*   **Annulation facile** : La gestion d'annulation d'un workflow sélectionné (le badge) doit bien s'intégrer visuellement aux côtés de ce nouveau bouton en responsive.

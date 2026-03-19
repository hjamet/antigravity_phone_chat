# Refactoring complet vers Agent Manager

## 1. Contexte & Discussion (Narratif)
> *Handover* : On a découvert que l'Agent Manager (ou Manager CDP target) est bien plus puissant et riche en données que le Workbench standard. On a déjà migré le Chat History avec succès, prouvant que le Manager expose tout (workspaces, conversations, timestamps) de manière structurée.

L'objectif de cette tâche est de faire de l'Agent Manager la **source unique de vérité** pour toute l'application Antigravity Phone Connect, supprimant toute dépendance directe au Workbench pour les snapshots et les injections de messages.

## 2. Fichiers Concernés
- `server.js`
- `public/js/app.js`
- `docs/index_tasks.md`

## 3. Objectifs (Definition of Done)
*   **Source Unique** : `cdpConnections.workbench` ne doit plus être utilisé pour les fonctionnalités coeur.
*   **Snapshots Manager** : Capturer les snapshots HTML/UI directement depuis le Manager.
*   **Injection Manager** : Envoyer les messages via le champ input du Manager.
*   **Mode/Model Sync** : Synchroniser le mode (Planning/Fast) et le modèle via le sélecteur du Manager.
*   **Performance** : Réduire la latence en évitant les allers-retours entre deux targets CDP différents.

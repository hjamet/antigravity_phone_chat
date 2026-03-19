# Validation des Snapshots & Tests d'Extraction CDP

## 1. Contexte & Discussion (Narratif)
> Le problème fondamental de l'application est qu'on ne sait jamais si les données extraites du DOM sont correctes. L'agent IA écrit des messages, des titres, des résumés — et le script CDP tente de les retrouver dans le DOM. Mais aucun test ne vérifie si l'extraction fonctionne.
>
> L'utilisateur a proposé une idée brillante : **l'agent connaît ses propres écrits**. Il sait quel titre il vient de donner à sa tâche, quel commentaire il vient d'écrire. Il peut donc appeler la méthode d'extraction et vérifier que le résultat correspond à ce qu'il a écrit.
>
> Concrètement : après chaque `task_boundary` ou `notify_user`, l'agent exécute un appel à l'API de snapshot et compare les `taskTitle`, `taskSummary`, `taskStatus` retournés avec ce qu'il a envoyé.
>
> Cela nécessite aussi l'installation de `zod` pour valider le schéma du snapshot (les champs obligatoires, les types, etc.) de façon déclarative.

## 2. Fichiers Concernés
- `src/server/services/ChatHistoryService.js` — Ajout de la couche de validation Zod
- `src/schemas/snapshot.js` — **[NEW]** Schéma Zod du snapshot et des messages
- `package.json` — Ajout de la dépendance `zod`
- `tests/` — **[NEW]** Dossier de tests (ou scripts de validation)

## 3. Objectifs (Definition of Done)
* Un schéma Zod décrit la structure attendue d'un snapshot et de chaque type de message (`taskBlock`, `directMessage`, `user`).
* Chaque snapshot reçu du CDP est validé par ce schéma AVANT d'être inséré dans la timeline.
* Si la validation échoue, une alerte claire est loggée côté serveur ("DOM SCRAPING MISMATCH — sélecteurs probablement obsolètes").
* L'agent peut appeler un endpoint dédié (ou une méthode interne) pour comparer ses derniers écrits (titre, résumé) avec ce que l'extraction a retourné.
* Les données invalides ne polluent jamais la timeline envoyée au front.

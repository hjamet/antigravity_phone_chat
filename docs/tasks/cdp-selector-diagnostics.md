# Diagnostic d'erreur sélecteur CDP (Streamlit-style)

## 1. Contexte & Discussion (Narratif)
> *Handover* : Jusque-là, quand un sélecteur CDP cassait (suite à une mise à jour d'Antigravity), l'erreur était "silencieuse" pour l'utilisateur mobile. Il fallait regarder les logs du serveur pour comprendre. 

L'utilisateur a demandé un système d'alerte visuel et proactif. L'idée est d'imiter le comportement de Streamlit en cas d'erreur : une bannière rouge/orange qui bloque le flux et donne tous les outils pour réparer immédiatement.

Décisions prises :
- Overwrite du snapshot DOM (`debug/crash_dom.html`) pour ne pas saturer le disque.
- Arrêt immédiat du polling serveur pour éviter de spammer les erreurs.
- Génération d'un rapport markdown "LLM-ready" pour copier-coller la solution.

## 2. Fichiers Concernés
- `src/cdp/selector_error.js` (Nouveau) : Logique de diagnostic.
- `src/cdp/manager.js` : Capture et callback d'erreur.
- `server.js` : Gestion de l'état (Pause/Resume).
- `src/server/routes.js` : Routes `/dom` et `/reset`.
- `public/js/selectorError.js` (Nouveau) : UI de la bannière.
- `public/css/style.css` : Styles de la bannière.
- `public/js/main.js` & `public/js/ws.js` : Intégration WebSocket.

## 3. Objectifs (Definition of Done)
* **Visibilité** : Une erreur de sélecteur doit être immédiatement visible sur le téléphone.
* **Instruction** : L'erreur doit indiquer quel sélecteur a échoué et dans quelle fonction.
* **Réparabilité** : Le rapport copiable doit contenir assez d'infos (racine commune + lien snapshot) pour qu'un LLM génère le correctif sans intervention humaine complexe.
* **Contrôle** : L'utilisateur peut relancer le polling manuellement après avoir vu l'erreur.

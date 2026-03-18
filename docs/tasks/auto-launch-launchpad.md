# Auto-lancement du Launchpad (Agent Manager)

## 1. Contexte & Discussion (Narratif)
> Actuellement, la fenêtre Agent Manager (Launchpad) ne s'ouvre pas automatiquement au démarrage d'Antigravity.
> Pour que le serveur Phone Connect puisse lister les projets et permettre le changement de projet depuis le mobile,
> il faut que cette fenêtre soit ouverte. L'idéal serait de la déclencher automatiquement au démarrage du serveur
> via CDP, en simulant le raccourci clavier ou l'action qui ouvre le Launchpad.
>
> L'exploration CDP a montré que le sélecteur dans la barre de titre est :
> `#workbench.parts.titlebar > div > div.titlebar-right > div.action-toolbar-container > a`
> Ce bouton ouvre le Launchpad (target `workbench-jetski-agent.html`).

## 2. Fichiers Concernés
- `server.js` — Logique d'ouverture automatique du Launchpad via CDP
- `start_ag_phone_connect.bat` / `.sh` — Éventuellement, vérifier/lancer le Launchpad au boot

## 3. Objectifs (Definition of Done)
* Au démarrage du serveur, si le Launchpad n'est pas déjà ouvert, le serveur le lance via CDP (clic sur le bouton titlebar ou raccourci).
* Le serveur attend que la target Launchpad apparaisse dans la liste CDP avant de continuer.
* Si le Launchpad est déjà ouvert, pas d'action (idempotent).

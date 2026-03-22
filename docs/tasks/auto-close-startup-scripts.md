# Auto-fermeture des scripts de démarrage

## 1. Contexte & Discussion (Narratif)
L'utilisateur souhaitait que la fenêtre CMD utilisée pour lancer Antigravity se ferme automatiquement après l'ouverture de l'application. Auparavant, le script restait bloqué sur le processus Python du `launcher.py`, ce qui maintenait la fenêtre ouverte inutilement. De plus, un avertissement concernant le port de débogage s'affichait systématiquement dans le terminal, polluant la sortie.

## 2. Fichiers Concernés
- `startup_scripts/start_ag_phone_connect_web.bat`
- `startup_scripts/start_ag_phone_connect.bat`

## 3. Objectifs (Definition of Done)
* **Détachement des processus** : Utilisation de la commande `start ""` pour lancer Antigravity et le launcher Python dans des processus séparés, permettant au script batch parent de se terminer.
* **Suppression des avertissements** : Redirection de la sortie d'erreur (`2>nul`) pour l'appel à Antigravity afin de masquer l'avertissement `remote-debugging-port`.
* **Fermeture automatique** : Ajout de la commande `exit` en fin de script et suppression des `pause` bloquants.

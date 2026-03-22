# Antigravity Phone Connect 📱

Un pont de contrôle à distance pour l'application de bureau Antigravity, permettant d'accéder à vos sessions IA depuis votre téléphone via un tunnel sécurisé.

## 1. Présentation
Antigravity Phone Connect transforme votre smartphone en un "viewport sans fil" pour votre instance Antigravity Desktop. Il utilise le protocole CDP pour miroir l'interface, permettant d'envoyer des messages, changer de modèle, et consulter l'historique sans exposer vos jetons d'authentification ou vos APIs directement sur le web.

## 2. # Installation
```bash
npm install
node server.js
```
*Pré-requis : Antigravity Desktop lancé avec `--remote-debugging-port=9000`.*

## 3. # Configuration
Les variables d'environnement sont gérées dans le fichier `.env` :

| Variable | Description |
|----------|-------------|
| `APP_PASSWORD` | Mot de passe pour l'accès mobile |
| `CLOUDFLARE_TUNNEL_ID` | UUID de votre tunnel Cloudflare |
| `TUNNEL_PUBLIC_URL` | URL publique de votre interface |
| `PORT` | Port local (défaut: 3000) |

## 4. # Description détaillée
L'application agit comme un proxy intelligent :
- **Backend (Node.js)** : Architecture en couches modulaire. `server.js` (Bootstrap), `routes.js` (Présentation API), et `ws.js` (WebSockets).
- **Service (Métier)** : `src/server/services/ChatHistoryService.js` gère la chronologie et valide les données.
- **Validation (Zod)** : `src/schemas/snapshot.js` assure que toutes les données extraites respectent le format attendu.
- **Scripts CDP** : `src/cdp/manager.js` extrait le contenu du DOM via des **sélecteurs CSS stricts** (no-fallback) centralisés dans `src/config/selectors.js`. Diagnostics via `src/cdp/ui_inspector.js`.
- **Messages utilisateur** : Stockés en `localStorage` côté client quand envoyés, car la virtualisation du DOM de l'Agent Manager empêche leur extraction fiable.
- **Tunneling (Cloudflare)** : Expose l'interface mobile via un tunnel sécurisé avec mot de passe.
- **Frontend (ES Modules)** : Interface découpée en modules indépendants (`public/js/`) — seuls les 2 derniers messages (user + agent) sont affichés.
- **Fix New Chat** : Support complet de la page "Nouvelle Conversation" (DOM vide) et envoi de message.
- **Extraction Intelli** : Capture des blocs tâches, réflexions et messages directes de l'agent.
- **Artefacts & Commentaires** : Visualisation des artefacts Antigravity avec rendu markdown fidèle. Ajout de **commentaires contextuels rapides** (sélection de texte web instancie via CDP le visualiseur Lexical dans Agent Manager) en plus des boutons d'accès rapide.
- **Smart Scrolling** : Scroll forcé dans l'Agent Manager (CDP). Interface web avec auto-scroll intelligent (seulement si en bas) et notification toast « ✅ Réponse reçue » à la fin du streaming.
- **PWA Installable** : L'application est installable sur Android (et tout navigateur compatible PWA) avec un manifest W3C, un Service Worker et une bannière d'installation personnalisée.

## 5. # Principaux résultats
| Feature | État | Source de vérité |
|---------|------|------------------|
| Chat Reflection | ✅ Stable | Agent Manager CDP |
| Chat History | ✅ Enrichi | Agent Manager CDP |
| Project Selector | ✅ Stable | Agent Manager CDP |
| Mode/Model Sync | ✅ Stable | Agent Manager CDP |
| Artifacts Viewer | ✅ Nouveau | Agent Manager CDP |
| Smart Scrolling & Notifications | ✅ Nouveau | CDP + Frontend |
| PWA Installable | ✅ Nouveau | manifest.json + sw.js |

## 6. # Documentation Index
| Titre (Lien) | Description |
|--------------|-------------|
| [Index des Tâches](docs/index_tasks.md) | Liste exhaustive des spécifications et de la roadmap |
| [Index Doc](docs/index_docs.md) | Index de la documentation technique et de design |
| [Index Architecture](docs/index_architecture.md) | Index des détails techniques, flux de données et configurations |

## 7. # Plan du repo
```text
.
├── src/
│   ├── cdp/              # Scripts d'injection CDP (manager.js, workbench.js, ui_inspector.js)
│   ├── config/           # Configuration centralisée (selectors.js)
│   ├── schemas/          # Schémas Zod de validation (snapshot.js)
│   └── server/
│       ├── services/     # Couche métier (ChatHistoryService.js)
│       ├── routes.js     # API REST (Express)
│       └── ws.js         # WebSockets
├── public/
│   ├── js/               # Frontend modulaire (ESM: main, chat, ui, history, projects, picker, artifacts)
│   ├── icons/            # Icônes PWA (192x192, 512x512)
│   ├── manifest.json     # Manifest W3C pour PWA
│   └── sw.js             # Service Worker (cache & offline)
├── docs/                 # Documentation détaillée et spécifications
├── scripts/              # Utilitaires Node.js (dont generate_ssl.js)
├── startup_scripts/      # Scripts de lancement (.bat, .sh, launcher.py)
├── certs/                # Certificats SSL auto-signés (gitignored)
└── server.js             # Serveur de bridge (EntryPoint - Bootstrap)
```

## 8. # Scripts d'entrée principaux
| Commande | Description |
|----------|-------------|
| `node server.js` | Lance le serveur de bridge local |
| `npm run dev` | Mode développement avec rechargement |

## 9. # Scripts exécutables secondaires
| Commande | Description |
|----------|-------------|
| `node scripts/generate_ssl.js` | Génère les certificats HTTPS |
| `python startup_scripts/launcher.py` | Lance le gestionnaire de pont (Supervisor) |

## 10. # Roadmap
| # | Tâche | Statut | Spec |
|---|-------|--------|------|
| 1 | Auto-lancement Manager | ✅ Fait | [auto-launch-launchpad.md](docs/tasks/auto-launch-launchpad.md) |
| 2 | Pont CDP Manager | ✅ Fait | [agent-manager-bridge.md](docs/tasks/agent-manager-bridge.md) |
| 3 | Gestion de Workspace | ✅ Fait | [create-open-workspace.md](docs/tasks/create-open-workspace.md) |
| 4 | Chat par Projet | ✅ Fait | [chat-in-project.md](docs/tasks/chat-in-project.md) |
| 5 | **Chat History enrichi** | ✅ Fait | [chat-history-ui.md](docs/tasks/chat-history-ui.md) |
| 6 | Cleanup UI Mobile | ✅ Fait | [cleanup-ui-mobile.md](docs/tasks/cleanup-ui-mobile.md) |
| 7 | Interface Projets Mobile | ✅ Fait | [project-selector-ui.md](docs/tasks/project-selector-ui.md) |
| 8 | **Refactoring Structurel** | ✅ Fait | [structural-refactoring.md](docs/tasks/structural-refactoring.md) |
| 9 | **Migration Agent Manager** | ✅ Fait | [agent-manager-refactoring.md](docs/tasks/agent-manager-refactoring.md) |
| 10 | **Extraction Routes Express** | ✅ Fait | [extract-express-routes.md](docs/tasks/extract-express-routes.md) |
| 11 | **Nettoyage Repo & Alignement** | ✅ Fait | [repo-cleanup.md](docs/tasks/repo-cleanup.md) |
| 12 | **Refonte API & Architecture en Couches** | ✅ Fait | [api-layered-architecture.md](docs/tasks/api-layered-architecture.md) |
| 13 | **Extraction Sélecteurs CSS** | ✅ Fait | [selector-config-extraction.md](docs/tasks/selector-config-extraction.md) |
| 14 | **Validation Snapshots & Tests (Zod)** | ✅ Fait | [snapshot-validation-tests.md](docs/tasks/snapshot-validation-tests.md) |
| 15 | **Diagnostic DOM — Script de capture** | ✅ Fait | [dom-diagnostic-script.md](docs/tasks/dom-diagnostic-script.md) |
| 16 | **Fix Auto-Ouverture Manager** | ✅ Fait | [fix-auto-open-manager.md](docs/tasks/fix-auto-open-manager.md) |
| 17 | **Fix Sélection Workspaces** | ✅ Fait | [fix-workspace-selection.md](docs/tasks/fix-workspace-selection.md) |
| 18 | **Nettoyage fichiers debug** | ✅ Fait | [cleanup-debug-files.md](docs/tasks/cleanup-debug-files.md) |
| 19 | **Nettoyage routes (Dette)** | ✅ Fait | [cleanup-routes-debug.md](docs/tasks/cleanup-routes-debug.md) |
| 20 | **Refonte Extraction Chat (No-Fallback)** | ✅ Fait | [refactor-chat-extraction-selectors.md](docs/tasks/refactor-chat-extraction-selectors.md) |
| 21 | **Refactoring Commandes CDP (No-Fallback)** | ✅ Fait | [refactor-cdp-controls-nofallback.md](docs/tasks/refactor-cdp-controls-nofallback.md) |
| 22 | **Auto-fermeture des scripts** | ✅ Fait | [auto-close-startup-scripts.md](docs/tasks/auto-close-startup-scripts.md) |
| 23 | **Fix Sélection Workflow** | ✅ Fait | [fix-workflow-selection.md](docs/tasks/fix-workflow-selection.md) |
| 24 | **Artefacts & Commentaires** | ✅ Fait | [artifacts-viewer.md](docs/tasks/artifacts-viewer.md) |
| 25 | **Fix Erreur Syntaxe Démarrage** | ✅ Fait | [fix-startup-syntax-error.md](docs/tasks/fix-startup-syntax-error.md) |
| 26 | **PWA Installable (Logo & Install)** | ✅ Fait | — |
| 🔮 | Transcription Vocale | 💤 Futur | [voice-transcription.md](docs/tasks/voice-transcription.md) |

---
*Licensed under GNU GPL v3. Copyright (C) 2026 Krishna Kanth B.*

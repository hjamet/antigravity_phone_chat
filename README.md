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
- **Backend (Node.js)** : Se connecte aux instances CDP (Workbench & Agent Manager), capture l'état des conversations et injecte les commandes utilisateur.
- **Tunneling (Cloudflare)** : Expose l'interface mobile via un tunnel sécurisé avec mot de passe.
- **Frontend (Vanilla JS)** : Interface mobile réactive optimisée pour l'interaction tactile.

## 5. # Principaux résultats
| Feature | État | Source de vérité |
|---------|------|------------------|
| Chat Reflection | ✅ Stable | Workbench CDP |
| Chat History | ✅ Enrichi | Agent Manager CDP |
| Project Selector | ✅ Stable | Agent Manager CDP |
| Mode/Model Sync | ✅ Stable | Workbench CDP |

## 6. # Documentation Index
| Titre (Lien) | Description |
|--------------|-------------|
| [Index des Tâches](docs/index_tasks.md) | Liste exhaustive des spécifications et de la roadmap |
| [Architecture](CODE_DOCUMENTATION.md) | Détails techniques du flux de données |

## 7. # Plan du repo
```text
.
├── docs/               # Documentation détaillée et spécifications
├── public/             # Frontend (HTML, CSS, JS)
├── certs/              # Certificats SSL auto-signés
├── server.js           # Serveur Express & Logique CDP
└── startup_scripts/    # Utilitaires de lancement
```

## 8. # Scripts d'entrée principaux
| Commande | Description |
|----------|-------------|
| `node server.js` | Lance le serveur de bridge local |
| `npm run dev` | Mode développement avec rechargement |

## 9. # Scripts exécutables secondaires
| Commande | Description |
|----------|-------------|
| `node generate_ssl.js` | Génère les certificats HTTPS |
| `python bridge_tunnel.py` | (Optionnel) Lance le tunnel Cloudflare |

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
| 8 | **Refactoring Structurel** | 🟡 À faire | [structural-refactoring.md](docs/tasks/structural-refactoring.md) |
| 9 | **Refactoring complet** | 🟡 À faire | [agent-manager-refactoring.md](docs/tasks/agent-manager-refactoring.md) |
| 🔮 | Transcription Vocale | 💤 Futur | [voice-transcription.md](docs/tasks/voice-transcription.md) |

---
*Licensed under GNU GPL v3. Copyright (C) 2026 Krishna Kanth B.*

# Stream Analytics — Kworb × Spotify

![Python](https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.136-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-nginx-2496ed?logo=docker&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003b57?logo=sqlite&logoColor=white)

Outil d'analyse de streams musicaux Spotify. Il collecte automatiquement les données de popularité depuis [Kworb.net](https://kworb.net), les enrichit via l'API Spotify, les stocke en base SQLite, et les expose dans un dashboard React interactif.

---

## Fonctionnalités

- **Pipeline automatisé** — scraping Kworb → enrichissement Spotify → stockage → export
- **Dashboard artiste** — streams totaux, daily, historique sur courbe, répartition solo/feat
- **Analyse par album** — streams par album avec distinction solos / featurings
- **Tableau des titres** — tri, recherche, pagination, export CSV
- **Comparaison multi-artistes** — jusqu'à 4 artistes côte à côte
- **Mise à jour nocturne** — APScheduler relance le pipeline à 3h00 pour tous les artistes en base
- **Export Power BI / Excel / CSV** — données prêtes à l'emploi

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        PIPELINE                             │
│                                                             │
│  Kworb.net ──scraper──▶ SQLite ◀──spotipy── Spotify API    │
│                            │                                │
│                         api.py (FastAPI · port 8000)        │
└─────────────────────────────────────────────────────────────┘
                             │
                    nginx proxy /api/
                             │
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND (React 18 · Docker · port 3000)       │
│                                                             │
│   Home ── Artist ── Compare                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Stack technique

| Couche | Technologie |
|---|---|
| Scraping | Python · BeautifulSoup4 · Requests |
| API Spotify | Spotipy |
| Matching flou | RapidFuzz |
| Backend | FastAPI · Uvicorn · APScheduler |
| Base de données | SQLite (via pandas) |
| Export | openpyxl (Excel) · pyarrow · CSV |
| Frontend | React 18 · React Router · Vite 5 |
| Conteneur | Docker multi-stage · nginx |

---

## Lancement

### Prérequis

- Python 3.12+
- Node 18+ (si dev frontend sans Docker)
- Docker Desktop (pour le frontend en production)
- Clés API Spotify → [developers.spotify.com](https://developers.spotify.com/dashboard)

### 1. Configuration

Créer un fichier `config.py` à la racine (ne jamais committer) :

```python
SPOTIFY_CLIENT_ID     = "ton_client_id"
SPOTIFY_CLIENT_SECRET = "ton_client_secret"
DB_PATH               = "data/spotify.db"
EXPORT_DIR            = "data/exports"
```

### 2. Backend

```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python api.py                  # démarre sur http://localhost:8000
```

### 3. Frontend (Docker)

```bash
docker build -t kworb-frontend -f frontend/dockerfile frontend/
docker run -p 3000:3000 --add-host=host.docker.internal:host-gateway kworb-frontend
```

Ouvrir [http://localhost:3000](http://localhost:3000)

### 4. Frontend (développement local)

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000 avec proxy HMR vers l'API
```

---

## Structure du projet

```
kworb-spotify-project/
├── api.py                  # FastAPI — tous les endpoints REST
├── pipeline.py             # Orchestrateur du pipeline complet
├── config.py               # Credentials (non commité)
├── requirements.txt
│
├── scraper/
│   └── kworb_scraper.py    # Scraping Kworb.net (songs + albums)
│
├── database/
│   ├── db.py               # Schéma SQLite + helpers
│   ├── spotify.py          # Résolution artiste via API Spotify
│   ├── album_enrichment.py # Enrichissement albums (feat/solo)
│   └── spotify_enrichment.py
│
├── export/
│   └── exporter.py         # Export CSV / Excel / Power BI
│
└── frontend/
    ├── dockerfile           # Build multi-stage nginx
    ├── nginx.conf           # Proxy /api/ → FastAPI
    └── src/
        ├── api.js           # Client fetch vers le backend
        └── pages/
            ├── Home.jsx     # Liste des artistes + recherche
            ├── Artist.jsx   # Dashboard artiste complet
            └── Compare.jsx  # Comparaison multi-artistes
```

---

## API — endpoints principaux

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/artists` | Liste tous les artistes en base |
| `GET` | `/artists/{name}` | Stats complètes d'un artiste |
| `GET` | `/artists/{name}/tracks` | Titres avec streams (filtrable) |
| `GET` | `/artists/{name}/albums` | Streams par album |
| `GET` | `/artists/{name}/history` | Historique quotidien des streams |
| `POST` | `/pipeline/run?artist=` | Lance le pipeline pour un artiste |
| `GET` | `/pipeline/status/{artist}` | Statut du pipeline en cours |
| `GET` | `/scheduler/status` | Prochain passage du scheduler |

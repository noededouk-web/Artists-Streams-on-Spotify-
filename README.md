# Stream Analytics — Kworb × Spotify × YouTube

![Python](https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.136-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-nginx-2496ed?logo=docker&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003b57?logo=sqlite&logoColor=white)
![yt-dlp](https://img.shields.io/badge/yt--dlp-YouTube-ff0000?logo=youtube&logoColor=white)
![Render](https://img.shields.io/badge/Deployed-Render.com-46e3b7?logo=render&logoColor=white)

> Tableau de bord analytique pour suivre les streams Spotify et les vues YouTube d'un artiste musical — sans quota, sans abonnement payant.

**Demo en ligne :** [artists-streams-on-spotify-2.onrender.com](https://artists-streams-on-spotify-2.onrender.com)

---

## Pourquoi ce projet ?

Spotify ne publie pas les vrais chiffres de streams via son API officielle (seulement un score de popularité 0–100). Ce projet contourne cette limite en :

1. **Scraping Kworb.net** — site communautaire qui traque les streams Spotify en quasi-temps réel
2. **Enrichissement Spotify API** — métadonnées des tracks (album, durée, pochette)
3. **Vues YouTube via yt-dlp** — sans API key, sans quota, en recherchant `"{artiste} {titre}"` et en prenant la video la plus vue
4. **Dashboard React interactif** — visualisation complète avec graphiques SVG, filtres, export CSV

---

## Fonctionnalites

### Spotify
- **Pipeline automatise** — scraping Kworb → enrichissement Spotify → stockage → export
- **Dashboard artiste** — streams totaux, daily, historique sur courbe SVG, repartition solo/feat
- **Analyse par album** — bar chart streams par album, distinction solos / featurings
- **Page titres unifiee** — filtres Tous / Solo / Feats / Par album, tri, recherche, pagination, export CSV
- **Comparaison multi-artistes** — jusqu'a 4 artistes cote a cote (KPIs, graphiques, top tracks)
- **Mise a jour nocturne** — APScheduler relance le pipeline a 3h00 pour tous les artistes en base

### YouTube
- **Vues YouTube par titre** — yt-dlp recherche la video officielle pour chaque track Spotify
- **Enrichissement automatique** — se lance au premier chargement de la page artiste
- **Colonne vues YouTube** — affichee cote a cote des streams Spotify dans le tableau des titres
- **Lien direct** — clic sur ▶ pour ouvrir la video YouTube

### Social
- **Generateur de cartes Instagram** — image 1080×1080 prete a poster avec top 5 titres, KPIs, et vues YouTube

### General
- **Importation silencieuse** — pipeline invisible avec barre de progression pour les nouveaux artistes
- **Export CSV** — inclut Spotify streams + YouTube views
- **Export Power BI / Excel** — donnees pret a l'emploi
- **Responsive** — optimise pour mobile et desktop

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         PIPELINE SPOTIFY                         │
│                                                                  │
│  Kworb.net ──scraper──▶ SQLite ◀──spotipy── Spotify API         │
│                            │                                     │
│                         api.py (FastAPI · port 8000/10000)       │
└──────────────────────────────────────────────────────────────────┘
                             │
┌──────────────────────────────────────────────────────────────────┐
│                      ENRICHISSEMENT YOUTUBE                      │
│                                                                  │
│  yt-dlp (sans API key, sans quota) → SQLite youtube_streams      │
│  Recherche: "{artiste} {titre}" → top video → view_count         │
└──────────────────────────────────────────────────────────────────┘
                             │
                    nginx proxy /api/
                             │
┌──────────────────────────────────────────────────────────────────┐
│           FRONTEND (React 18 · Docker nginx · port 3000)         │
│                                                                  │
│   Home ── Artist ── Tracks & Albums ── Compare                   │
└──────────────────────────────────────────────────────────────────┘
                             │
┌──────────────────────────────────────────────────────────────────┐
│                    SOCIAL (Pillow)                                │
│                                                                  │
│  social/instagram_card.py → PNG 1080x1080 prete a poster         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Stack technique

| Couche | Technologie |
|---|---|
| Scraping Kworb | Python · BeautifulSoup4 · Requests |
| API Spotify | Spotipy |
| Vues YouTube | yt-dlp (sans cle API, sans quota) |
| Matching flou | RapidFuzz |
| Backend | FastAPI · Uvicorn · APScheduler |
| Base de donnees | SQLite (via pandas) |
| Export | openpyxl (Excel) · pyarrow · CSV |
| Frontend | React 18 · React Router · Vite 5 |
| Conteneur local | Docker multi-stage · nginx |
| Deploiement | Render.com (backend + frontend) |
| Cartes sociales | Pillow (generation d'images PNG) |

---

## Lancement local

### Prerequis

- Python 3.12+
- Node 18+ (dev frontend sans Docker)
- Docker Desktop (frontend en production locale)
- Cles API Spotify → [developers.spotify.com](https://developers.spotify.com/dashboard)

### 1. Variables d'environnement

Les variables sont lues depuis l'environnement. En developpement local, les definir directement
ou via un fichier `.env` (non commite) :

```
SPOTIFY_CLIENT_ID     = ton_client_id
SPOTIFY_CLIENT_SECRET = ton_client_secret
YOUTUBE_API_KEY       = ta_cle_youtube   # optionnel
DB_DIR                = data
```

### 2. Backend

```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python api.py                  # demarre sur http://localhost:8000
```

### 3. Frontend (Docker — recommande)

```bash
docker build -t kworb-frontend frontend/
docker run -d -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e API_URL=http://host.docker.internal:8000 \
  kworb-frontend
```

Ouvrir [http://localhost:3000](http://localhost:3000)

### 4. Frontend (developpement Vite)

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000 avec proxy HMR vers l'API
```

---

## Generateur de cartes Instagram

Genere une image 1080×1080 avec les stats d'un artiste, prete a poster.

```bash
pip install Pillow
python social/instagram_card.py DAMSO
# → social/output/damso_card.png
```

Options :
```bash
python social/instagram_card.py Jul --output jul_card.png
python social/instagram_card.py DAMSO --api https://ton-backend.onrender.com
```

La carte inclut : nom de l'artiste · streams totaux · nombre de titres · vues YouTube cumulees · top 5 titres avec streams · date de generation.

---

## Deploiement (Render.com — gratuit)

### Backend (Web Service)

| Champ | Valeur |
|---|---|
| Runtime | Docker |
| Root Directory | `.` (racine) |
| Variables d'env | `PORT=10000`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` |

### Frontend (Static Site)

| Champ | Valeur |
|---|---|
| Root Directory | `frontend` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |
| Variable d'env | `VITE_API_URL=https://ton-backend.onrender.com` |

> Le free tier Render s'endort apres 15 min d'inactivite (30 sec de demarrage au premier acces).

---

## Structure du projet

```
stream-analytics/
├── api.py                      # FastAPI — tous les endpoints REST
├── pipeline.py                 # Orchestrateur du pipeline Spotify
├── config.py                   # Configuration via variables d'env
├── requirements.txt
├── Dockerfile                  # Image Docker pour le backend
│
├── scraper/
│   ├── kworb_scraper.py        # Scraping Kworb.net (songs + albums)
│   └── kworb_youtube.py        # Scraping Kworb YouTube (optionnel)
│
├── database/
│   ├── db.py                   # Schema SQLite + helpers
│   ├── spotify.py              # Resolution artiste via API Spotify
│   ├── album_enrichment.py     # Enrichissement albums (feat/solo)
│   ├── spotify_enrichment.py   # Enrichissement tracks Spotify
│   └── youtube.py              # Enrichissement vues YouTube (yt-dlp)
│
├── export/
│   └── exporter.py             # Export CSV / Excel / Power BI
│
├── social/
│   ├── instagram_card.py       # Generateur d'images Instagram (Pillow)
│   └── output/                 # Images generees (gitignore)
│
└── frontend/
    ├── Dockerfile              # Build multi-stage nginx
    ├── nginx.conf              # Template proxy /api/ → FastAPI
    ├── vite.config.js          # Config Vite + proxy dev
    └── src/
        ├── api.js              # Client fetch vers le backend
        └── pages/
            ├── Home.jsx        # Liste artistes + recherche unifiee
            ├── Artist.jsx      # Dashboard artiste (Spotify + YouTube)
            ├── Tracks.jsx      # Titres & Albums (filtres, CSV, YouTube)
            ├── Compare.jsx     # Comparaison multi-artistes
            └── YoutubeArtist.jsx  # Page artiste YouTube (Kworb)
```

---

## API — endpoints

### Artistes
| Methode | Endpoint | Description |
|---|---|---|
| `GET` | `/artists` | Liste tous les artistes en base |
| `GET` | `/artists/{name}` | Stats completes d'un artiste |
| `GET` | `/artists/{name}/tracks` | Titres avec streams (filtrable par type/album) |
| `GET` | `/artists/{name}/albums` | Streams par album avec tracks |
| `GET` | `/artists/{name}/history` | Historique quotidien des streams |

### YouTube
| Methode | Endpoint | Description |
|---|---|---|
| `POST` | `/artists/{name}/youtube/enrich` | Lance l'enrichissement YouTube (yt-dlp) |
| `GET` | `/artists/{name}/youtube/enrich/status` | Progression de l'enrichissement |
| `GET` | `/artists/{name}/youtube` | Vues YouTube par titre (depuis DB) |

### Pipeline
| Methode | Endpoint | Description |
|---|---|---|
| `POST` | `/pipeline/run?artist=` | Lance le pipeline Spotify |
| `GET` | `/pipeline/status/{artist}` | Statut du pipeline en cours |
| `GET` | `/scheduler/status` | Prochain passage du scheduler nocturne |
| `GET` | `/health` | Diagnostic DB et tables |

---

## Notes importantes

### Streams Spotify
Les donnees viennent de Kworb.net qui reflète les chiffres Spotify en temps quasi-reel.
Spotify procede regulierement a des audits de streams (suppression de streams artificiels),
ce qui peut provoquer des baisses visibles dans l'historique — comportement normal.

### Vues YouTube
L'enrichissement YouTube utilise **yt-dlp** (sans cle API, sans quota) :
- Recherche `"{artiste} {titre}"` → prend la video avec le plus de vues
- ~2 min pour 50 tracks (2 workers en parallele sur le free tier Render)
- Les vues YouTube sont les vues de la video officielle, pas les streams audio

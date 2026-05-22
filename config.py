"""
config.py — Configuration via variables d'environnement.
Les secrets sont definis dans Render / Fly.io (Environment Variables).
Pour le developpement local, creer un fichier .env ou definir les vars.
"""

import os

# =========================
# SPOTIFY API
# =========================

SPOTIFY_CLIENT_ID:     str = os.getenv("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET: str = os.getenv("SPOTIFY_CLIENT_SECRET", "")

# =========================
# YOUTUBE API
# =========================

YOUTUBE_API_KEY: str = os.getenv("YOUTUBE_API_KEY", "")

# =========================
# BASE DE DONNEES
# =========================

DB_DIR:  str = os.getenv("DB_DIR",  "data")
DB_NAME: str = os.getenv("DB_NAME", "spotify.db")
DB_PATH: str = os.path.join(DB_DIR, DB_NAME)

# =========================
# EXPORTS
# =========================

EXPORT_DIR: str = os.getenv("EXPORT_DIR", os.path.join("data", "exports"))

EXPORT_STREAMS_FILE: str = "streams_by_track.csv"
EXPORT_ALBUMS_FILE:  str = "streams_by_album.csv"
EXPORT_TRACKS_FILE:  str = "spotify_tracks.csv"
EXPORT_STATS_FILE:   str = "artist_stats.csv"
EXPORT_MASTER_FILE:  str = "master.xlsx"

# =========================
# SCRAPING
# =========================

API_DELAY:       float = float(os.getenv("API_DELAY", "0.1"))
FUZZY_SCORE_MIN: int   = int(os.getenv("FUZZY_SCORE_MIN", "75"))
KWORB_BASE_URL:  str   = "https://kworb.net/spotify/artist"

"""
api.py — FastAPI wrapper autour du pipeline Kworb-Spotify.

Endpoints :
    GET /artists                        → liste des artistes en DB
    GET /artists/{name}                 → stats complètes d'un artiste
    GET /artists/{name}/tracks          → tous les titres avec streams
    GET /artists/{name}/albums          → streams par album + tracks
    POST /pipeline/run?artist={name}    → lance le pipeline en arrière-plan

Lancement :
    python api.py
    uvicorn api:app --reload --port 8000
"""

import os
import re
import sqlite3
from contextlib import asynccontextmanager

import pandas as pd
import uvicorn
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from config import DB_PATH
from pipeline import run_pipeline


# =========================
# SCHEDULER NOCTURNE
# =========================

scheduler = BackgroundScheduler(timezone="Europe/Paris")

def _nightly_scrape():
    """Scrape automatiquement tous les artistes en DB à 3h du matin."""
    conn = sqlite3.connect(DB_PATH)
    names = pd.read_sql_query("SELECT artist_name FROM artists ORDER BY artist_name", conn)["artist_name"].tolist()
    conn.close()
    print(f"[scheduler] Lancement scraping nocturne — {len(names)} artiste(s)")
    for name in names:
        if pipeline_jobs.get(name, {}).get("status") == "running":
            continue
        try:
            _run_pipeline_job(name, False, False, None, False)
        except Exception as e:
            print(f"[scheduler] Erreur pour '{name}': {e}")

scheduler.add_job(_nightly_scrape, "cron", hour=3, minute=0, id="nightly_scrape")


# =========================
# APP
# =========================

def _init_db():
    """Crée toutes les tables si elles n'existent pas (premier démarrage)."""
    from database.db import (
        create_streams_table, create_stats_table, create_artist_table,
        create_kworb_albums_table, create_spotify_tracks_table,
        create_album_tracks_table,
    )
    create_artist_table()
    create_streams_table()
    create_stats_table()
    create_kworb_albums_table()
    create_spotify_tracks_table()
    create_album_tracks_table()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_db()
    scheduler.start()
    print("[api] Démarrage — DB :", DB_PATH)
    print("[api] Scheduler actif — prochain run nocturne à 3h00")
    yield
    scheduler.shutdown(wait=False)
    print("[api] Arrêt.")

app = FastAPI(
    title="Kworb Spotify Analytics API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Suivi des jobs pipeline en cours
pipeline_jobs: dict[str, dict] = {}


# =========================
# UTILITAIRES DB
# =========================

def _conn() -> sqlite3.Connection:
    return sqlite3.connect(DB_PATH)


def _df(query: str, params: list = None) -> pd.DataFrame:
    conn = _conn()
    df = pd.read_sql_query(query, conn, params=params or [])
    conn.close()
    return df


def _safe(val):
    """Convertit NaN pandas → None pour la sérialisation JSON."""
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    return val


def _resolve_artist(artist_name: str) -> str:
    """Retourne le nom canonique de l'artiste (insensible à la casse). Lève 404 si absent."""
    row = _df(
        "SELECT artist_name FROM artists WHERE LOWER(artist_name) = LOWER(?) LIMIT 1",
        [artist_name],
    )
    if row.empty:
        raise HTTPException(
            status_code=404,
            detail=f"Artiste '{artist_name}' non trouvé en DB. Lance d'abord le pipeline.",
        )
    return row["artist_name"].iloc[0]


# =========================
# ENDPOINTS ARTISTES
# =========================

@app.get("/health")
def health():
    """Diagnostic endpoint."""
    import os
    try:
        conn = sqlite3.connect(DB_PATH)
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        conn.close()
        return {"status": "ok", "db": DB_PATH, "tables": [t[0] for t in tables], "db_exists": os.path.exists(DB_PATH)}
    except Exception as e:
        return {"status": "error", "detail": str(e), "db": DB_PATH}


@app.get("/artists")
def list_artists():
    """Liste tous les artistes en DB avec leurs stats de base (requête unique)."""
    try:
     return _list_artists_inner()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _list_artists_inner():
    df = _df("""
        SELECT
            a.artist_name, a.spotify_id, a.artist_image,
            s.total_streams, s.total_daily, s.scraping_date,
            COALESCE(t.total_tracks, 0) AS total_tracks
        FROM artists a
        LEFT JOIN spotify_stats s
            ON  a.artist_name   = s.artist_name
            AND s.scraping_date = (
                SELECT MAX(scraping_date) FROM spotify_stats WHERE artist_name = a.artist_name
            )
        LEFT JOIN (
            SELECT artist_name, COUNT(DISTINCT track_name) AS total_tracks
            FROM spotify_streams
            GROUP BY artist_name
        ) t ON a.artist_name = t.artist_name
        ORDER BY a.artist_name
    """)
    if df.empty:
        return []

    return [
        {
            "name":        row["artist_name"],
            "spotifyId":   _safe(row.get("spotify_id")),
            "artistImage": _safe(row.get("artist_image")),
            "totalStreams": int(row["total_streams"]) if _safe(row.get("total_streams")) is not None else 0,
            "dailyStreams": int(row["total_daily"])   if _safe(row.get("total_daily"))   is not None else 0,
            "totalTracks": int(row["total_tracks"]),
            "lastUpdate":  _safe(row.get("scraping_date")),
        }
        for _, row in df.iterrows()
    ]


@app.get("/artists/{artist_name}")
def get_artist(artist_name: str):
    """
    Stats complètes d'un artiste :
    KPIs, top tracks, albums, répartition solo/feat.
    """
    artist_name = _resolve_artist(artist_name)
    artists = _df(
        "SELECT * FROM artists WHERE artist_name = ? LIMIT 1",
        [artist_name],
    )

    row = artists.iloc[0]

    # Stats globales
    stats = _df(
        """
        SELECT total_streams, total_daily, lead_streams, solo_streams, scraping_date
        FROM spotify_stats
        WHERE artist_name = ?
        ORDER BY scraping_date DESC LIMIT 1
        """,
        [artist_name],
    )

    # Streams par titre (dernière date)
    tracks = _df(
        """
        SELECT
            s.track_name,
            s.track_type       AS type_kworb,
            s.kworb_is_feat,
            s.spotify_track_id,
            s.streams_total,
            s.streams_daily,
            s.scraping_date,
            at.album_name,
            at.track_type      AS type_spotify,
            at.featured_artists
        FROM spotify_streams s
        LEFT JOIN album_tracks at
            ON  s.artist_name      = at.artist_name
            AND (s.spotify_track_id = at.track_id
                 OR LOWER(TRIM(s.track_name)) = LOWER(TRIM(at.track_name)))
        WHERE s.artist_name   = ?
          AND s.scraping_date = (
              SELECT MAX(scraping_date) FROM spotify_streams WHERE artist_name = ?
          )
        ORDER BY s.streams_total DESC
        """,
        [artist_name, artist_name],
    )

    # Déduplication (join peut créer des doublons)
    if not tracks.empty:
        tracks = tracks.drop_duplicates(subset=["track_name"]).reset_index(drop=True)
        tracks["track_type"] = tracks["type_spotify"].fillna(
            tracks["kworb_is_feat"].map({1: "feat", 0: "solo"}).fillna(tracks["type_kworb"])
        )

    # Albums (dernière date, dédoublonnés)
    albums = _df(
        """
        SELECT album_name, spotify_album_id, streams_total, streams_daily
        FROM kworb_albums
        WHERE artist_name = ?
          AND scraping_date = (
              SELECT MAX(scraping_date) FROM kworb_albums WHERE artist_name = ?
          )
        ORDER BY streams_total DESC
        """,
        [artist_name, artist_name],
    )

    # Dédoublonnage albums (garde le plus gros par nom)
    if not albums.empty:
        albums = (
            albums.sort_values("streams_total", ascending=False)
                  .drop_duplicates(subset=["album_name"])
                  .reset_index(drop=True)
        )

    # Construction réponse
    top_tracks = []
    if not tracks.empty:
        for _, t in tracks.iterrows():
            top_tracks.append({
                "name":            t["track_name"],
                "type":            _safe(t.get("track_type")) or "solo",
                "streams":         int(t["streams_total"]),
                "daily":           int(t["streams_daily"]),
                "albumName":       _safe(t.get("album_name")),
                "featuredArtists": _safe(t.get("featured_artists")),
                "spotifyTrackId":  _safe(t.get("spotify_track_id")),
            })

    solo_tracks  = [t for t in top_tracks if t["type"] == "solo"]
    feat_tracks  = [t for t in top_tracks if t["type"] == "feat"]

    album_list = []
    if not albums.empty:
        for _, a in albums.iterrows():
            album_list.append({
                "name":          a["album_name"],
                "spotifyAlbumId": a.get("spotify_album_id"),
                "streamsKworb":  int(a["streams_total"]),
                "dailyKworb":    int(a["streams_daily"]),
            })

    total_streams = int(stats["total_streams"].iloc[0]) if not stats.empty else sum(t["streams"] for t in top_tracks)
    total_daily   = int(stats["total_daily"].iloc[0])   if not stats.empty else sum(t["daily"]   for t in top_tracks)

    return {
        "artistName":   artist_name,
        "artistImage":  row.get("artist_image"),
        "spotifyId":    row.get("spotify_id"),
        "lastUpdate":   stats["scraping_date"].iloc[0] if not stats.empty else None,
        "kpis": {
            "totalStreams":  total_streams,
            "dailyStreams":  total_daily,
            "leadStreams":   int(stats["lead_streams"].iloc[0])  if not stats.empty else 0,
            "soloStreams":   int(stats["solo_streams"].iloc[0])  if not stats.empty else 0,
        },
        "soloTracks": {
            "count":   len(solo_tracks),
            "streams": sum(t["streams"] for t in solo_tracks),
        },
        "featTracks": {
            "count":   len(feat_tracks),
            "streams": sum(t["streams"] for t in feat_tracks),
        },
        "topTracks":   top_tracks[:50],
        "albumStreams": album_list,
    }


@app.get("/artists/{artist_name}/tracks")
def get_artist_tracks(
    artist_name: str,
    track_type: str = Query(None, description="'solo' ou 'feat'"),
    album: str      = Query(None, description="Filtrer par album"),
    limit: int      = Query(50, le=500),
):
    artist_name = _resolve_artist(artist_name)
    """Tous les titres d'un artiste avec filtres optionnels."""
    tracks = _df(
        """
        SELECT
            s.track_name,
            s.track_type       AS type_kworb,
            s.kworb_is_feat,
            s.spotify_track_id,
            s.streams_total,
            s.streams_daily,
            at.album_name,
            at.track_type      AS type_spotify,
            at.featured_artists,
            at.track_number,
            at.disc_number
        FROM spotify_streams s
        LEFT JOIN album_tracks at
            ON  s.artist_name      = at.artist_name
            AND (s.spotify_track_id = at.track_id
                 OR LOWER(TRIM(s.track_name)) = LOWER(TRIM(at.track_name)))
        WHERE s.artist_name   = ?
          AND s.scraping_date = (
              SELECT MAX(scraping_date) FROM spotify_streams WHERE artist_name = ?
          )
        ORDER BY s.streams_total DESC
        """,
        [artist_name, artist_name],
    )

    if tracks.empty:
        return []

    tracks = tracks.drop_duplicates(subset=["track_name"]).reset_index(drop=True)
    tracks["track_type"] = tracks["type_spotify"].fillna(
        tracks["kworb_is_feat"].map({1: "feat", 0: "solo"}).fillna(tracks["type_kworb"])
    )

    # Filtres
    if track_type:
        tracks = tracks[tracks["track_type"] == track_type]
    if album:
        tracks = tracks[tracks["album_name"].str.lower() == album.lower()]

    result = []
    for _, t in tracks.head(limit).iterrows():
        result.append({
            "name":            t["track_name"],
            "type":            _safe(t.get("track_type")) or "solo",
            "streams":         int(t["streams_total"]),
            "daily":           int(t["streams_daily"]),
            "albumName":       _safe(t.get("album_name")),
            "featuredArtists": _safe(t.get("featured_artists")),
            "trackNumber":     int(t["track_number"]) if _safe(t.get("track_number")) is not None else None,
            "spotifyTrackId":  _safe(t.get("spotify_track_id")),
        })
    return result


@app.get("/artists/{artist_name}/albums")
def get_artist_albums(artist_name: str):
    """
    Albums d'un artiste avec streams kworb + tracks détaillés.
    """
    artist_name = _resolve_artist(artist_name)
    # Albums kworb (dédoublonnés)
    albums = _df(
        """
        SELECT album_name, spotify_album_id, streams_total, streams_daily
        FROM kworb_albums
        WHERE artist_name = ?
          AND scraping_date = (
              SELECT MAX(scraping_date) FROM kworb_albums WHERE artist_name = ?
          )
        ORDER BY streams_total DESC
        """,
        [artist_name, artist_name],
    )

    if albums.empty:
        return []

    albums = (
        albums.sort_values("streams_total", ascending=False)
              .drop_duplicates(subset=["album_name"])
              .reset_index(drop=True)
    )

    # Tracks par album
    album_tracks = _df(
        """
        SELECT at.album_name, at.track_name, at.track_type, at.featured_artists,
               at.track_number, at.disc_number, at.track_id,
               s.streams_total, s.streams_daily
        FROM album_tracks at
        LEFT JOIN spotify_streams s
            ON  at.artist_name     = s.artist_name
            AND (at.track_id       = s.spotify_track_id
                 OR LOWER(TRIM(at.track_name)) = LOWER(TRIM(s.track_name)))
            AND s.scraping_date = (
                SELECT MAX(scraping_date) FROM spotify_streams WHERE artist_name = ?
            )
        WHERE at.artist_name = ?
        ORDER BY at.album_name, at.disc_number, at.track_number
        """,
        [artist_name, artist_name],
    )

    result = []
    for _, a in albums.iterrows():
        name = a["album_name"]
        album_t = album_tracks[album_tracks["album_name"] == name].drop_duplicates(subset=["track_name"])

        tracks_list = []
        for _, t in album_t.iterrows():
            tracks_list.append({
                "name":            t["track_name"],
                "type":            _safe(t.get("track_type")) or "solo",
                "streams":         int(t["streams_total"]) if _safe(t.get("streams_total")) is not None else None,
                "daily":           int(t["streams_daily"]) if _safe(t.get("streams_daily")) is not None else None,
                "featuredArtists": _safe(t.get("featured_artists")),
                "trackNumber":     int(t["track_number"]) if _safe(t.get("track_number")) is not None else None,
                "spotifyTrackId":  _safe(t.get("track_id")),
            })

        nb_solo = sum(1 for t in tracks_list if t["type"] == "solo")
        nb_feat = sum(1 for t in tracks_list if t["type"] == "feat")
        album_type = "own" if nb_solo > 0 else "feat"

        result.append({
            "name":          name,
            "albumType":     album_type,
            "spotifyAlbumId": _safe(a.get("spotify_album_id")),
            "streamsKworb":  int(a["streams_total"]),
            "dailyKworb":    int(a["streams_daily"]),
            "nbTracks":      len(tracks_list),
            "nbSolo":        nb_solo,
            "nbFeat":        nb_feat,
            "tracks":        tracks_list,
        })

    return result


# =========================
# ENDPOINT HISTORIQUE
# =========================

@app.get("/artists/{artist_name}/history")
def get_artist_history(artist_name: str):
    """Retourne l'évolution des streams dans le temps (une entrée par scraping)."""
    artist_name = _resolve_artist(artist_name)
    hist = _df(
        """
        SELECT scraping_date, total_streams, total_daily
        FROM spotify_stats
        WHERE artist_name = ?
        ORDER BY scraping_date ASC
        """,
        [artist_name],
    )
    if hist.empty:
        return []
    return [
        {
            "date":         row["scraping_date"],
            "totalStreams": int(row["total_streams"]),
            "dailyStreams": int(row["total_daily"]),
        }
        for _, row in hist.iterrows()
    ]


# =========================
# ENDPOINT SCHEDULER
# =========================

@app.get("/scheduler/status")
def get_scheduler_status():
    """Retourne le statut du scheduler nocturne."""
    job = scheduler.get_job("nightly_scrape")
    return {
        "active":   scheduler.running,
        "next_run": str(job.next_run_time) if job and job.next_run_time else None,
    }


# =========================
# ENDPOINT PIPELINE
# =========================

_STEP_PATTERNS = [
    (re.compile(r"Recherche|Initialisation|résolu", re.I), 1),
    (re.compile(r"Scraping Kworb|Songs insérés|Albums insérés|Données Kworb|Scraping terminé", re.I), 2),
    (re.compile(r"Enrichissement|Album tracks|déjà en DB", re.I), 3),
    (re.compile(r"Export Power BI", re.I), 4),
    (re.compile(r"Pipeline terminé", re.I), 5),
]

def _detect_step(msg: str) -> int:
    for pattern, step in reversed(_STEP_PATTERNS):
        if pattern.search(msg):
            return step
    return 0

def _run_pipeline_job(artist_name: str, force_scrape: bool, force_enrich: bool, kworb_id: str, skip_export: bool):
    """Exécute le pipeline complet en arrière-plan."""
    pipeline_jobs[artist_name] = {"status": "running", "message": "Initialisation...", "step": 0}

    def on_log(msg: str):
        pipeline_jobs[artist_name] = {
            "status":  "running",
            "message": msg,
            "step":    _detect_step(msg),
        }

    try:
        run_pipeline(
            artist_input      = artist_name,
            force_scrape      = force_scrape,
            force_enrich      = force_enrich,
            kworb_id_override = kworb_id,
            skip_export       = skip_export,
            log_callback      = on_log,
        )
        pipeline_jobs[artist_name] = {"status": "done", "message": "Pipeline terminé avec succès.", "step": 5}
    except Exception as e:
        pipeline_jobs[artist_name] = {"status": "error", "message": str(e), "step": -1}


@app.post("/pipeline/run")
def run_pipeline_endpoint(
    background_tasks: BackgroundTasks,
    artist: str        = Query(..., description="Nom de l'artiste"),
    force_scrape: bool = Query(False),
    force_enrich: bool = Query(False),
    skip_export: bool  = Query(False),
    kworb_id: str      = Query(None),
):
    """Lance le pipeline pour un artiste en arrière-plan."""
    if artist in pipeline_jobs and pipeline_jobs[artist].get("status") == "running":
        return {"status": "already_running", "message": f"Pipeline déjà en cours pour '{artist}'."}

    pipeline_jobs[artist] = {"status": "queued", "message": "En attente...", "step": 0}
    background_tasks.add_task(_run_pipeline_job, artist, force_scrape, force_enrich, kworb_id, skip_export)
    return {"status": "started", "message": f"Pipeline lancé pour '{artist}'."}


@app.get("/pipeline/status/{artist_name}")
def pipeline_status(artist_name: str):
    """Retourne le statut du pipeline pour un artiste."""
    if artist_name not in pipeline_jobs:
        return {"status": "idle", "message": "Aucun job en cours."}
    return pipeline_jobs[artist_name]


# =========================
# ENDPOINTS YOUTUBE
# =========================

youtube_jobs: dict = {}  # artist_name -> {status, done, total, current_track}

def _run_youtube_job(artist_name: str):
    from database.youtube import enrich_youtube
    youtube_jobs[artist_name] = {"status": "running", "done": 0, "total": 0, "current": ""}

    def progress(done, total, track):
        youtube_jobs[artist_name] = {"status": "running", "done": done, "total": total, "current": track}

    try:
        result = enrich_youtube(artist_name, DB_PATH, progress_callback=progress)
        youtube_jobs[artist_name] = {"status": "done", **result}
    except Exception as e:
        youtube_jobs[artist_name] = {"status": "error", "message": str(e)}


@app.post("/artists/{artist_name}/youtube/enrich")
def youtube_enrich(artist_name: str, background_tasks: BackgroundTasks):
    """Lance l'enrichissement YouTube en arrière-plan (yt-dlp, sans quota API)."""
    artist_name = _resolve_artist(artist_name)
    if youtube_jobs.get(artist_name, {}).get("status") == "running":
        return {"status": "already_running"}
    background_tasks.add_task(_run_youtube_job, artist_name)
    return {"status": "started"}


@app.get("/artists/{artist_name}/youtube/enrich/status")
def youtube_enrich_status(artist_name: str):
    """Retourne la progression de l'enrichissement YouTube."""
    artist_name = _resolve_artist(artist_name)
    return youtube_jobs.get(artist_name, {"status": "idle"})


@app.get("/artists/{artist_name}/youtube")
def get_artist_youtube(artist_name: str):
    """Retourne les vues YouTube par track pour un artiste."""
    artist_name = _resolve_artist(artist_name)

    try:
        rows_df = _df("""
            SELECT track_name, video_title, video_id, video_type,
                   view_count, like_count, published_at
            FROM youtube_streams
            WHERE artist_name = ?
              AND scraping_date = (
                  SELECT MAX(scraping_date) FROM youtube_streams WHERE artist_name = ?
              )
            ORDER BY view_count DESC
        """, [artist_name, artist_name])
    except Exception:
        return {"available": False, "tracks": []}

    if rows_df.empty:
        return {"available": False, "tracks": []}

    tracks = []
    for _, r in rows_df.iterrows():
        tracks.append({
            "trackName":  _safe(r["track_name"]),
            "videoTitle": _safe(r["video_title"]),
            "videoId":    _safe(r["video_id"]),
            "type":       r["video_type"],
            "views":      int(r["view_count"]),
            "likes":      int(r["like_count"]),
            "published":  _safe(r["published_at"]),
        })

    solo = [t for t in tracks if t["type"] == "solo"]
    feat = [t for t in tracks if t["type"] == "feat"]

    # Counts depuis Spotify — source de vérité pour la classification solo/feat
    sp = _df(
        "SELECT track_type, COUNT(DISTINCT track_name) AS n FROM spotify_streams WHERE artist_name = ? GROUP BY track_type",
        [artist_name]
    )
    sp_counts = {row["track_type"]: int(row["n"]) for _, row in sp.iterrows()} if not sp.empty else {}

    return {
        "available":  True,
        "totalViews": sum(t["views"] for t in tracks),
        "soloCount":  sp_counts.get("solo", len(solo)),
        "featCount":  sp_counts.get("feat", len(feat)),
        "soloViews":  sum(t["views"] for t in solo),
        "featViews":  sum(t["views"] for t in feat),
        "tracks":     tracks,
        "topVideos":  tracks[:15],
    }



# =========================
# LANCEMENT
# =========================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)
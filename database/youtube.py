"""
youtube.py — Enrichissement YouTube via yt-dlp (sans API key, sans quota).

Pour chaque track Spotify de l'artiste :
  1. Recherche yt-dlp : "{artiste} {titre}"
  2. Prend la vidéo avec le plus de vues parmi les 3 premiers résultats
  3. Stocke : track_name, video_id, view_count, published

Avantages :
  - Aucune clé API requise
  - Aucune limite de quota
  - Fonctionne pour tous les artistes
"""

import sqlite3
import yt_dlp
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date


# ─── Recherche yt-dlp ────────────────────────────────────────────────────────

def _search_track_ytdlp(artist_name: str, track_name: str) -> dict | None:
    """
    Cherche une vidéo YouTube pour un titre Spotify via yt-dlp.
    Aucun quota, aucune clé API nécessaire.
    """
    query = f"{artist_name} {track_name}"
    ydl_opts = {
        "quiet":        True,
        "no_warnings":  True,
        "extract_flat": True,
        "skip_download": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info    = ydl.extract_info(f"ytsearch3:{query}", download=False)
            entries = [e for e in info.get("entries", []) if e]
            if not entries:
                return None

            # Prendre la vidéo avec le plus de vues
            with_views = [e for e in entries if e.get("view_count")]
            best = max(with_views, key=lambda e: e["view_count"]) if with_views else entries[0]

            return {
                "video_id":    best.get("id", ""),
                "video_title": best.get("title", ""),
                "view_count":  int(best.get("view_count") or 0),
                "like_count":  0,
                "published":   str(best.get("upload_date", "") or "")[:8],
            }
    except Exception:
        return None


# ─── Pipeline principal ───────────────────────────────────────────────────────

WORKERS = 2  # réduit pour les environnements avec peu de RAM (Render free)

def enrich_youtube(
    artist_name: str,
    db_path: str,
    progress_callback=None,
) -> dict:
    """
    Pour chaque track Spotify de l'artiste, cherche la vidéo YouTube
    en parallèle et stocke les vues.

    Args:
        progress_callback : function(done, total, track_name) appelée à chaque track

    Returns:
        dict avec total_tracks, matched, total_views
    """
    # 1. Charger les tracks Spotify
    conn = sqlite3.connect(db_path)
    try:
        df = pd.read_sql_query(
            """SELECT DISTINCT track_name, track_type
               FROM spotify_streams WHERE artist_name = ?
               ORDER BY streams_total DESC""",
            conn, params=[artist_name]
        )
    finally:
        conn.close()

    if df.empty:
        raise ValueError(f"Aucun track Spotify pour '{artist_name}' en base")

    tracks = list(df.itertuples(index=False, name=None))
    today  = date.today().isoformat()
    done_count = 0

    if progress_callback:
        progress_callback(0, len(tracks), tracks[0][0] if tracks else "")

    # 2. Recherches parallèles
    results: dict[str, dict] = {}  # track_name -> video

    def search_one(track_name: str, track_type: str):
        return track_name, track_type, _search_track_ytdlp(artist_name, track_name)

    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(search_one, t, tt): t for t, tt in tracks}
        for future in as_completed(futures):
            track_name, track_type, video = future.result()
            results[track_name] = (track_type, video)
            done_count += 1
            if progress_callback:
                progress_callback(done_count, len(tracks), track_name)

    # 3. Construire les lignes dans l'ordre original
    rows    = []
    matched = 0
    for track_name, track_type in tracks:
        _, video = results.get(track_name, (track_type, None))
        if video and video["view_count"] > 0:
            matched += 1
        rows.append({
            "artist_name":   artist_name,
            "track_name":    track_name,
            "video_id":      video["video_id"]    if video else None,
            "video_title":   video["video_title"] if video else None,
            "video_type":    track_type,
            "view_count":    video["view_count"]  if video else 0,
            "like_count":    0,
            "published_at":  video["published"]   if video else None,
            "scraping_date": today,
        })

    if progress_callback:
        progress_callback(len(tracks), len(tracks), "Terminé")

    # 3. Stocker en DB
    conn = sqlite3.connect(db_path)
    try:
        # Recréer la table avec la bonne contrainte (une ligne par track Spotify)
        conn.execute("DROP TABLE IF EXISTS youtube_streams")
        conn.execute("""
            CREATE TABLE youtube_streams (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                artist_name   TEXT NOT NULL,
                track_name    TEXT,
                video_id      TEXT,
                video_title   TEXT,
                video_type    TEXT DEFAULT 'solo',
                view_count    INTEGER DEFAULT 0,
                like_count    INTEGER DEFAULT 0,
                published_at  TEXT,
                scraping_date TEXT NOT NULL,
                UNIQUE(artist_name, track_name, scraping_date)
            )
        """)
        pd.DataFrame(rows).to_sql("youtube_streams", conn, if_exists="append", index=False)
        conn.commit()
    finally:
        conn.close()

    return {
        "total_tracks": len(rows),
        "matched":      matched,
        "total_views":  sum(r["view_count"] for r in rows),
    }

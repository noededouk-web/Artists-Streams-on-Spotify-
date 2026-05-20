"""
db.py — Couche d'accès à la base de données SQLite.

Tables :
    spotify_streams   → streams kworb par titre (historique journalier)
    kworb_albums      → streams kworb par album (historique journalier)
    artists           → cache artistes (spotify_id, kworb_id, image)
    spotify_stats     → stats globales kworb par artiste et par date
    spotify_tracks    → métadonnées titres Spotify enrichies
"""

import os
import sqlite3
import pandas as pd
from datetime import date

DB_PATH = os.path.join("data", "spotify.db")


def get_connection() -> sqlite3.Connection:
    os.makedirs("data", exist_ok=True)
    return sqlite3.connect(DB_PATH)


# =========================
# TABLE STREAMS (kworb songs)
# =========================

def create_streams_table():
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS spotify_streams (
            artist_name       TEXT,
            track_name        TEXT,
            track_type        TEXT,
            kworb_is_feat     INTEGER,
            spotify_track_id  TEXT,
            streams_total     INTEGER,
            streams_daily     INTEGER,
            scraping_date     TEXT,
            UNIQUE (artist_name, track_name, scraping_date)
        )
    """)
    conn.commit()
    conn.close()


# Alias pour compatibilité descendante
create_table = create_streams_table


def insert_streams(df: pd.DataFrame):
    """Insère les streams kworb par titre (INSERT OR IGNORE)."""
    if df.empty:
        return
    conn    = get_connection()
    cur     = conn.cursor()
    records = df.to_dict(orient="records")
    rows = [
        (
            r["artist_name"],
            r["track_name"],
            r.get("track_type", "solo"),
            int(r.get("kworb_is_feat", False)),
            r.get("spotify_track_id"),
            int(r["streams_total"]),
            int(r["streams_daily"]),
            r["scraping_date"],
        )
        for r in records
    ]
    cur.executemany(
        """
        INSERT OR IGNORE INTO spotify_streams
            (artist_name, track_name, track_type, kworb_is_feat,
             spotify_track_id, streams_total, streams_daily, scraping_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    conn.close()


# Alias pour compatibilité descendante
insert_dataframe = insert_streams


def get_streams(artist_name: str, scraping_date: str) -> pd.DataFrame:
    conn = get_connection()
    df   = pd.read_sql_query(
        "SELECT * FROM spotify_streams WHERE artist_name = ? AND scraping_date = ?",
        conn, params=[artist_name, scraping_date],
    )
    conn.close()
    return df


# Alias pour compatibilité descendante
get_artist_data = get_streams


def streams_exist_today(artist_name: str) -> bool:
    today = date.today().strftime("%Y-%m-%d")
    return not get_streams(artist_name, today).empty


# Alias pour compatibilité descendante
artist_has_data_today = streams_exist_today


def get_latest_scraping_date(artist_name: str) -> str | None:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "SELECT MAX(scraping_date) FROM spotify_streams WHERE artist_name = ?",
        (artist_name,),
    )
    row = cur.fetchone()
    conn.close()
    return row[0] if row else None


def get_all_stream_dates(artist_name: str) -> list[str]:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        """
        SELECT DISTINCT scraping_date FROM spotify_streams
        WHERE artist_name = ?
        ORDER BY scraping_date DESC
        """,
        (artist_name,),
    )
    rows = cur.fetchall()
    conn.close()
    return [r[0] for r in rows]


# =========================
# TABLE KWORB ALBUMS (nouveau)
# =========================

def create_kworb_albums_table():
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS kworb_albums (
            artist_name       TEXT,
            album_name        TEXT,
            spotify_album_id  TEXT,
            streams_total     INTEGER,
            streams_daily     INTEGER,
            scraping_date     TEXT,
            UNIQUE (artist_name, album_name, scraping_date)
        )
    """)
    conn.commit()
    conn.close()


def insert_kworb_albums(df: pd.DataFrame):
    """Insère les streams kworb par album (INSERT OR IGNORE)."""
    if df.empty:
        return
    conn    = get_connection()
    cur     = conn.cursor()
    records = df.to_dict(orient="records")
    rows = [
        (
            r["artist_name"],
            r["album_name"],
            r.get("spotify_album_id"),
            int(r["streams_total"]),
            int(r["streams_daily"]),
            r["scraping_date"],
        )
        for r in records
    ]
    cur.executemany(
        """
        INSERT OR IGNORE INTO kworb_albums
            (artist_name, album_name, spotify_album_id,
             streams_total, streams_daily, scraping_date)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    conn.close()


def get_kworb_albums(artist_name: str, scraping_date: str = None) -> pd.DataFrame:
    """
    Retourne les streams albums kworb pour un artiste.
    Si scraping_date est None, retourne la dernière date disponible.
    """
    conn = get_connection()
    if scraping_date:
        df = pd.read_sql_query(
            """
            SELECT * FROM kworb_albums
            WHERE artist_name = ? AND scraping_date = ?
            ORDER BY streams_total DESC
            """,
            conn, params=[artist_name, scraping_date],
        )
    else:
        df = pd.read_sql_query(
            """
            SELECT * FROM kworb_albums
            WHERE artist_name = ?
              AND scraping_date = (
                  SELECT MAX(scraping_date) FROM kworb_albums WHERE artist_name = ?
              )
            ORDER BY streams_total DESC
            """,
            conn, params=[artist_name, artist_name],
        )
    conn.close()
    return df


def kworb_albums_exist_today(artist_name: str) -> bool:
    today = date.today().strftime("%Y-%m-%d")
    conn  = get_connection()
    cur   = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM kworb_albums WHERE artist_name = ? AND scraping_date = ?",
        (artist_name, today),
    )
    count = cur.fetchone()[0]
    conn.close()
    return count > 0


# =========================
# TABLE ARTISTS (cache)
# =========================

def create_artist_table():
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS artists (
            artist_name   TEXT PRIMARY KEY,
            spotify_id    TEXT,
            kworb_id      TEXT,
            artist_image  TEXT
        )
    """)
    conn.commit()
    conn.close()


def get_all_artists() -> pd.DataFrame:
    conn = get_connection()
    df   = pd.read_sql("SELECT * FROM artists ORDER BY artist_name", conn)
    conn.close()
    return df


def insert_artist(
    artist_name: str,
    spotify_id: str,
    kworb_id: str,
    artist_image: str = None,
):
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        """
        INSERT OR REPLACE INTO artists
            (artist_name, spotify_id, kworb_id, artist_image)
        VALUES (?, ?, ?, ?)
        """,
        (artist_name, spotify_id, kworb_id, artist_image),
    )
    conn.commit()
    conn.close()


def get_artist_by_name(artist_name: str) -> dict | None:
    conn = get_connection()
    df   = pd.read_sql(
        "SELECT * FROM artists WHERE artist_name = ? LIMIT 1",
        conn, params=[artist_name],
    )
    conn.close()
    return df.iloc[0].to_dict() if not df.empty else None


# =========================
# TABLE STATS GLOBALES
# =========================

def create_stats_table():
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS spotify_stats (
            artist_name    TEXT,
            scraping_date  TEXT,
            total_streams  INTEGER,
            total_daily    INTEGER,
            lead_streams   INTEGER,
            solo_streams   INTEGER,
            PRIMARY KEY (artist_name, scraping_date)
        )
    """)
    conn.commit()
    conn.close()


def insert_stats(artist_name: str, scraping_date: str, stats: dict):
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        """
        INSERT OR REPLACE INTO spotify_stats
            (artist_name, scraping_date, total_streams,
             total_daily, lead_streams, solo_streams)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            artist_name,
            scraping_date,
            int(stats.get("total_streams", 0)),
            int(stats.get("total_daily",   0)),
            int(stats.get("lead_streams",  0)),
            int(stats.get("solo_streams",  0)),
        ),
    )
    conn.commit()
    conn.close()


def get_stats_by_artist(artist_name: str) -> pd.DataFrame:
    conn = get_connection()
    df   = pd.read_sql_query(
        """
        SELECT * FROM spotify_stats
        WHERE artist_name = ?
        ORDER BY scraping_date DESC
        """,
        conn, params=[artist_name],
    )
    conn.close()
    return df


# =========================
# TABLE SPOTIFY TRACKS (enrichie)
# =========================

def create_spotify_tracks_table():
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS spotify_tracks (
            artist_name       TEXT,
            track_name        TEXT,
            album_name        TEXT,
            album_type        TEXT,
            album_group       TEXT,
            release_year      INTEGER,
            cover_url         TEXT,
            track_popularity  INTEGER,
            role              TEXT,
            track_type        TEXT,
            featured_artists  TEXT,
            UNIQUE (artist_name, track_name, album_name)
        )
    """)
    conn.commit()
    conn.close()


def insert_spotify_tracks(df: pd.DataFrame):
    """Insère les titres Spotify enrichis (INSERT OR IGNORE)."""
    if df.empty:
        return
    conn    = get_connection()
    cur     = conn.cursor()
    records = df.to_dict(orient="records")
    rows = [
        (
            r.get("artist_name"),
            r.get("track_name"),
            r.get("album_name"),
            r.get("album_type"),
            r.get("album_group"),
            r.get("release_year"),
            r.get("cover_url"),
            r.get("track_popularity"),
            r.get("role"),
            r.get("track_type"),
            r.get("featured_artists"),
        )
        for r in records
    ]
    cur.executemany(
        """
        INSERT OR IGNORE INTO spotify_tracks
            (artist_name, track_name, album_name, album_type, album_group,
             release_year, cover_url, track_popularity, role,
             track_type, featured_artists)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    conn.close()


def get_spotify_tracks(artist_name: str) -> pd.DataFrame:
    conn = get_connection()
    df   = pd.read_sql_query(
        "SELECT * FROM spotify_tracks WHERE artist_name = ?",
        conn, params=[artist_name],
    )
    conn.close()
    return df


def spotify_tracks_exist(artist_name: str) -> bool:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM spotify_tracks WHERE artist_name = ?",
        (artist_name,),
    )
    count = cur.fetchone()[0]
    conn.close()
    return count > 0


# =========================
# TABLE ALBUM TRACKS (nouveau)
# =========================

def create_album_tracks_table():
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS album_tracks (
            artist_name      TEXT,
            track_id         TEXT,
            track_name       TEXT,
            album_id         TEXT,
            album_name       TEXT,
            track_type       TEXT,
            featured_artists TEXT,
            track_number     INTEGER,
            disc_number      INTEGER,
            PRIMARY KEY (track_id)
        )
    """)
    conn.commit()
    conn.close()


def insert_album_tracks(df: pd.DataFrame):
    """Insère les tracks par album (INSERT OR REPLACE — on écrase si déjà présent)."""
    if df.empty:
        return
    conn    = get_connection()
    cur     = conn.cursor()
    records = df.to_dict(orient="records")
    rows = [
        (
            r.get("artist_name"),
            r.get("track_id"),
            r.get("track_name"),
            r.get("album_id"),
            r.get("album_name"),
            r.get("track_type", "solo"),
            r.get("featured_artists"),
            r.get("track_number"),
            r.get("disc_number"),
        )
        for r in records
    ]
    cur.executemany(
        """
        INSERT OR REPLACE INTO album_tracks
            (artist_name, track_id, track_name, album_id, album_name,
             track_type, featured_artists, track_number, disc_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    conn.close()


def get_album_tracks(artist_name: str) -> pd.DataFrame:
    """Retourne tous les tracks enrichis par album pour un artiste."""
    conn = get_connection()
    df   = pd.read_sql_query(
        """
        SELECT * FROM album_tracks
        WHERE artist_name = ?
        ORDER BY album_name, disc_number, track_number
        """,
        conn, params=[artist_name],
    )
    conn.close()
    return df


def album_tracks_exist(artist_name: str) -> bool:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM album_tracks WHERE artist_name = ?",
        (artist_name,),
    )
    count = cur.fetchone()[0]
    conn.close()
    return count > 0


# =========================
# INIT COMPLÈTE
# =========================

def init_db():
    """Initialise toutes les tables. À appeler au démarrage du pipeline."""
    create_streams_table()
    create_kworb_albums_table()
    create_album_tracks_table()
    create_artist_table()
    create_stats_table()
    create_spotify_tracks_table()
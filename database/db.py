import os
import sqlite3
import pandas as pd

DB_PATH = os.path.join("data", "spotify.db")


def get_connection():
    """Retourne la connexion SQLite"""
    os.makedirs("data", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    return conn


def create_table():
    """Créer la table si elle n'existe pas"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS spotify_streams (
            artist_name   TEXT,
            track_name    TEXT,
            album_name    TEXT,
            track_type    TEXT,
            streams_total INTEGER,
            streams_daily INTEGER,
            scraping_date TEXT,
            UNIQUE (artist_name, track_name, scraping_date)
        )
    """)
    conn.commit()
    conn.close()


def delete_artist_date(artist_name: str, scraping_date: str):
    """Supprime les lignes pour un artiste et une date de scraping donnés"""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        DELETE FROM spotify_streams
        WHERE artist_name = ?
          AND scraping_date = ?
        """,
        (artist_name, scraping_date)
    )
    conn.commit()
    conn.close()


def insert_dataframe(df: pd.DataFrame):
    """Insère un DataFrame dans la table spotify_streams"""
    conn = get_connection()
    df.to_sql("spotify_streams", conn, if_exists="append", index=False)
    conn.close()
    print("✅ Données insérées dans la base SQLite")

def get_artist_data(artist_name: str, scraping_date: str) -> pd.DataFrame:
    """Retourne les lignes pour un artiste et une date de scraping donnée"""
    conn = get_connection()
    query = """
        SELECT *
        FROM spotify_streams
        WHERE artist_name = ?
          AND scraping_date = ?
    """
    df = pd.read_sql_query(query, conn, params=[artist_name, scraping_date])
    conn.close()
    return df

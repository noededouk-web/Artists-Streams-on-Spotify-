# inspect_db.py
import sqlite3
import pandas as pd

conn = sqlite3.connect("data/spotify.db")

print("Tables :")
print(pd.read_sql("SELECT name FROM sqlite_master WHERE type='table';", conn))

print("\nspotify_tracks (5 lignes) :")
try:
    df = pd.read_sql("SELECT * FROM spotify_tracks LIMIT 5;", conn)
    print(df)
except Exception as e:
    print("Erreur:", e)

conn.close()

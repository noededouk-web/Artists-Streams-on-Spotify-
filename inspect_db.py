import sqlite3
import os

db_path = os.path.join("data", "spotify.db")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
print("Tables :", cur.fetchall())

cur.execute("SELECT * FROM spotify_streams LIMIT 50;")
for row in cur.fetchall():
    print(row)

conn.close()

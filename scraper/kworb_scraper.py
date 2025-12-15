import os
import sys
import re
from datetime import datetime

import pandas as pd
import requests
from io import StringIO
from ftfy import fix_text  # pip install ftfy

# Ajouter le dossier racine du projet au sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

from database.db import create_table, insert_dataframe, delete_artist_date  # type: ignore


def safe_int(val):
    try:
        if pd.isna(val):
            return 0
    except Exception:
        pass

    if isinstance(val, (int, float)):
        return int(val)

    if isinstance(val, str):
        cleaned = re.sub(r"[^\d\-+]", "", val)
        if cleaned in ("", "-", "+", ""):
            return 0
        try:
            return int(cleaned)
        except ValueError:
            return 0

    return 0


def scrape_kworb_spotify_fixed(artist_id: str, artist_name: str):
    url = f"https://kworb.net/spotify/artist/{artist_id}_songs.html"
    headers = {"User-Agent": "Mozilla/5.0"}

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    html_str = response.text
    tables = pd.read_html(StringIO(html_str), flavor="lxml")

    # ===== Stats globales =====
    stats_df = tables[0]
    stats_df.columns = [c.strip() for c in stats_df.columns]

    stats = {
        "total_streams": int(stats_df.loc[0, "Total"]),
        "total_daily": int(stats_df.loc[1, "Total"]),
        "lead_streams": int(stats_df.loc[0, "As lead"]),
        "solo_streams": int(stats_df.loc[0, "Solo"]),
    }

    # ===== Chansons =====
    songs_df = tables[1]
    songs_df.columns = ["title_raw", "streams", "daily"]

    songs_df["streams_num"] = songs_df["streams"].apply(safe_int)
    songs_df["daily_num"] = songs_df["daily"].apply(safe_int)

    # 1) Corriger l'encodage foireux (MosaÃ¯que -> Mosaïque, etc.)
    songs_df["title_clean"] = songs_df["title_raw"].astype(str).apply(fix_text)

    # 2) Type feat / solo via astérisque en début de titre
    songs_df["is_featured"] = songs_df["title_clean"].str.startswith("*")

    # Enlever astérisque + espace éventuel
    songs_df["title_clean"] = songs_df["title_clean"].str.replace(
        r"^\*\s*", "", regex=True
    )

    # 3) Enlever préfixes de type "Γ. ", "Θ. ", "Î. " (tout bloc sans espace + point + espace)
    songs_df["title_clean"] = songs_df["title_clean"].str.replace(
        r"^[^ ]+\.\s*", "", regex=True
    )

    # À partir d'ici, title_clean = "Mosaïque solitaire"
    # Si tu veux VRAIMENT enlever les accents (Mosaique solitaire), tu peux rajouter:
    # from unidecode import unidecode
    # songs_df["title_clean"] = songs_df["title_clean"].apply(lambda s: unidecode(str(s)))

    songs_df["track_type"] = songs_df["is_featured"].apply(
        lambda x: "feat" if x else "solo"
    )
    songs_df["album_name"] = None
    songs_df["artist_name"] = artist_name

    scraping_date = datetime.now().strftime("%Y-%m-%d")

    songs_db_df = pd.DataFrame(
        {
            "artist_name": songs_df["artist_name"],
            "track_name": songs_df["title_clean"],
            "album_name": songs_df["album_name"],
            "track_type": songs_df["track_type"],
            "streams_total": songs_df["streams_num"],
            "streams_daily": songs_df["daily_num"],
            "scraping_date": scraping_date,
        }
    )

    os.makedirs("data", exist_ok=True)
    songs_db_df.to_csv(
        f"data/{artist_name}_spotify_top_songs.csv", index=False, encoding="utf-8"
    )

    print(f"✅ CSV exporté: data/{artist_name}_spotify_top_songs.csv")
    print(f"Statistiques globales:\n{stats}")
    print(
        "Top 10 chansons:\n",
        songs_df[["title_raw", "title_clean", "streams_num", "daily_num", "track_type"]]
        .head(10)
    )

    return stats, songs_db_df


if __name__ == "__main__":
    artist_id = "2UwqpfQtNuhBwviIC0f2ie"
    artist_name = "Damso"

    stats, songs_df = scrape_kworb_spotify_fixed(artist_id, artist_name)

    create_table()

    scraping_date = songs_df["scraping_date"].iloc[0]
    delete_artist_date(artist_name, scraping_date)

    insert_dataframe(songs_df)
    print("✅ Pipelines scraping + remplacement journée terminés")

"""
album_enrichment.py

Enrichit les données en récupérant les tracks de chaque album
via sp.album_tracks() — endpoint accessible sans quota étendu.

Stratégie :
    1. Récupère les spotify_album_id depuis kworb_albums
    2. Pour chaque album → sp.album_tracks() → liste des tracks
    3. Extrait track_id, track_name, artistes
    4. Classifie solo/feat selon len(artists) > 1
    5. Stocke dans la table album_tracks

Avantage vs /v1/tracks batch :
    - sp.album_tracks() fonctionne sans quota étendu
    - Les featured artists sont natifs dans la réponse
    - Jointure possible par track_id (fiable) ou track_name (fallback)
"""

import time
import spotipy
import pandas as pd

from config import API_DELAY


# =========================
# ENRICHISSEMENT PRINCIPAL
# =========================

def enrich_albums_with_tracks(
    sp: spotipy.Spotify,
    df_kworb_albums: pd.DataFrame,
    artist_name: str,
    artist_spotify_id: str,
    delay: float = API_DELAY,
) -> pd.DataFrame:
    """
    Récupère tous les tracks de chaque album via sp.album_tracks().

    Args:
        sp                : Client Spotify authentifié
        df_kworb_albums   : DataFrame kworb_albums avec spotify_album_id
        artist_name       : Nom de l'artiste
        artist_spotify_id : ID Spotify de l'artiste
        delay             : Délai entre les appels API (secondes)

    Returns:
        DataFrame avec colonnes :
            artist_name, track_id, track_name,
            album_id, album_name,
            track_type, featured_artists,
            track_number, disc_number
    """
    df = df_kworb_albums[
        df_kworb_albums["artist_name"] == artist_name
    ].copy()

    # Filtre les albums avec un spotify_album_id valide
    df_with_id = df[df["spotify_album_id"].notna()]

    if df_with_id.empty:
        print(f"   ⚠️  Aucun spotify_album_id disponible pour {artist_name}")
        return pd.DataFrame()

    print(f"   Albums à enrichir : {len(df_with_id)}")

    rows = []
    for _, album_row in df_with_id.iterrows():
        album_id   = album_row["spotify_album_id"]
        album_name = album_row["album_name"]

        tracks = _fetch_album_tracks(sp, album_id, delay)

        if not tracks:
            print(f"   ⚠️  Aucun track pour l'album : {album_name}")
            continue

        for track in tracks:
            track_artists = track.get("artists", [])
            if not track_artists:
                continue

            # Vérifie que l'artiste est bien sur ce track
            artist_ids = [a["id"] for a in track_artists]
            if artist_spotify_id not in artist_ids:
                continue

            # Classification solo/feat
            track_type = "feat" if len(track_artists) > 1 else "solo"

            # Featured artists = tous sauf le 1er artiste listé
            featured_artists = (
                ", ".join(a["name"] for a in track_artists[1:])
                if len(track_artists) > 1
                else None
            )

            rows.append({
                "artist_name":      artist_name,
                "track_id":         track.get("id"),
                "track_name":       track.get("name"),
                "album_id":         album_id,
                "album_name":       album_name,
                "track_type":       track_type,
                "featured_artists": featured_artists,
                "track_number":     track.get("track_number"),
                "disc_number":      track.get("disc_number"),
            })

        print(f"   ✅ {album_name} : {len(tracks)} tracks")
        time.sleep(delay)

    if not rows:
        return pd.DataFrame()

    df_result = pd.DataFrame(rows)
    df_result = df_result.drop_duplicates(subset=["track_id"]).reset_index(drop=True)

    _print_summary(df_result, artist_name)
    return df_result


# =========================
# FETCH TRACKS PAR ALBUM
# =========================

def _fetch_album_tracks(
    sp: spotipy.Spotify,
    album_id: str,
    delay: float = API_DELAY,
) -> list:
    """
    Récupère tous les tracks d'un album avec pagination.

    Returns:
        Liste de dicts track (raw Spotify)
    """
    tracks = []
    try:
        results = sp.album_tracks(album_id, limit=50)
        tracks.extend(results.get("items", []))

        # Pagination si album > 50 tracks
        while results.get("next"):
            time.sleep(delay)
            results = sp.next(results)
            tracks.extend(results.get("items", []))

    except Exception as e:
        print(f"   ⚠️  Erreur album_tracks ({album_id}) : {e}")

    return tracks


# =========================
# RÉSUMÉ
# =========================

def _print_summary(df: pd.DataFrame, artist_name: str):
    total  = len(df)
    feats  = int((df["track_type"] == "feat").sum())
    solos  = int((df["track_type"] == "solo").sum())
    albums = df["album_name"].nunique()

    print(f"\n📊 Enrichissement albums — {artist_name} :")
    print(f"   Albums traités : {albums}")
    print(f"   Tracks total   : {total}")
    print(f"   Solo           : {solos}")
    print(f"   Feat           : {feats}")

    if feats > 0:
        feat_tracks = df[df["track_type"] == "feat"][["track_name", "featured_artists"]]
        print(f"\n   Feats détectés :")
        for _, row in feat_tracks.iterrows():
            print(f"     • {row['track_name']} (feat. {row['featured_artists']})")
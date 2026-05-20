import time
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import pandas as pd


def get_spotify_client(client_id: str, client_secret: str) -> spotipy.Spotify:
    auth = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
    return spotipy.Spotify(auth_manager=auth)


def get_spotify_artist(sp: spotipy.Spotify, artist_name: str) -> tuple | None:
    """
    Recherche un artiste sur Spotify.
    Returns: (artist_name_normalisé, spotify_id, artist_image_url) ou None
    """
    results = sp.search(q=artist_name, type="artist", limit=10)
    items = results.get("artists", {}).get("items", [])
    if not items:
        return None

    search_clean = artist_name.strip().lower()
    exact = [a for a in items if a["name"].strip().lower() == search_clean]
    artist = exact[0] if exact else sorted(
        items, key=lambda a: a.get("popularity", 0), reverse=True
    )[0]

    images = artist.get("images", [])
    artist_image = images[0]["url"] if images else None

    return artist["name"], artist["id"], artist_image


def get_artist_tracks_with_albums(sp: spotipy.Spotify, artist_name: str) -> pd.DataFrame:
    """
    Récupère tous les titres d'un artiste avec métadonnées enrichies.

    ✅ Classification track_type (source de vérité = Spotify) :
        - solo : un seul artiste sur le titre
        - feat : plusieurs artistes sur le titre (peu importe qui est lead)

    Exemples :
        "Macarena" (Damso)             → solo
        "Pa Pa Paw" (Damso, X)         → feat
        "Mwaka Moon" (Kalash, Damso)   → feat

    Colonnes : artist_name, track_name, album_name, album_type, album_group,
               release_year, cover_url, track_popularity, role,
               track_type, featured_artists
    """
    res = sp.search(q=artist_name, type="artist", limit=10)
    items = res.get("artists", {}).get("items", [])
    if not items:
        return pd.DataFrame()

    search_clean = artist_name.strip().lower()
    exact = [a for a in items if a["name"].strip().lower() == search_clean]
    artist_obj = exact[0] if exact else sorted(
        items, key=lambda a: a.get("popularity", 0), reverse=True
    )[0]

    artist_id      = artist_obj["id"]
    artist_name_sp = artist_obj["name"]

    albums = _get_all_albums(sp, artist_id)
    albums = _deduplicate_albums(albums)

    rows = []
    for album in albums:
        meta   = _extract_album_meta(album)
        tracks = _get_album_tracks_with_popularity(sp, album["id"])

        for track in tracks:
            track_artists = track.get("artists", [])
            if not track_artists:
                continue

            artist_ids = [a["id"] for a in track_artists]
            if artist_id not in artist_ids:
                continue

            # Rôle : main = 1er artiste listé, featured = invité
            role = "main" if track_artists[0]["id"] == artist_id else "featured"

            # ✅ feat = plus d'un artiste sur le titre
            track_type = "feat" if len(track_artists) > 1 else "solo"

            # Noms des artistes en feat (tous sauf le 1er artiste du titre)
            featured_artists = ", ".join(
                a["name"] for a in track_artists[1:]
            ) if len(track_artists) > 1 else None

            rows.append({
                "artist_name":      artist_name_sp,
                "track_name":       track["name"],
                "album_name":       meta["album_name"],
                "album_type":       meta["album_type"],
                "album_group":      meta["album_group"],
                "release_year":     meta["release_year"],
                "cover_url":        meta["cover_url"],
                "track_popularity": track.get("popularity", 0),
                "role":             role,
                "track_type":       track_type,
                "featured_artists": featured_artists,
            })

        time.sleep(0.1)

    return pd.DataFrame(rows) if rows else pd.DataFrame()


# =========================
# FONCTIONS INTERNES
# =========================

def _get_all_albums(sp, artist_id: str) -> list:
    albums = []
    results = sp.artist_albums(
        artist_id,
        album_type="album,single,appears_on,compilation",
        limit=50,
    )
    albums.extend(results["items"])
    while results.get("next"):
        results = sp.next(results)
        albums.extend(results["items"])
    return albums


def _deduplicate_albums(albums: list) -> list:
    """Dédoublonne par nom, garde la version la plus récente."""
    seen = {}
    for album in albums:
        key = album["name"].strip().lower()
        if key not in seen:
            seen[key] = album
        else:
            if album.get("release_date", "0000") > seen[key].get("release_date", "0000"):
                seen[key] = album
    return list(seen.values())


def _extract_album_meta(album: dict) -> dict:
    release_date = album.get("release_date", "")
    release_year = int(release_date[:4]) if release_date and len(release_date) >= 4 else None
    images       = album.get("images", [])
    return {
        "album_name":   album["name"],
        "album_type":   album.get("album_type"),
        "album_group":  album.get("album_group"),
        "release_year": release_year,
        "cover_url":    images[0]["url"] if images else None,
    }


def _get_album_tracks_with_popularity(sp, album_id: str) -> list:
    tracks_raw = sp.album_tracks(album_id, limit=50)["items"]
    if not tracks_raw:
        return []

    track_ids      = [t["id"] for t in tracks_raw if t.get("id")]
    popularity_map = {}

    for i in range(0, len(track_ids), 50):
        details = sp.tracks(track_ids[i:i+50])
        for t in details.get("tracks", []):
            if t and t.get("id"):
                popularity_map[t["id"]] = t.get("popularity", 0)

    for track in tracks_raw:
        track["popularity"] = popularity_map.get(track.get("id", ""), 0)

    return tracks_raw
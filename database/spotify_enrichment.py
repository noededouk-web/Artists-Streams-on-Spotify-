"""
spotify_enrichment.py

Enrichit chaque titre kworb via track_id Spotify direct.

Stratégie en cascade :
    1. track_id disponible (extrait du HTML kworb)
       → sp.tracks(batch) par batch de 50 → données 100% fiables
    2. track_id manquant → recherche Spotify par titre + artiste
    3. Toujours manquant → fallback kworb_is_feat ('*')

Classification feat/solo :
    len(track["artists"]) > 1 → feat
    len(track["artists"]) == 1 → solo
"""

import time
import re
import unicodedata
import pandas as pd
import spotipy

try:
    from ftfy import fix_text
    HAS_FTFY = True
except ImportError:
    HAS_FTFY = False


# =========================
# ENRICHISSEMENT PRINCIPAL
# =========================

def enrich_tracks_with_spotify(
    sp: spotipy.Spotify,
    df_kworb: pd.DataFrame,
    artist_name: str,
    artist_spotify_id: str,
    delay: float = 0.1,
) -> pd.DataFrame:
    """
    Enrichit les titres kworb avec les métadonnées Spotify.

    Niveaux :
        1. Batch sp.tracks() sur les track_id connus  → rapide et fiable
        2. Recherche sp.search() pour les track_id manquants
        3. Fallback kworb_is_feat pour les non trouvés

    Returns:
        DataFrame enrichi avec track_type, featured_artists, album_name,
        cover_url, release_year, album_type, track_popularity, match_source
    """
    df = df_kworb[df_kworb["artist_name"] == artist_name].copy()

    for col in ["track_type", "featured_artists", "album_name", "cover_url",
                "release_year", "album_type", "track_popularity", "match_source"]:
        if col not in df.columns:
            df[col] = None

    # ── Niveau 1 : batch par track_id ────────────────────────────────────
    mask_with_id = df["spotify_track_id"].notna()
    track_ids    = df.loc[mask_with_id, "spotify_track_id"].tolist()

    if track_ids:
        print(f"🎵 Enrichissement batch Spotify : {len(track_ids)} titres avec track_id...")
        track_data = _batch_fetch_tracks(sp, track_ids, delay)

        for idx, row in df[mask_with_id].iterrows():
            tid  = row["spotify_track_id"]
            data = track_data.get(tid)

            if data:
                df.at[idx, "track_type"]       = data["track_type"]
                df.at[idx, "featured_artists"] = data["featured_artists"]
                df.at[idx, "album_name"]       = data["album_name"]
                df.at[idx, "cover_url"]        = data["cover_url"]
                df.at[idx, "release_year"]     = data["release_year"]
                df.at[idx, "album_type"]       = data["album_type"]
                df.at[idx, "track_popularity"] = data["track_popularity"]
                df.at[idx, "match_source"]     = "spotify_batch"
            else:
                # track_id invalide ou retiré de Spotify
                df.at[idx, "track_type"]   = "feat" if row.get("kworb_is_feat") else "solo"
                df.at[idx, "match_source"] = "kworb_fallback"

    # ── Niveau 2 : recherche pour les track_id manquants ─────────────────
    mask_missing = ~mask_with_id
    missing_rows = df[mask_missing]

    if not missing_rows.empty:
        print(f"🔍 Recherche Spotify pour {len(missing_rows)} titres sans track_id...")
        for idx, row in missing_rows.iterrows():
            result = _search_track(sp, row["track_name"], artist_name, artist_spotify_id)
            time.sleep(delay)

            if result:
                df.at[idx, "track_type"]       = result["track_type"]
                df.at[idx, "featured_artists"] = result["featured_artists"]
                df.at[idx, "album_name"]       = result["album_name"]
                df.at[idx, "cover_url"]        = result["cover_url"]
                df.at[idx, "release_year"]     = result["release_year"]
                df.at[idx, "album_type"]       = result["album_type"]
                df.at[idx, "track_popularity"] = result["track_popularity"]
                df.at[idx, "match_source"]     = "spotify_search"
            else:
                # ── Niveau 3 : fallback kworb ─────────────────────────────
                df.at[idx, "track_type"]   = "feat" if row.get("kworb_is_feat") else "solo"
                df.at[idx, "match_source"] = "kworb_fallback"
                print(f"  ⚠️  Fallback kworb : '{row['track_name']}'")

    # ── Résumé ────────────────────────────────────────────────────────────
    _print_summary(df)
    return df


# =========================
# BATCH FETCH PAR TRACK_ID
# =========================

def _batch_fetch_tracks(
    sp: spotipy.Spotify,
    track_ids: list,
    delay: float = 0.1,
) -> dict:
    """
    Récupère les métadonnées Spotify pour une liste de track_id.
    Batch de 50 (limite API Spotify).

    Returns:
        dict {track_id: metadata_dict}
    """
    result = {}

    for i in range(0, len(track_ids), 50):
        batch = [tid for tid in track_ids[i:i+50] if tid]
        if not batch:
            continue

        try:
            response = sp.tracks(batch)
            for track in response.get("tracks", []):
                if not track:
                    continue

                track_artists = track.get("artists", [])
                album         = track.get("album", {})
                release_date  = album.get("release_date", "")
                release_year  = int(release_date[:4]) if release_date and len(release_date) >= 4 else None
                images        = album.get("images", [])

                # ✅ Règle feat : plusieurs artistes sur le titre
                track_type = "feat" if len(track_artists) > 1 else "solo"
                featured   = ", ".join(a["name"] for a in track_artists[1:]) if len(track_artists) > 1 else None

                result[track["id"]] = {
                    "track_type":       track_type,
                    "featured_artists": featured,
                    "album_name":       album.get("name"),
                    "album_type":       album.get("album_type"),
                    "cover_url":        images[0]["url"] if images else None,
                    "release_year":     release_year,
                    "track_popularity": track.get("popularity", 0),
                }
        except Exception as e:
            print(f"  ⚠️  Erreur batch tracks (i={i}) : {e}")
            time.sleep(1)

        time.sleep(delay)

    return result


# =========================
# RECHERCHE PAR TITRE (fallback)
# =========================

def _normalize(title: str) -> str:
    """Normalise un titre pour comparaison."""
    title = title.lower()
    title = re.sub(r"\(.*?\)", "", title)
    title = re.sub(r"\[.*?\]", "", title)
    title = unicodedata.normalize("NFD", title)
    title = "".join(c for c in title if unicodedata.category(c) != "Mn")
    title = re.sub(r"[^\w\s]", " ", title)
    return re.sub(r"\s+", " ", title).strip()


def _titles_match(a: str, b: str) -> bool:
    na, nb = _normalize(a), _normalize(b)
    if not na or not nb:
        return False
    if na == nb or na in nb or nb in na:
        return True
    words_a = {w for w in na.split() if len(w) > 2}
    words_b = {w for w in nb.split() if len(w) > 2}
    if not words_a:
        return False
    return len(words_a & words_b) / len(words_a) >= 0.75


def _search_track(
    sp: spotipy.Spotify,
    title: str,
    artist_name: str,
    artist_spotify_id: str,
) -> dict | None:
    """Recherche un titre sur Spotify quand le track_id est inconnu."""
    # Variantes de recherche
    clean = _normalize(title)
    queries = [
        f'track:"{title}" artist:"{artist_name}"',
        f'"{title}" {artist_name}',
        title,
    ]
    # Ajoute une variante sans accents si différente
    no_accent = unicodedata.normalize("NFD", title)
    no_accent = "".join(c for c in no_accent if unicodedata.category(c) != "Mn")
    if no_accent != title:
        queries.insert(1, f'track:"{no_accent}" artist:"{artist_name}"')

    for query in queries:
        try:
            results = sp.search(q=query, type="track", limit=10)
            tracks  = results.get("tracks", {}).get("items", [])

            for track in tracks:
                track_artists   = track.get("artists", [])
                artist_ids      = [a["id"] for a in track_artists]
                artist_names_lc = [a["name"].lower() for a in track_artists]

                if artist_spotify_id not in artist_ids and artist_name.lower() not in artist_names_lc:
                    continue
                if not _titles_match(title, track["name"]):
                    continue

                # Match trouvé
                album        = track.get("album", {})
                release_date = album.get("release_date", "")
                release_year = int(release_date[:4]) if release_date and len(release_date) >= 4 else None
                images       = album.get("images", [])
                track_type   = "feat" if len(track_artists) > 1 else "solo"
                featured     = ", ".join(a["name"] for a in track_artists[1:]) if len(track_artists) > 1 else None

                return {
                    "track_type":       track_type,
                    "featured_artists": featured,
                    "album_name":       album.get("name"),
                    "album_type":       album.get("album_type"),
                    "cover_url":        images[0]["url"] if images else None,
                    "release_year":     release_year,
                    "track_popularity": track.get("popularity", 0),
                }

        except Exception as e:
            print(f"  ⚠️  Erreur search '{title}' : {e}")
            time.sleep(1)

    return None


# =========================
# RÉSUMÉ
# =========================

def _print_summary(df: pd.DataFrame):
    total   = len(df)
    sources = df.get("match_source", pd.Series(dtype=str))
    batch   = int((sources == "spotify_batch").sum())
    search  = int((sources == "spotify_search").sum())
    kworb   = int((sources == "kworb_fallback").sum())
    feats   = int((df.get("track_type", pd.Series(dtype=str)) == "feat").sum())
    solos   = int((df.get("track_type", pd.Series(dtype=str)) == "solo").sum())

    print(f"\n📊 Résultats enrichissement :")
    print(f"   Spotify batch  : {batch}/{total} ({round(batch/total*100,1)}%)")
    print(f"   Spotify search : {search}/{total} ({round(search/total*100,1)}%)")
    print(f"   Fallback kworb : {kworb}/{total} ({round(kworb/total*100,1)}%)")
    print(f"   Solo : {solos} · Feat : {feats}")


def enrichment_stats(df: pd.DataFrame) -> dict:
    total   = len(df)
    if total == 0:
        return {}
    sources = df.get("match_source", pd.Series(dtype=str))
    batch   = int((sources == "spotify_batch").sum())
    search  = int((sources == "spotify_search").sum())
    kworb   = int((sources == "kworb_fallback").sum())
    feats   = int((df.get("track_type", pd.Series(dtype=str)) == "feat").sum())
    solos   = int((df.get("track_type", pd.Series(dtype=str)) == "solo").sum())
    return {
        "total":          total,
        "spotify_batch":  batch,
        "spotify_search": search,
        "kworb_fallback": kworb,
        "spotify_direct": batch + search,
        "match_rate":     round((batch + search) / total * 100, 1),
        "feats":          feats,
        "solos":          solos,
    }
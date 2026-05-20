"""
kworb_scraper.py

Scrape kworb.net et extrait :

  Tableau Songs :
    - streams / daily par titre
    - track_id Spotify depuis les liens <a href> du HTML
    - marqueur feat (*) comme signal de fallback

  Tableau Albums :
    - streams / daily par album
    - album_id Spotify depuis les liens <a href> du HTML
    - type d'album (album, single, compilation, appears_on)

Le track_id / album_id Spotify permet d'appeler directement l'API
sans fuzzy matching ni recherche approximative.
"""

import re
import unicodedata
from datetime import datetime
from io import StringIO

import pandas as pd
import requests
from bs4 import BeautifulSoup

try:
    from ftfy import fix_text as ftfy_fix
    HAS_FTFY = True
except ImportError:
    HAS_FTFY = False


# =========================
# UTILITAIRES
# =========================

MOJIBAKE_MAP = {
    "Ã©": "é", "Ã¨": "è", "Ãª": "ê", "Ã«": "ë",
    "Ã ": "à", "Ã¢": "â", "Ã¤": "ä",
    "Ã§": "ç",
    "Ã®": "î", "Ã¯": "ï",
    "Ã´": "ô", "Ã¶": "ö",
    "Ã»": "û", "Ã¼": "ü",
}

KWORB_PREFIX_PATTERN = re.compile(
    r"^(?:"
    r"\*\s*|"
    r"[^\w\s]{1,3}\.\s*|"
    r"[A-Z]{1,3}\.\s+"
    r")"
)


def fix_encoding(text: str) -> str:
    if not isinstance(text, str):
        return str(text)
    if HAS_FTFY:
        text = ftfy_fix(text)
    for bad, good in MOJIBAKE_MAP.items():
        text = text.replace(bad, good)
    return text.strip()


def clean_title(raw: str) -> str:
    """Nettoie un titre kworb : encodage + suppression préfixe + strip."""
    title = fix_encoding(raw)
    title = re.sub(r"^\*\s*", "", title)
    title = KWORB_PREFIX_PATTERN.sub("", title)
    return title.strip()


def is_kworb_feat(raw: str) -> bool:
    """True si le titre commence par '*' (artiste est invité)."""
    return str(raw).strip().startswith("*")


def safe_int(val) -> int:
    try:
        if pd.isna(val):
            return 0
    except Exception:
        pass
    # Gère numpy.int64, numpy.float64, etc.
    if hasattr(val, "item"):
        return int(val.item())
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, str):
        cleaned = re.sub(r"[^\d\-]", "", val)
        if cleaned in ("", "-"):
            return 0
        try:
            return int(cleaned)
        except ValueError:
            return 0
    return 0


def extract_spotify_id_from_url(href: str) -> str | None:
    """
    Extrait un ID Spotify (track ou album) depuis une URL kworb ou Spotify.

    Exemples :
        "/spotify/track/2ewjMyCbNv2X1dB2qIDCwD.html"  → "2ewjMyCbNv2X1dB2qIDCwD"
        "/spotify/album/4QLAtpDGyfU2gMgBLMzBmD.html"  → "4QLAtpDGyfU2gMgBLMzBmD"
        "https://open.spotify.com/album/4QLAtpDGyfU2gMgBLMzBmD" → "4QLAtpDGyfU2gMgBLMzBmD"
    """
    if not href:
        return None
    match = re.search(r"(?:track|album)[/\-_]([A-Za-z0-9]{22})", href)
    return match.group(1) if match else None


def _fetch_page(url: str) -> str:
    """Télécharge une page kworb et retourne le HTML brut."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            return None
        raise
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Erreur réseau : {e}")
    return response.text


# =========================
# SCRAPER SONGS
# =========================

def _scrape_songs(html: str, artist_name: str) -> pd.DataFrame:
    """
    Extrait le tableau Songs depuis le HTML kworb.

    Colonnes retournées :
        artist_name, track_name, track_type (provisoire kworb),
        kworb_is_feat, spotify_track_id,
        streams_total, streams_daily, scraping_date
    """
    soup   = BeautifulSoup(html, "lxml")
    tables = soup.find_all("table")

    if len(tables) < 2:
        raise RuntimeError("Structure kworb inattendue : moins de 2 tableaux.")

    # Tableau Songs = 2e tableau (index 1)
    songs_table = tables[1]
    rows_html   = songs_table.find_all("tr")[1:]  # skip header

    raw_titles = []
    track_ids  = []

    for row in rows_html:
        cells = row.find_all("td")
        if not cells:
            continue
        title_cell = cells[0]
        link       = title_cell.find("a", href=True)
        raw_title  = title_cell.get_text(strip=True)
        track_id   = extract_spotify_id_from_url(link["href"]) if link else None
        raw_titles.append(raw_title)
        track_ids.append(track_id)

    # Streams via pandas
    try:
        pd_tables = pd.read_html(StringIO(html), flavor="lxml")
    except Exception as e:
        raise RuntimeError(f"Impossible de parser les tableaux HTML : {e}")

    if len(pd_tables) < 2:
        raise RuntimeError("Structure kworb inattendue.")

    songs_raw = pd_tables[1].copy()
    songs_raw.columns = ["title_raw", "streams", "daily"]
    songs_raw["streams_total"] = songs_raw["streams"].apply(safe_int)
    songs_raw["streams_daily"] = songs_raw["daily"].apply(safe_int)

    n = min(len(songs_raw), len(track_ids))

    df = pd.DataFrame({
        "artist_name":      artist_name,
        "track_name":       [clean_title(t) for t in raw_titles[:n]],
        "track_type":       ["feat" if is_kworb_feat(t) else "solo" for t in raw_titles[:n]],
        "kworb_is_feat":    [is_kworb_feat(t) for t in raw_titles[:n]],
        "spotify_track_id": track_ids[:n],
        "streams_total":    songs_raw["streams_total"].values[:n],
        "streams_daily":    songs_raw["streams_daily"].values[:n],
        "scraping_date":    datetime.now().strftime("%Y-%m-%d"),
    })

    df = df[df["track_name"].str.strip() != ""]
    df = df[df["streams_total"] > 0]
    df = df.reset_index(drop=True)

    n_with_id = df["spotify_track_id"].notna().sum()
    print(f"   Songs  : {len(df)} titres scrapés — {n_with_id} avec track_id Spotify")

    return df


# =========================
# SCRAPER ALBUMS
# =========================

def _scrape_albums(html: str, artist_name: str) -> pd.DataFrame:
    """
    Extrait le tableau Albums depuis le HTML de la page _albums.html kworb.

    Colonnes retournées :
        artist_name, album_name, spotify_album_id,
        streams_total, streams_daily, scraping_date
    """
    soup      = BeautifulSoup(html, "lxml")
    tables    = soup.find_all("table")

    if not tables:
        raise RuntimeError("Aucun tableau trouvé sur la page albums kworb.")

    # Sur _albums.html, le tableau principal est le 1er
    albums_table = tables[0]
    rows_html    = albums_table.find_all("tr")[1:]  # skip header

    raw_names = []
    album_ids = []

    for row in rows_html:
        cells = row.find_all("td")
        if not cells:
            continue
        name_cell = cells[0]
        link      = name_cell.find("a", href=True)
        raw_name  = name_cell.get_text(strip=True)
        album_id  = extract_spotify_id_from_url(link["href"]) if link else None
        raw_names.append(raw_name)
        album_ids.append(album_id)

    # Streams via pandas
    try:
        pd_tables = pd.read_html(StringIO(html), flavor="lxml")
    except Exception as e:
        raise RuntimeError(f"Impossible de parser les tableaux HTML albums : {e}")

    if not pd_tables:
        raise RuntimeError("Aucun tableau pandas trouvé sur la page albums.")

    albums_raw = pd_tables[0].copy()
    cols       = [str(c).strip().lower() for c in albums_raw.columns]
    albums_raw.columns = cols

    # Détection flexible des colonnes (noms kworb peuvent varier)
    streams_col = next(
        (c for c in cols if "stream" in c or "total" in c),
        cols[1] if len(cols) > 1 else None,
    )
    daily_col = next(
        (c for c in cols if "daily" in c),
        cols[2] if len(cols) > 2 else None,
    )

    n = min(len(albums_raw), len(raw_names))

    streams_vals = albums_raw[streams_col].apply(safe_int).values[:n] if streams_col else [0] * n
    daily_vals   = albums_raw[daily_col].apply(safe_int).values[:n]   if daily_col   else [0] * n

    df = pd.DataFrame({
        "artist_name":      artist_name,
        "album_name":       [clean_title(t) for t in raw_names[:n]],
        "spotify_album_id": album_ids[:n],
        "streams_total":    streams_vals,
        "streams_daily":    daily_vals,
        "scraping_date":    datetime.now().strftime("%Y-%m-%d"),
    })

    df = df[df["album_name"].str.strip() != ""]
    df = df[df["streams_total"] > 0]
    df = df.reset_index(drop=True)

    n_with_id = df["spotify_album_id"].notna().sum()
    print(f"   Albums : {len(df)} albums scrapés — {n_with_id} avec album_id Spotify")

    return df


# =========================
# SCRAPER GLOBAL STATS
# =========================

def _scrape_stats(html: str) -> dict:
    """
    Extrait les stats globales depuis le 1er tableau kworb.

    Structure attendue :
        Unnamed: 0 | Total | As lead | Solo | As feature (*)
        Streams    | ...   | ...     | ...  | ...
        Daily      | ...   | ...     | ...  | ...
        Tracks     | ...   | ...     | ...  | ...
    """
    try:
        pd_tables = pd.read_html(StringIO(html), flavor="lxml")
    except Exception:
        return {}

    if not pd_tables:
        return {}

    df = pd_tables[0].copy()

    # Normalise les noms de colonnes
    df.columns = [str(c).strip() for c in df.columns]

    # Normalise la colonne index (Unnamed: 0)
    label_col = df.columns[0]
    df[label_col] = df[label_col].astype(str).str.strip().str.lower()

    # Récupère les lignes par label
    row_streams = df[df[label_col] == "streams"]
    row_daily   = df[df[label_col] == "daily"]

    if row_streams.empty or row_daily.empty:
        return {}

    def _get(row, col_candidates):
        """Récupère une valeur depuis plusieurs noms de colonnes possibles."""
        for col in col_candidates:
            if col in row.columns:
                return safe_int(row.iloc[0][col])
        return 0

    return {
        "total_streams": _get(row_streams, ["Total", "total"]),
        "total_daily":   _get(row_daily,   ["Total", "total"]),
        "lead_streams":  _get(row_streams, ["As lead", "as lead", "Lead"]),
        "solo_streams":  _get(row_streams, ["Solo", "solo"]),
    }


# =========================
# POINT D'ENTRÉE PRINCIPAL
# =========================

def scrape_kworb_spotify(artist_id: str, artist_name: str) -> tuple:
    """
    Scrape les pages kworb.net d'un artiste.

    Deux appels HTTP :
        - {artist_id}_songs.html  → stats globales + tableau Songs
        - {artist_id}_albums.html → tableau Albums

    Returns:
        (stats dict, df_songs DataFrame, df_albums DataFrame)
        ou (None, None, None) si page songs introuvable (404)
        df_albums peut être un DataFrame vide si _albums.html est introuvable.

    DataFrame songs columns :
        artist_name, track_name, track_type, kworb_is_feat,
        spotify_track_id, streams_total, streams_daily, scraping_date

    DataFrame albums columns :
        artist_name, album_name, spotify_album_id,
        streams_total, streams_daily, scraping_date
    """
    # ── Page Songs (stats globales + titres) ─────────────────────────────
    url_songs = f"https://kworb.net/spotify/artist/{artist_id}_songs.html"
    html_songs = _fetch_page(url_songs)

    if html_songs is None:
        return None, None, None

    print(f"   Songs page  : {len(html_songs):,} caractères")

    stats    = _scrape_stats(html_songs)
    df_songs = _scrape_songs(html_songs, artist_name)

    # ── Page Albums ───────────────────────────────────────────────────────
    url_albums = f"https://kworb.net/spotify/artist/{artist_id}_albums.html"
    html_albums = _fetch_page(url_albums)

    if html_albums is None:
        print(f"   Albums page : introuvable (404) — df_albums vide")
        df_albums = pd.DataFrame()
    else:
        print(f"   Albums page : {len(html_albums):,} caractères")
        df_albums = _scrape_albums(html_albums, artist_name)

    return stats, df_songs, df_albums


# Alias pour compatibilité descendante
scrape_kworb_spotify_fixed = scrape_kworb_spotify
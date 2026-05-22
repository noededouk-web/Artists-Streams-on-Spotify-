"""
kworb_youtube.py — Scraper Kworb YouTube.

Données collectées par artiste :
  - Total views cumulées
  - Daily views (moyenne actuelle)
  - Liste des vidéos : titre, video_id, views, daily, date publi, solo/feat

URL pattern : https://kworb.net/youtube/artist/{slug}.html
Slug        : nom en minuscules sans espaces (ex: "Aya Nakamura" -> "ayanakamura")
"""

import re
import time
import unicodedata
import requests
import pandas as pd
from bs4 import BeautifulSoup

ARCHIVE_URL = "https://kworb.net/youtube/archive.html"
BASE_URL    = "https://kworb.net/youtube/artist/{slug}.html"
HEADERS     = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


# ─── Résolution du slug ───────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    """Normalise une chaîne pour comparaison : minuscules, sans accents, sans espaces."""
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", ascii_str.lower())


def fetch_artist_archive() -> dict[str, str]:
    """Retourne un dict {nom_normalisé: slug} depuis la page archive Kworb YouTube."""
    r = requests.get(ARCHIVE_URL, headers=HEADERS, timeout=15)
    r.raise_for_status()
    r.encoding = "utf-8"
    soup = BeautifulSoup(r.text, "lxml")
    mapping = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("artist/") and href.endswith(".html"):
            slug = href[len("artist/"):-len(".html")]
            name = a.get_text(strip=True)
            mapping[_normalize(name)] = slug
    return mapping


def resolve_slug(artist_name: str, archive: dict[str, str] | None = None) -> str | None:
    """
    Trouve le slug Kworb YouTube pour un artiste.
    Essaie d'abord la correspondance exacte dans l'archive,
    puis tente le slug dérivé directement du nom.
    """
    if archive is None:
        archive = fetch_artist_archive()

    key = _normalize(artist_name)

    # Correspondance exacte
    if key in archive:
        return archive[key]

    # Correspondance partielle (le nom contient ou est contenu)
    for norm_name, slug in archive.items():
        if key in norm_name or norm_name in key:
            return slug

    # Tentative directe avec le slug dérivé du nom
    candidate = key
    url = BASE_URL.format(slug=candidate)
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code == 200:
            return candidate
    except Exception:
        pass

    return None


# ─── Parsing ─────────────────────────────────────────────────────────────────

def _parse_int(text: str) -> int:
    """Convertit '1,234,567' en 1234567."""
    clean = re.sub(r"[^\d]", "", text)
    return int(clean) if clean else 0


def scrape_kworb_youtube(artist_name: str, slug: str) -> tuple[dict, pd.DataFrame]:
    """
    Scrape la page Kworb YouTube d'un artiste.

    Args:
        artist_name : Nom canonical de l'artiste (pour les métadonnées)
        slug        : Identifiant Kworb (ex: 'sch', 'ayanakamura')

    Returns:
        stats    : dict avec total_views et daily_views
        df_videos: DataFrame avec une ligne par vidéo
    """
    url = BASE_URL.format(slug=slug)
    r   = requests.get(url, headers=HEADERS, timeout=15)
    if r.status_code == 404:
        raise ValueError(f"Artiste '{artist_name}' introuvable sur Kworb YouTube (slug: {slug})")
    r.raise_for_status()
    r.encoding = "utf-8"

    soup   = BeautifulSoup(r.text, "lxml")
    tables = soup.find_all("table")

    if len(tables) < 2:
        raise ValueError(f"Structure inattendue pour '{artist_name}' (< 2 tables)")

    # ── Table 0 : stats globales ──
    t0_rows = tables[0].find_all("tr")
    total_views = 0
    daily_views = 0
    for row in t0_rows:
        cells = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]
        if len(cells) >= 2:
            label, value = cells[0].lower(), cells[1]
            if "total" in label:
                total_views = _parse_int(value)
            elif "daily" in label:
                daily_views = _parse_int(value)

    stats = {
        "artist_name": artist_name,
        "kworb_slug":  slug,
        "total_views": total_views,
        "daily_views": daily_views,
    }

    # ── Table 1 : vidéos ──
    rows = tables[1].find_all("tr")
    records = []
    today   = pd.Timestamp.today().strftime("%Y-%m-%d")

    for row in rows[1:]:  # skip header
        tds = row.find_all("td")
        if not tds:
            continue

        # Titre + lien
        td_title = tds[0]
        a_tag    = td_title.find("a")
        raw_title = td_title.get_text(strip=True)

        # Feat si préfixe '*'
        is_feat   = raw_title.startswith("*")
        video_title = raw_title.lstrip("*").strip()

        # Extraction du video_id depuis le href (../video/VIDEO_ID.html)
        video_id = None
        if a_tag and a_tag.get("href"):
            m = re.search(r"/video/([A-Za-z0-9_\-]+)\.html", a_tag["href"])
            if m:
                video_id = m.group(1)

        views   = _parse_int(tds[1].get_text(strip=True)) if len(tds) > 1 else 0
        daily   = _parse_int(tds[2].get_text(strip=True)) if len(tds) > 2 else 0
        pub_raw = tds[3].get_text(strip=True)              if len(tds) > 3 else ""

        # Date de publication : "2020/08" → "2020-08-01"
        pub_date = None
        m_date = re.match(r"(\d{4})/(\d{2})", pub_raw)
        if m_date:
            pub_date = f"{m_date.group(1)}-{m_date.group(2)}-01"

        records.append({
            "artist_name":  artist_name,
            "video_title":  video_title,
            "video_id":     video_id,
            "video_type":   "feat" if is_feat else "solo",
            "total_views":  views,
            "daily_views":  daily,
            "published":    pub_date,
            "scraping_date": today,
        })

    df_videos = pd.DataFrame(records)
    return stats, df_videos

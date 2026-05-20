"""
pipeline.py — Orchestrateur du pipeline complet.

Étapes :
    1. Résolution artiste Spotify → name, spotify_id, artist_image
    2. Scraping Kworb Songs      → streams par titre → spotify_streams
    3. Scraping Kworb Albums     → streams par album → kworb_albums
    4. Enrichissement par albums → sp.album_tracks() → album_tracks
                                    (feat, solo, featured_artists)
    5. Export Power BI           → CSV + Excel dans data/exports/

Usage CLI :
    python pipeline.py --artist "Damso"
    python pipeline.py --artist "Damso" --force-scrape
    python pipeline.py --artist "Damso" --force-enrich
    python pipeline.py --artist "Damso" --no-export
    python pipeline.py --artist "Damso" --kworb-id <id_différent>
"""

import argparse
import sys
from datetime import date

import pandas as pd

from config import SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
from database.db import (
    init_db,
    get_artist_by_name,
    insert_artist,
    streams_exist_today,
    kworb_albums_exist_today,
    insert_streams,
    insert_kworb_albums,
    insert_stats,
    get_streams,
    get_kworb_albums,
    insert_album_tracks,
    album_tracks_exist,
)
from database.spotify import get_spotify_client, get_spotify_artist
from database.album_enrichment import enrich_albums_with_tracks
from export.exporter import export_all
from scraper.kworb_scraper import scrape_kworb_spotify


# =========================
# PIPELINE PRINCIPAL
# =========================

def run_pipeline(
    artist_input: str,
    client_id: str         = SPOTIFY_CLIENT_ID,
    client_secret: str     = SPOTIFY_CLIENT_SECRET,
    force_scrape: bool     = False,
    force_enrich: bool     = False,
    kworb_id_override: str = None,
    skip_export: bool      = False,
    log_callback           = None,
) -> dict:
    """
    Exécute le pipeline complet pour un artiste.

    Args:
        artist_input      : Nom de l'artiste (tel que saisi par l'utilisateur)
        client_id         : Spotify client ID
        client_secret     : Spotify client secret
        force_scrape      : Force le re-scraping même si données déjà présentes aujourd'hui
        force_enrich      : Force le ré-enrichissement Spotify même si déjà en DB
        kworb_id_override : Utilise cet ID kworb au lieu du spotify_id (si différent)
        skip_export       : Ne pas générer les exports Power BI

    Returns:
        dict avec les clés :
            artist_name, spotify_id, kworb_id, artist_image,
            scraping_done, enrich_done, export_done,
            df_songs, df_albums, df_enriched (selon les étapes exécutées),
            stats (kworb global), enrich_stats, export_files
    """
    result = {}

    def log(msg: str):
        _log(msg)
        if log_callback:
            log_callback(msg)

    # ── Init DB ──────────────────────────────────────────────────────────
    log("Initialisation de la base de données...")
    init_db()

    # ── Étape 1 : Résolution Spotify ─────────────────────────────────────
    log(f"Recherche de '{artist_input}' sur Spotify...")
    sp          = get_spotify_client(client_id, client_secret)
    artist_info = get_spotify_artist(sp, artist_input)

    if artist_info is None:
        raise ValueError(f"Artiste '{artist_input}' introuvable sur Spotify.")

    artist_name, spotify_id, artist_image = artist_info
    kworb_id = kworb_id_override or spotify_id
    log(f"Artiste résolu : {artist_name} (Spotify ID: {spotify_id})")

    # Mise à jour du cache artiste si nécessaire
    existing = get_artist_by_name(artist_name)
    if existing is None or existing.get("kworb_id") != kworb_id:
        insert_artist(artist_name, spotify_id, kworb_id, artist_image)

    result.update({
        "artist_name":  artist_name,
        "spotify_id":   spotify_id,
        "kworb_id":     kworb_id,
        "artist_image": artist_image,
    })

    # ── Étapes 2 & 3 : Scraping Kworb (Songs + Albums) ──────────────────
    today = date.today().strftime("%Y-%m-%d")

    songs_up_to_date  = not force_scrape and streams_exist_today(artist_name)
    albums_up_to_date = not force_scrape and kworb_albums_exist_today(artist_name)

    if songs_up_to_date and albums_up_to_date:
        log("Données Kworb déjà à jour pour aujourd'hui.")
        df_songs  = get_streams(artist_name, today)
        df_albums = None
        result["scraping_done"] = False

    else:
        log(f"Scraping Kworb (ID: {kworb_id})...")
        stats, df_songs, df_albums = scrape_kworb_spotify(kworb_id, artist_name)

        if stats is None or df_songs is None:
            raise ValueError(
                f"Page Kworb introuvable pour l'ID '{kworb_id}'.\n"
                "Utilise --kworb-id si l'ID Kworb est différent du Spotify ID."
            )

        scraping_date = df_songs["scraping_date"].iloc[0]

        # Insertion Songs
        if not songs_up_to_date:
            insert_streams(df_songs)
            log(f"Songs insérés : {len(df_songs)} titres")

        # Insertion Albums
        if df_albums is not None and not df_albums.empty and not albums_up_to_date:
            insert_kworb_albums(df_albums)
            log(f"Albums insérés : {len(df_albums)} albums")

        # Insertion stats globales
        insert_stats(artist_name, scraping_date, stats)

        log(
            f"Scraping terminé — "
            f"Total streams : {stats.get('total_streams', 0):,} | "
            f"Daily : {stats.get('total_daily', 0):,}"
        )

        result.update({
            "scraping_done": True,
            "stats":         stats,
            "df_albums":     df_albums,
        })

    result["df_songs"] = df_songs

    # ── Étapes 4 & 5 : Enrichissement Spotify (désactivé) ───────────────
    # Remplacé par l'enrichissement par albums (étape 5b)
    # L'endpoint /v1/tracks batch est bloqué (403) — on passe par sp.album_tracks()
    result["enrich_done"] = False

    # ── Étape 5b : Enrichissement par albums (album_tracks) ──────────────
    df_kworb_albums = result.get("df_albums")
    if df_kworb_albums is None:
        df_kworb_albums = get_kworb_albums(artist_name)

    if not force_enrich and album_tracks_exist(artist_name):
        log(f"Album tracks déjà en DB pour {artist_name}.")
        result["album_enrich_done"] = False
    elif isinstance(df_kworb_albums, pd.DataFrame) and not df_kworb_albums.empty:
        log("Enrichissement tracks par album (sp.album_tracks)...")
        df_album_tracks = enrich_albums_with_tracks(
            sp                = sp,
            df_kworb_albums   = df_kworb_albums,
            artist_name       = artist_name,
            artist_spotify_id = spotify_id,
        )
        if not df_album_tracks.empty:
            insert_album_tracks(df_album_tracks)
            log(f"Album tracks insérés : {len(df_album_tracks)} tracks sur {df_album_tracks['album_name'].nunique()} albums")
            result.update({
                "album_enrich_done": True,
                "df_album_tracks":   df_album_tracks,
            })
    else:
        log("Aucun kworb_album disponible pour l'enrichissement par album.")
        result["album_enrich_done"] = False

    # ── Étape 6 : Export Power BI ────────────────────────────────────────
    if skip_export:
        log("Export Power BI ignoré (--no-export).")
        result["export_done"] = False
    else:
        log("Export Power BI en cours (tous les artistes en DB)...")
        export_files = export_all()
        result.update({
            "export_done":  True,
            "export_files": export_files,
        })

    log(f"Pipeline terminé pour {artist_name}.")
    return result


# =========================
# UTILITAIRES
# =========================

def _log(msg: str):
    """Log simple préfixé pour le pipeline."""
    print(f"[pipeline] {msg}")


# =========================
# CLI
# =========================

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Pipeline Kworb-Spotify — collecte et enrichissement des streams.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemples :
  python pipeline.py --artist "Damso"
  python pipeline.py --artist "Damso" --force-scrape
  python pipeline.py --artist "Damso" --force-enrich
  python pipeline.py --artist "Damso" --kworb-id 2UwqpfQtNuhBwviIC0f2ie
        """,
    )
    parser.add_argument("--artist",        required=True,       help="Nom de l'artiste Spotify")
    parser.add_argument("--client-id",     default=None,        help="Spotify client ID (optionnel, défaut depuis config.py)")
    parser.add_argument("--client-secret", default=None,        help="Spotify client secret (optionnel, défaut depuis config.py)")
    parser.add_argument("--kworb-id",      default=None,        help="ID Kworb si différent du Spotify ID")
    parser.add_argument("--force-scrape",  action="store_true", help="Force le re-scraping même si données du jour déjà présentes")
    parser.add_argument("--force-enrich",  action="store_true", help="Force le ré-enrichissement Spotify même si déjà en DB")
    parser.add_argument("--no-export",     action="store_true", help="Ne pas générer les exports Power BI")
    return parser


if __name__ == "__main__":
    parser = _build_parser()
    args   = parser.parse_args()

    try:
        run_pipeline(
            artist_input      = args.artist,
            client_id         = args.client_id or SPOTIFY_CLIENT_ID,
            client_secret     = args.client_secret or SPOTIFY_CLIENT_SECRET,
            force_scrape      = args.force_scrape,
            force_enrich      = args.force_enrich,
            kworb_id_override = args.kworb_id,
            skip_export       = args.no_export,
        )
    except ValueError as e:
        print(f"\n[pipeline] ERREUR : {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n[pipeline] Interrompu.", file=sys.stderr)
        sys.exit(0)
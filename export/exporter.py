"""
exporter.py — Export des données pour Power BI.

Génère dans data/exports/ :
    streams_by_track.csv  → streams kworb par titre enrichi (album, type, popularité)
    streams_by_album.csv  → streams agrégés par album (kworb + calculé depuis titres)
    spotify_tracks.csv    → métadonnées complètes des titres Spotify
    artist_stats.csv      → historique des stats globales par artiste et par date
    master.xlsx           → tous les exports en un seul fichier multi-onglets

Usage :
    from export.exporter import export_all
    export_all(artist_name="Damso")

    # ou depuis la CLI :
    python export/exporter.py --artist "Damso"
"""

import argparse
import os
import sqlite3
import sys

import pandas as pd

# Ajout du répertoire racine au path pour les imports relatifs
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from config import (
    DB_PATH,
    EXPORT_DIR,
    EXPORT_STREAMS_FILE,
    EXPORT_ALBUMS_FILE,
    EXPORT_TRACKS_FILE,
    EXPORT_STATS_FILE,
    EXPORT_MASTER_FILE,
)


# =========================
# CONNEXION DB
# =========================

def _get_conn() -> sqlite3.Connection:
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Base de données introuvable : {DB_PATH}")
    return sqlite3.connect(DB_PATH)


# =========================
# PRÉPARATION DES DONNÉES
# =========================

def _build_streams_by_track(artist_name: str) -> pd.DataFrame:
    """
    Streams kworb par titre enrichis avec les métadonnées Spotify.

    Croisement :
        spotify_streams (streams)
        ← LEFT JOIN → album_tracks (métadonnées via sp.album_tracks)
        ← JOIN sur spotify_track_id (fiable) ou track_name (fallback)

    Source de vérité pour track_type et featured_artists : album_tracks
    Fallback sur kworb_is_feat si le titre n'est pas dans album_tracks.

    Colonnes résultantes :
        artist_name, track_name, album_name,
        track_type, featured_artists,
        streams_total, streams_daily, scraping_date
    """
    conn = _get_conn()

    # Dernière date de scraping disponible pour cet artiste
    date_row = pd.read_sql_query(
        "SELECT MAX(scraping_date) AS d FROM spotify_streams WHERE artist_name = ?",
        conn, params=[artist_name],
    )
    latest_date = date_row["d"].iloc[0] if not date_row.empty else None

    if latest_date is None:
        conn.close()
        return pd.DataFrame()

    df = pd.read_sql_query(
        """
        SELECT
            s.artist_name,
            s.track_name,
            s.track_type            AS track_type_kworb,
            s.kworb_is_feat,
            s.spotify_track_id,
            s.streams_total,
            s.streams_daily,
            s.scraping_date,
            -- Métadonnées depuis album_tracks (source de vérité)
            at.track_id,
            at.album_name,
            at.album_id,
            at.track_type           AS track_type_spotify,
            at.featured_artists,
            at.track_number,
            at.disc_number
        FROM spotify_streams s
        LEFT JOIN album_tracks at
            ON  s.artist_name      = at.artist_name
            AND (
                -- Jointure par track_id en priorité (fiable)
                s.spotify_track_id = at.track_id
                OR
                -- Fallback par nom normalisé (insensible à la casse)
                LOWER(TRIM(s.track_name)) = LOWER(TRIM(at.track_name))
            )
        WHERE s.artist_name   = ?
          AND s.scraping_date = ?
        ORDER BY s.streams_total DESC
        """,
        conn, params=[artist_name, latest_date],
    )
    conn.close()

    # Résolution track_type : album_tracks en priorité, kworb en fallback
    df["track_type"] = df["track_type_spotify"].fillna(
        df["kworb_is_feat"].map({1: "feat", 0: "solo"}).fillna(df["track_type_kworb"])
    )

    # Nettoyage colonnes techniques
    df = df.drop(columns=["track_type_kworb", "track_type_spotify", "kworb_is_feat"], errors="ignore")

    # Dédoublonnage — un titre peut matcher sur track_id ET track_name
    df = df.drop_duplicates(subset=["artist_name", "track_name", "scraping_date"]).reset_index(drop=True)

    return df


def _build_streams_by_album(artist_name: str) -> pd.DataFrame:
    """
    Streams agrégés par album avec double source :
        - streams_kworb  : streams directs depuis le tableau Albums kworb
        - streams_calc   : somme des streams titres (depuis spotify_streams × spotify_tracks)

    Les deux permettent une validation croisée dans Power BI.

    Colonnes résultantes :
        artist_name, album_name, album_type, release_year,
        spotify_album_id,
        streams_kworb, daily_kworb,
        streams_calc, daily_calc,
        nb_tracks, nb_solo, nb_feat,
        scraping_date
    """
    conn = _get_conn()

    # ── Source 1 : streams kworb albums ──────────────────────────────────
    df_kworb = pd.read_sql_query(
        """
        SELECT
            artist_name,
            album_name,
            spotify_album_id,
            streams_total  AS streams_kworb,
            streams_daily  AS daily_kworb,
            scraping_date
        FROM kworb_albums
        WHERE artist_name = ?
          AND scraping_date = (
              SELECT MAX(scraping_date) FROM kworb_albums WHERE artist_name = ?
          )
        """,
        conn, params=[artist_name, artist_name],
    )

    # ── Source 2 : agrégation titres via album_tracks ────────────────────
    date_row = pd.read_sql_query(
        "SELECT MAX(scraping_date) AS d FROM spotify_streams WHERE artist_name = ?",
        conn, params=[artist_name],
    )
    latest_date = date_row["d"].iloc[0] if not date_row.empty else None

    if latest_date:
        df_calc = pd.read_sql_query(
            """
            SELECT
                s.artist_name,
                at.album_name,
                SUM(s.streams_total)                                    AS streams_calc,
                SUM(s.streams_daily)                                    AS daily_calc,
                COUNT(DISTINCT s.track_name)                            AS nb_tracks,
                SUM(CASE WHEN at.track_type = 'solo' THEN 1 ELSE 0 END) AS nb_solo,
                SUM(CASE WHEN at.track_type = 'feat' THEN 1 ELSE 0 END) AS nb_feat
            FROM spotify_streams s
            LEFT JOIN album_tracks at
                ON  s.artist_name      = at.artist_name
                AND (
                    s.spotify_track_id = at.track_id
                    OR LOWER(TRIM(s.track_name)) = LOWER(TRIM(at.track_name))
                )
            WHERE s.artist_name   = ?
              AND s.scraping_date = ?
              AND at.album_name IS NOT NULL
            GROUP BY at.album_name
            ORDER BY streams_calc DESC
            """,
            conn, params=[artist_name, latest_date],
        )
    else:
        df_calc = pd.DataFrame()

    conn.close()

    # ── Merge des deux sources ────────────────────────────────────────────
    if df_kworb.empty and df_calc.empty:
        return pd.DataFrame()

    if df_kworb.empty:
        df_calc["streams_kworb"]    = None
        df_calc["daily_kworb"]      = None
        df_calc["spotify_album_id"] = None
        df_calc["scraping_date"]    = latest_date
        return df_calc

    if df_calc.empty:
        df_kworb["streams_calc"] = None
        df_kworb["daily_calc"]   = None
        df_kworb["nb_tracks"]    = None
        df_kworb["nb_solo"]      = None
        df_kworb["nb_feat"]      = None
        df_kworb["album_type"]   = None
        df_kworb["release_year"] = None
        return df_kworb

    # Normalisation des noms pour le merge (insensible à la casse)
    df_kworb["_key"] = df_kworb["album_name"].str.strip().str.lower()
    df_calc["_key"]  = df_calc["album_name"].str.strip().str.lower()

    df_merged = df_kworb.merge(
        df_calc.drop(columns=["artist_name"], errors="ignore"),
        on="_key",
        how="outer",
        suffixes=("_k", "_c"),
    )

    # Résolution album_name
    df_merged["album_name"] = df_merged["album_name_k"].fillna(df_merged["album_name_c"])
    df_merged = df_merged.drop(columns=["album_name_k", "album_name_c", "_key"], errors="ignore")

    # Colonnes finales ordonnées
    cols_order = [
        "artist_name", "album_name", "album_type", "release_year",
        "spotify_album_id",
        "streams_kworb", "daily_kworb",
        "streams_calc",  "daily_calc",
        "nb_tracks", "nb_solo", "nb_feat",
        "scraping_date",
    ]
    return df_merged[[c for c in cols_order if c in df_merged.columns]]


def _build_album_tracks(artist_name: str) -> pd.DataFrame:
    """Retourne les tracks enrichis depuis album_tracks pour un artiste."""
    conn = _get_conn()
    df   = pd.read_sql_query(
        """
        SELECT * FROM album_tracks
        WHERE artist_name = ?
        ORDER BY album_name, disc_number, track_number
        """,
        conn, params=[artist_name],
    )
    conn.close()
    return df


def _build_spotify_tracks(artist_name: str) -> pd.DataFrame:
    """Legacy — utilise _build_album_tracks à la place."""
    return _build_album_tracks(artist_name)


def _build_artist_stats(artist_name: str = None) -> pd.DataFrame:
    """
    Retourne l'historique des stats globales.
    Si artist_name est None, retourne tous les artistes.
    """
    conn = _get_conn()
    if artist_name:
        df = pd.read_sql_query(
            "SELECT * FROM spotify_stats WHERE artist_name = ? ORDER BY scraping_date",
            conn, params=[artist_name],
        )
    else:
        df = pd.read_sql_query(
            "SELECT * FROM spotify_stats ORDER BY artist_name, scraping_date",
            conn,
        )
    conn.close()

    # Calcul des deltas journaliers (utile pour Power BI)
    if not df.empty and artist_name:
        df = df.sort_values("scraping_date").copy()
        df["delta_total_streams"] = df["total_streams"].diff()
        df["delta_daily_streams"] = df["total_daily"].diff()

    return df


# =========================
# EXPORT PRINCIPAL
# =========================

def _get_all_artist_names() -> list[str]:
    """Retourne la liste de tous les artistes en DB."""
    conn = _get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT DISTINCT artist_name FROM artists ORDER BY artist_name")
    names = [r[0] for r in cur.fetchall()]
    conn.close()
    return names


def export_all(
    artist_name: str = None,
    export_dir: str = EXPORT_DIR,
    include_master_xlsx: bool = True,
) -> dict[str, str]:
    """
    Génère tous les exports Power BI.
    Si artist_name est fourni, exporte uniquement cet artiste.
    Sinon, exporte tous les artistes en DB dans des fichiers combinés.

    Fichiers générés :
        streams_by_track.csv  → tous les artistes, colonne artist_name
        streams_by_album.csv  → tous les artistes, colonne artist_name
        tracks.csv            → tous les artistes, colonne artist_name
        artist_stats.csv      → tous les artistes, colonne artist_name
        master.xlsx           → 4 onglets, tous les artistes

    Returns:
        dict {nom_export: chemin_fichier}
    """
    os.makedirs(export_dir, exist_ok=True)
    generated = {}

    # Détermine la liste des artistes à exporter
    if artist_name:
        artists = [artist_name]
    else:
        artists = _get_all_artist_names()

    if not artists:
        print("[exporter] ⚠️  Aucun artiste en DB.")
        return generated

    print(f"[exporter] Export Power BI — {len(artists)} artiste(s) : {', '.join(artists)}")

    # ── Streams par titre ─────────────────────────────────────────────────
    df_streams = pd.concat(
        [_build_streams_by_track(a) for a in artists], ignore_index=True
    )
    path = os.path.join(export_dir, EXPORT_STREAMS_FILE)
    _save_csv(df_streams, path, "streams_by_track")
    generated["streams_by_track"] = path

    # ── Streams par album ─────────────────────────────────────────────────
    df_albums = pd.concat(
        [_build_streams_by_album(a) for a in artists], ignore_index=True
    )
    path = os.path.join(export_dir, EXPORT_ALBUMS_FILE)
    _save_csv(df_albums, path, "streams_by_album")
    generated["streams_by_album"] = path

    # ── Tracks enrichis (album_tracks) ───────────────────────────────────
    df_tracks = pd.concat(
        [_build_album_tracks(a) for a in artists], ignore_index=True
    )
    path = os.path.join(export_dir, EXPORT_TRACKS_FILE)
    _save_csv(df_tracks, path, "tracks")
    generated["tracks"] = path

    # ── Stats historiques ─────────────────────────────────────────────────
    df_stats = pd.concat(
        [_build_artist_stats(a) for a in artists], ignore_index=True
    )
    path = os.path.join(export_dir, EXPORT_STATS_FILE)
    _save_csv(df_stats, path, "artist_stats")
    generated["artist_stats"] = path

    # ── Master Excel ──────────────────────────────────────────────────────
    if include_master_xlsx:
        path = os.path.join(export_dir, EXPORT_MASTER_FILE)
        _save_excel(
            sheets={
                "Streams par titre": df_streams,
                "Streams par album": df_albums,
                "Tracks":            df_tracks,
                "Stats historiques": df_stats,
            },
            path=path,
        )
        generated["master_xlsx"] = path

    print(f"[exporter] {len(generated)} fichiers générés dans : {export_dir}")
    return generated


# =========================
# UTILITAIRES
# =========================

def _save_csv(df: pd.DataFrame, path: str, label: str):
    """Sauvegarde un DataFrame en CSV UTF-8 avec BOM (compatible Excel/Power BI)."""
    if df.empty:
        print(f"[exporter]   ⚠️  {label} : DataFrame vide, fichier non généré.")
        return
    df.to_csv(path, index=False, encoding="utf-8-sig")
    print(f"[exporter]   ✅ {label} : {len(df)} lignes → {path}")


def _save_excel(sheets: dict[str, pd.DataFrame], path: str):
    """Sauvegarde plusieurs DataFrames dans un fichier Excel multi-onglets."""
    try:
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            for sheet_name, df in sheets.items():
                if df.empty:
                    continue
                # Excel limite les noms d'onglets à 31 caractères
                safe_name = sheet_name[:31]
                df.to_excel(writer, sheet_name=safe_name, index=False)
        print(f"[exporter]   ✅ master.xlsx : {len(sheets)} onglets → {path}")
    except ImportError:
        print("[exporter]   ⚠️  openpyxl non installé — master.xlsx non généré.")
        print("             Installe avec : pip install openpyxl")


# =========================
# CLI
# =========================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Export Power BI — génère CSV et Excel depuis la DB Kworb-Spotify.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemples :
  python export/exporter.py --artist "Damso"
  python export/exporter.py --artist "Damso" --export-dir "./powerbi"
  python export/exporter.py --artist "Damso" --no-xlsx
        """,
    )
    parser.add_argument("--artist",     required=True,         help="Nom de l'artiste (tel qu'en DB)")
    parser.add_argument("--export-dir", default=EXPORT_DIR,    help=f"Répertoire de destination (défaut : {EXPORT_DIR})")
    parser.add_argument("--no-xlsx",    action="store_true",   help="Ne pas générer le fichier Excel master")
    args = parser.parse_args()

    try:
        files = export_all(
            artist_name         = args.artist,
            export_dir          = args.export_dir,
            include_master_xlsx = not args.no_xlsx,
        )
        print("\nFichiers générés :")
        for label, path in files.items():
            print(f"  {label:<20} → {path}")
    except FileNotFoundError as e:
        print(f"\n[exporter] ERREUR : {e}", file=sys.stderr)
        sys.exit(1)
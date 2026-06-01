"""
social/instagram_card.py — Generateur de cartes Instagram pour Stream Analytics

Usage:
    python social/instagram_card.py DAMSO
    python social/instagram_card.py Jul --output jul_card.png
    python social/instagram_card.py DAMSO --api http://localhost:8000
"""

import argparse
import os
import sys
from datetime import date

import requests
from PIL import Image, ImageDraw, ImageFont

# ─── Palette (meme que l'app) ─────────────────────────────────────────────────

COLORS = {
    "bg":     (22,  22,  22),
    "bg2":    (31,  31,  31),
    "bg3":    (40,  40,  40),
    "green":  (87,  184, 124),
    "purple": (146, 114, 207),
    "text":   (242, 242, 242),
    "text2":  (196, 196, 196),
    "text3":  (136, 136, 136),
    "border": (42,  42,  42),
}

SIZE = (1080, 1080)

# ─── Fonts ────────────────────────────────────────────────────────────────────

_FONT_BOLD = [
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]
_FONT_REG = [
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]

def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    paths = _FONT_BOLD if bold else _FONT_REG
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

# ─── Helpers ──────────────────────────────────────────────────────────────────

def fmt(n) -> str:
    if n is None or n == 0:
        return "—"
    if n >= 1_000_000_000:
        return f"{n / 1_000_000_000:.1f} Md"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.0f} M"
    if n >= 1_000:
        return f"{n / 1_000:.0f} K"
    return str(n)

def _rr(draw: ImageDraw.Draw, xy, r: int, fill):
    x1, y1, x2, y2 = xy
    draw.rectangle([x1 + r, y1, x2 - r, y2], fill=fill)
    draw.rectangle([x1, y1 + r, x2, y2 - r], fill=fill)
    for cx, cy in [(x1, y1), (x2 - 2*r, y1), (x1, y2 - 2*r), (x2 - 2*r, y2 - 2*r)]:
        draw.ellipse([cx, cy, cx + 2*r, cy + 2*r], fill=fill)

# ─── API ──────────────────────────────────────────────────────────────────────

def _get(url: str):
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    return r.json()

def fetch_all(artist: str, api: str) -> tuple:
    data   = _get(f"{api}/artists/{artist}")
    tracks = _get(f"{api}/artists/{artist}/tracks")
    if isinstance(tracks, dict):
        tracks = tracks.get("tracks", [])
    try:
        yt = _get(f"{api}/artists/{artist}/youtube") or []
    except Exception:
        yt = []
    return data, tracks, yt

# ─── Carte ────────────────────────────────────────────────────────────────────

def generate_card(data: dict, tracks: list, yt: list, out: str) -> str:
    W, H = SIZE
    img  = Image.new("RGB", SIZE, COLORS["bg"])
    draw = ImageDraw.Draw(img)
    PAD  = 72

    # Barre verte haute
    draw.rectangle([(0, 0), (W, 10)], fill=COLORS["green"])

    # Nom artiste
    name = data.get("artist_name", "Artiste").upper()
    y = 58
    draw.text((PAD, y), name, font=_font(68, bold=True), fill=COLORS["text"])
    y += 86

    # Sous-titre
    draw.text((PAD, y), "Analyse Spotify x YouTube", font=_font(28), fill=COLORS["text3"])
    y += 52

    # Ligne verte
    draw.rectangle([(PAD, y), (PAD + 80, y + 4)], fill=COLORS["green"])
    y += 48

    # KPIs
    total_streams = data.get("total_streams") or 0
    nb_tracks     = data.get("nb_tracks") or data.get("track_count") or 0
    yt_total      = sum((t.get("view_count") or 0) for t in yt)

    kpis = [
        ("STREAMS SPOTIFY", fmt(total_streams)),
        ("TITRES",          str(nb_tracks) if nb_tracks else "—"),
        ("VUES YOUTUBE",    fmt(yt_total) if yt_total else "N/A"),
    ]

    bw  = (W - 2 * PAD - 32) // 3
    bh  = 148
    bx  = PAD
    fv  = _font(50, bold=True)
    fl  = _font(22)
    for label, val in kpis:
        _rr(draw, (bx, y, bx + bw, y + bh), 16, COLORS["bg2"])
        vw = draw.textlength(val, font=fv)
        draw.text((bx + (bw - vw) // 2, y + 18), val, font=fv, fill=COLORS["green"])
        lw = draw.textlength(label, font=fl)
        draw.text((bx + (bw - lw) // 2, y + 88), label, font=fl, fill=COLORS["text3"])
        bx += bw + 16
    y += bh + 52

    # Section TOP TITRES
    draw.text((PAD, y), "TOP TITRES", font=_font(22, bold=True), fill=COLORS["text3"])
    y += 40

    top5   = sorted(tracks, key=lambda t: t.get("total_streams") or 0, reverse=True)[:5]
    yt_map = {(t.get("track_name") or "").lower(): t.get("view_count") for t in yt}
    fn     = _font(28)
    fb     = _font(28, bold=True)
    fs     = _font(26)
    fyt    = _font(20)

    for i, track in enumerate(top5, 1):
        tname    = track.get("track_name") or "—"
        streams  = track.get("total_streams") or 0
        yt_views = yt_map.get(tname.lower())
        row_h    = 76

        if i % 2 == 0:
            draw.rectangle([(PAD - 12, y - 6), (W - PAD + 12, y + row_h - 8)], fill=COLORS["bg2"])

        draw.text((PAD, y + 16), f"{i}.", font=fb, fill=COLORS["text3"])

        display = tname if len(tname) <= 28 else tname[:27] + "…"
        draw.text((PAD + 52, y + 16), display, font=fn, fill=COLORS["text"])

        s_str = fmt(streams)
        sw    = draw.textlength(s_str, font=fs)
        draw.text((W - PAD - sw, y + 20), s_str, font=fs, fill=COLORS["green"])

        if yt_views:
            yt_str = f"YT  {fmt(yt_views)}"
            draw.text((PAD + 52, y + 48), yt_str, font=fyt, fill=COLORS["text3"])

        y += row_h

    # Footer
    fy = H - 58
    draw.rectangle([(0, fy - 14), (W, fy - 13)], fill=COLORS["border"])
    fbr = _font(24, bold=True)
    draw.text((PAD, fy), "stream.analytics", font=fbr, fill=COLORS["green"])
    ds  = date.today().strftime("%d/%m/%Y")
    dw  = draw.textlength(ds, font=fbr)
    draw.text((W - PAD - dw, fy), ds, font=fbr, fill=COLORS["text3"])

    img.save(out, "PNG")
    print(f"[instagram] Image sauvegardee : {out}")
    return out

# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Genere une carte Instagram artiste")
    parser.add_argument("artist", help="Nom de l'artiste (ex: DAMSO)")
    parser.add_argument("--api",    default="http://localhost:8000")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    os.makedirs("social/output", exist_ok=True)
    out = args.output or f"social/output/{args.artist.lower().replace(' ', '_')}_card.png"

    print(f"[instagram] Recuperation des donnees pour '{args.artist}'...")
    try:
        data, tracks, yt = fetch_all(args.artist, args.api)
    except requests.HTTPError as e:
        print(f"[ERREUR] {e}")
        sys.exit(1)

    print(f"[instagram] {len(tracks)} tracks, {len(yt)} vues YouTube")
    generate_card(data, tracks, yt, out)


if __name__ == "__main__":
    main()

"""
Genere une carte de demonstration sans avoir besoin de l'API.
Usage: python social/demo_card.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from social.instagram_card import generate_card

data = {
    "artist_name": "DAMSO",
    "total_streams": 4_200_000_000,
    "nb_tracks": 52,
}

tracks = [
    {"track_name": "Bruxelles vie nocturne", "total_streams": 650_000_000},
    {"track_name": "Macarena",               "total_streams": 520_000_000},
    {"track_name": "Nwaar",                  "total_streams": 480_000_000},
    {"track_name": "Ipseite",                "total_streams": 390_000_000},
    {"track_name": "Batterie faible",        "total_streams": 310_000_000},
]

yt = [
    {"track_name": "Macarena",               "view_count": 180_000_000},
    {"track_name": "Bruxelles vie nocturne", "view_count": 120_000_000},
    {"track_name": "Nwaar",                  "view_count":  95_000_000},
]

os.makedirs("social/output", exist_ok=True)
generate_card(data, tracks, yt, "social/output/demo_damso.png")
print("Ouvrir : social/output/demo_damso.png")

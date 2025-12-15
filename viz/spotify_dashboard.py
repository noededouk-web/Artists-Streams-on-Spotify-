import sqlite3

import pandas as pd
import plotly.express as px
import streamlit as st


# Connexion SQLite
conn = sqlite3.connect("data/spotify.db")
df = pd.read_sql("SELECT * FROM spotify_streams", conn)
conn.close()

st.title("🎵 Spotify Streams Dashboard")

# Filtre par artiste
artists = df["artist_name"].unique()
selected_artist = st.selectbox("Choisir un artiste", artists)

df_artist = df[df["artist_name"] == selected_artist]

# Filtre par type de chanson
track_types = ["solo", "feat"]
selected_type = st.multiselect(
    "Type de chanson",
    track_types,
    default=track_types
)

df_filtered = df_artist[df_artist["track_type"].isin(selected_type)]

# Affichage tableau
st.subheader(f"Chansons de {selected_artist}")
st.dataframe(
    df_filtered[["track_name", "streams_total", "streams_daily", "track_type", "album_name"]]
)

# Graphique top 10 streams totaux
top10 = df_filtered.sort_values("streams_total", ascending=False).head(10)

fig = px.bar(
    top10,
    x="track_name",
    y="streams_total",
    color="track_type",
    labels={"streams_total": "Total Streams", "track_name": "Titre"},
)

st.subheader("Top 10 chansons par streams totaux")
st.plotly_chart(fig, use_container_width=True)

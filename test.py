print("✅ VS Code + Python OK")
from scraper.kworb_scraper import scrape_kworb_spotify_fixed
from database.db import create_stats_table, insert_stats, get_stats_by_artist

create_stats_table()

artist_id = "2UwqpfQtNuhBwviIC0f2ie"
artist_name = "Damso"

stats, df = scrape_kworb_spotify_fixed(artist_id, artist_name)
scraping_date = df["scraping_date"].iloc[0]
insert_stats(artist_name, scraping_date, stats)

print(get_stats_by_artist(artist_name))

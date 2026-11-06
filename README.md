# PH EPG compatibility mirror

The EPG project has been consolidated into [ph-tv-playlist](https://github.com/tr3nching/ph-tv-playlist).

That repository contains **one EPG builder** (`scripts/update_epg.py`), **one M3U builder** (`scripts/refresh.mjs`), and the merged source/channel configuration (`epg-config.json`). The earlier builder and configuration remain recoverable in this repository's Git history.

Use the combined playlist, which includes its EPG URL automatically:
https://tr3nching.github.io/ph-tv-playlist/playlist-combined.m3u

Current EPG:
https://tr3nching.github.io/ph-tv-playlist/epg.xml.gz

This repository no longer builds an EPG or downloads source feeds. Its workflow only copies the already-generated guide and status report from the consolidated project, keeping the old `ph-epg/epg.xml.gz` address working for existing TV configurations. A failed copy preserves the previous deployment.

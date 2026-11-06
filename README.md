# ph-epg

Rebuilds an XMLTV guide for a Philippine IPTV playlist every 6 hours and publishes it on GitHub Pages.

- `config.json`: playlist URL, source feeds (in priority order), manual aliases (`playlist tvg-id` -> `source channel id`), and excluded channels.
- `build.mjs`: downloads the playlist and feeds, matches channels, writes `dist/epg.xml`, `epg.xml.gz`, `report.txt`.
- The job fails (and the previous guide stays live) if fewer than `minChannels` channels match.

## Setup
1. Push to GitHub, then Settings > Pages > Source: **GitHub Actions**.
2. Run the workflow once (Actions > Update EPG > Run workflow).
3. Set the playlist header to `x-tvg-url="https://<user>.github.io/<repo>/epg.xml.gz"`.

Check `report.txt` on the Pages site for channels with no guide; add an alias in `config.json` to fix a bad or missing match.

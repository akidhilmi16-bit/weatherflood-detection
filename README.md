# Monsoon Desk — Malaysia Weather & Flood Watch

Live dashboard for MET Malaysia's open weather data
([data.gov.my Weather API](https://developer.data.gov.my/realtime-api/weather)).
Maps and charts of the live data, plus a rule-based **flood-risk index** (Danger Zone tab).

| Tab | API endpoint | What you see |
|---|---|---|
| Forecast | `GET /weather/forecast/` | 7-day outlook for 440 locations (states, districts, towns, divisions, recreation areas): rain-intensity map, 7-day outlook chart, state temperature ranges, 7-day matrix, per-location detail |
| Warnings | `GET /weather/warning/` | Bulletins in force (thunderstorm, continuous rain, strong winds / rough seas…), affected states and districts on a map, severity, time left |
| Earthquakes | `GET /weather/warning/earthquake/` | Regional events on a map (size = magnitude, colour = depth), magnitude timeline and distribution, event log, filters |
| Danger Zone | forecast + warnings + `GET /flood-warning/` | Flood-risk index 0-100 for every district / division: gauge, danger map, ranked zones, score breakdown, 7-day trajectory, risk by state. JPS river-level stations on the map and in a stations table |

## Architecture

```
Browser ──fetch──> https://api.data.gov.my/weather/...   (CORS: *)
   │
   └─ static site on Netlify (Vite + React build in dist/)
```

Almost no backend. The data.gov.my API sends `Access-Control-Allow-Origin: *`, so the
browser calls it directly and every visitor gets their own rate-limit quota
(**4 requests/minute per IP**). The one exception is live river levels (below).
Responses are cached in `localStorage` (forecast 1 h, warnings and earthquakes 10 min).
If the API returns 429 or fails, the last cached copy is shown with a "Cached" badge.

Stack: React 18, Vite 5, Leaflet + react-leaflet (maps), Recharts (charts).
Basemap tiles: Esri Light/Dark Gray Canvas (no API key).

```
src/
  App.jsx                 header, tabs (#/forecast, #/warnings, #/earthquakes)
  pages/                  one file per tab
  components/             BaseMap, cards, stat tiles, legend, tooltip
  lib/api.js              fetch + cache + 429 fallback
  lib/conditions.js       Malay forecast phrase -> rain level 0-4 (+ English)
  lib/warnings.js         parse affected states/districts out of warning text
  lib/quakes.js           depth classes, distance parsing
  lib/floodRisk.js        flood-risk index (rain build-up + monsoon + warnings + rivers)
  lib/rivers.js           JPS river stations: status, thresholds, freshness
netlify/functions/rivers.mjs   /api/rivers proxy over JPS Public Infobanjir
netlify/jps.mjs                fetch + parse the JPS state pages
  lib/theme.jsx           light/dark palettes (validated colour ramps)
  data/locations.json     coordinates for forecast locations (generated)
public/data/malaysia_states.geojson
scripts/geocode-locations.mjs
```

## Things the API doesn't give you (and how this app handles them)

- **No coordinates for forecast locations.** `scripts/geocode-locations.mjs` geocodes
  every location once with OpenStreetMap Nominatim and saves `src/data/locations.json`.
  Re-run it with `npm run geocode` only if MET adds locations (it skips ones already done).
- **Forecast text is Malay only.** `lib/conditions.js` maps the fixed phrase list to an
  ordered rain level: 0 no rain, 1 isolated rain, 2 rain, 3 isolated thunderstorms,
  4 thunderstorms (plus haze). This level is the main input planned for the v2 model.
- **Warnings list areas only in free text.** `lib/warnings.js` reads the
  "over the states of …" part. Marine warnings ("waters of …") name sea areas, so
  they are listed but not mapped.
- **Warnings have no history.** The endpoint returns only current bulletins.
- **The JPS river feed (`/flood-warning/`) is frozen.** As of Oct 2026 its newest
  reading is 23 Feb 2024. Live levels come instead from JPS Public Infobanjir
  through our proxy (next section); data.gov.my is the fallback and supplies
  coordinates. Only readings under 6 hours old count in the flood score.

## Live river levels: the /api/rivers proxy

JPS Public Infobanjir (publicinfobanjir.water.gov.my) has live readings but no API:
each state page is a server-built HTML table, and the site doesn't allow other
origins. `netlify/functions/rivers.mjs` (served at `/api/rivers`) fetches the 15
state pages in parallel, parses the tables (`netlify/jps.mjs`) and returns JSON.

- Netlify's CDN caches the answer for 15 minutes, shared by all visitors, so JPS
  sees a few requests an hour. robots.txt allows crawling.
- A state that times out keeps its last good stations; if nothing parses (layout
  change or JPS down) the function returns 502, logs an error, and the app falls
  back to data.gov.my.
- JPS pages have no coordinates: a station uses the data.gov.my coordinates when
  its name matches, otherwise it is drawn near its district centre.
- In `npm run dev`, Vite serves the same function (see `vite.config.js`).
- It is not an official API. For a public launch, ask JPS for permission and
  report the frozen feed to data.gov.my (dataterbuka@jdn.gov.my).

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Deploy to Netlify

`netlify.toml` already sets the build (`npm run build`, publish `dist`, Node 20).

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo,
   click **Deploy**. Nothing else to configure.

Or deploy from your machine with the Netlify CLI:

```bash
npx netlify-cli deploy --build --prod
```

## Flood-risk index (Danger Zone)

Indicative only, not an official warning. Per district / division and day:

1. **Rain load** from the forecast phrase (isolated rain 0.6, isolated storms 1.2,
   rain 2.4, thunderstorms 2.8) plus up to 1.2 when it lasts all day.
2. **Build-up**: 55% of the previous day's build-up carries over, so wet days in
   a row add up. Scaled x6.
3. **Monsoon**: +20% from November to March in Kelantan, Terengganu, Pahang,
   Johor, Sabah and Sarawak.
4. **Warnings**: a MET land warning naming the zone adds 15 / 28 / 42 points
   (alert / severe / danger); thunderstorm alerts count at half.
5. **Rivers**: a fresh (< 6 h) JPS reading at alert / warning / danger adds
   12 / 24 / 38 points (+6 if rising) to the station's district today, fading
   40% a day.

Levels: Low 0+, Moderate 25+, High 50+, Severe 75+. Weights live in `lib/floodRisk.js`.

## Roadmap

- If JPS pages often take over 8 s, move the proxy to a scheduled function that
  stores results in Netlify Blobs, so visitors never wait on JPS.
- Keep warning and forecast history (the API only serves current data), then
  train a model on past flood events.

Data: MET Malaysia via data.gov.my, CC BY 4.0.

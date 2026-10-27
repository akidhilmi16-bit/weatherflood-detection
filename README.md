# Monsoon Desk — Malaysia Weather & Flood Watch

Live dashboard for MET Malaysia's open weather data
([data.gov.my Weather API](https://developer.data.gov.my/realtime-api/weather)).
Maps and charts of the live data, plus a rule-based **flood-risk index** (Danger Zone tab).

| Tab | API endpoint | What you see |
|---|---|---|
| Forecast | `GET /weather/forecast/` | 7-day outlook for 440 locations (states, districts, towns, divisions, recreation areas): rain-intensity map, 7-day outlook chart, state temperature ranges, 7-day matrix, per-location detail |
| Warnings | `GET /weather/warning/` | Bulletins in force (thunderstorm, continuous rain, strong winds / rough seas…), affected states and districts on a map, severity, time left |
| Earthquakes | `GET /weather/warning/earthquake/` | Regional events on a map (size = magnitude, colour = depth), magnitude timeline and distribution, event log, filters |
| Danger Zone | forecast + warnings | Flood-risk index 0-100 for every district / division: gauge, danger map, ranked zones, score breakdown, 7-day trajectory, risk by state |

## Architecture

```
Browser ──fetch──> https://api.data.gov.my/weather/...   (CORS: *)
   │
   └─ static site on Netlify (Vite + React build in dist/)
```

No backend. The API sends `Access-Control-Allow-Origin: *`, so the browser calls it
directly and every visitor gets their own rate-limit quota (**4 requests/minute per IP**).
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
  lib/floodRisk.js        flood-risk index (rain build-up + monsoon + warnings)
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

Levels: Low 0+, Moderate 25+, High 50+, Severe 75+. Weights live in `lib/floodRisk.js`.

## Roadmap

- Add JPS river levels and rain-gauge totals (publicinfobanjir.water.gov.my).
- Keep warning and forecast history (the API only serves current data), then
  train a model on past flood events.

Data: MET Malaysia via data.gov.my, CC BY 4.0.

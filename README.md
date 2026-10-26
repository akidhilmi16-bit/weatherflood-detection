# Monsoon Desk — Malaysia Weather & Flood Watch

Live dashboard for MET Malaysia's open weather data
([data.gov.my Weather API](https://developer.data.gov.my/realtime-api/weather)).
**v1** shows the data on maps and charts. **v2** will add flood-risk prediction.

| Tab | API endpoint | What you see |
|---|---|---|
| Forecast | `GET /weather/forecast/` | 7-day outlook for 440 locations (states, districts, towns, divisions, recreation areas): rain-intensity map, 7-day outlook chart, state temperature ranges, 7-day matrix, per-location detail |
| Warnings | `GET /weather/warning/` | Bulletins in force (thunderstorm, continuous rain, strong winds / rough seas…), affected states and districts on a map, severity, time left |
| Earthquakes | `GET /weather/warning/earthquake/` | Regional events on a map (size = magnitude, colour = depth), magnitude timeline and distribution, event log, filters |

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

## Roadmap (v2)

- Flood-risk score per district: rain level over consecutive days + active
  continuous-rain warnings, later combined with river levels / rainfall from
  JPS (publicinfobanjir.water.gov.my).
- Keep warning and forecast history (the API only serves current data).

Data: MET Malaysia via data.gov.my, CC BY 4.0.

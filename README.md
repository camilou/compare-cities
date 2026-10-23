# Compare cities

Lay one city on top of another at its true size and shape, then compare them.

SvelteKit 2 + Svelte 5 + Tailwind 4, MapLibre with OpenFreeMap tiles, deployed as a Cloudflare Worker. No API keys.

## Run

```sh
npm install
npm run dev          # http://localhost:5173
npm run build && npm run preview   # production build in the local Workers runtime
npm run deploy       # build + wrangler deploy (run `npx wrangler login` once first)
npm run data         # refresh src/lib/data/countries.json (Big Mac, World Bank)
```

## How the overlay stays honest

`src/lib/geo.ts → transplant()` moves every vertex of the second city so it keeps its
true ground distance and compass bearing from the city's centre, measured again from
the new centre. Area is preserved to within ~0.002% anywhere on Earth, and the shape
grows or shrinks on screen exactly like the Mercator map underneath it.

## Data

| What | Source | Notes |
| --- | --- | --- |
| Boundaries | OpenStreetMap via Nominatim | Official admin boundary, simplified to ~50 m |
| Search | Photon (komoot) | Typeahead-friendly OSM geocoder |
| Population, founded, elevation, mayor, sister cities | Wikidata | Falls back via English Wikipedia when OSM links the wrong item |
| Photo + summary | Wikipedia REST API | |
| Weather and local time | Open-Meteo | Client-side |
| Big Mac price | The Economist big-mac-data (GitHub) | National; baked in at build time |
| GDP per person, life expectancy | World Bank API | National; baked in at build time |
| Cars per 1,000, average net salary | Hand-compiled table in `scripts/fetch-data.mjs` | **Rough estimates**; replace with a proper source |

Upstream responses are cached in Cloudflare's edge cache (`src/lib/server/upstream.ts`)
to respect the free services' usage policies. Set a real contact URL in `USER_AGENT` there
before going public — Nominatim and Wikimedia both require one.

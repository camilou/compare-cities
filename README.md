# Compare cities 🗺️

**Live:** https://compare-cities.hacer.workers.dev
**Code:** https://github.com/camilou/compare-cities

I always wanted to know how big Medellín really is compared to Singapore. Not "according to
Google Maps, where Greenland is the size of Africa" big, but *really* big. So I built
this: pick a city, pick another one, and the second one gets dropped on top of the
first at its true size and shape. Then you scroll down and discover that Medellín has
more green space than Oslo and you start questioning your life choices.

It's [thetruesize.com](https://thetruesize.com), but for cities, plus a lot of trivia
nobody asked for.

## What it does

- **True-size overlay.** Drag it, spin it, it stays honest (more on the math below).
- **Starts with your city.** Cloudflare knows roughly where you are from your IP, so
  the left side is your city. Nothing is stored. Calm down. If it can't tell, you get
  New York, because everyone has an opinion about New York.
- **Side by side:** population, density, founding date, elevation, metro lines,
  stations, bike lanes, parks, climate, cars, GDP and the most important economic
  indicator of all: how long you have to work to buy a Big Mac.
- **Fun facts**, like how many football pitches fit in your city, or that water boils
  at 91 °C in Bogotá (which explains a lot about the pasta).
- **Climate through the year**, so you know when to pack an umbrella.
- **Share it**, as a pretty image (landscape or portrait) or a link that unfurls with
  the two cities fighting about size right there in your WhatsApp.
- **Dark mode**, because it's 2026.

## Run it

```sh
pnpm install
pnpm dev             # http://localhost:5173
pnpm build && pnpm preview        # production build in the local Workers runtime
git push             # Cloudflare Workers Builds deploys the `compare-cities` Worker from main
```

Deploys happen on push to `main`, and only on push: the `compare-cities` Worker is
connected to this repo through Cloudflare Workers Builds. There is deliberately no
deploy script, because the last manual deploy invented a whole new Worker.

Node 22 and pnpm. Yes, SvelteKit 3 wants Node 22.17 and I have 22.16. We're on
SvelteKit 2. We don't talk about it.

## How the overlay stays honest

Flat maps lie. The further you go from the equator, the more Mercator inflates
things, so if you just slide a polygon from Bogotá to Oslo by changing its lat/lng,
you get garbage.

Instead, `src/lib/geo.ts → transplant()` takes every point of the second city,
measures its real distance and compass bearing from the city centre on the globe,
and re-plants it at the same distance and bearing from the new centre. The area
survives the trip within **0.002%** (I checked, Paris weighs 105.04 km² everywhere).
On screen it grows or shrinks exactly like everything else at that latitude, which
is the whole point.

## Where the data comes from (all free, no API keys)

| What | From | Honesty level |
| --- | --- | --- |
| City outlines | OpenStreetMap via Nominatim | Official boundaries, with the sea cut off for cached cities (see below). Some are still weird: Bogotá's district includes a whole páramo |
| Search | Photon + our own cache | Big cities first, accents optional |
| Population, founding, mayor, sister cities | Wikidata | Pretty good. Some cities were founded "3rd century BC", which is very precise |
| Photo + blurb | Wikipedia | Good |
| Metro, stations, bike lanes, parks | OpenStreetMap via Overpass | As good as the volunteers who mapped your city. Thank them |
| Climate | NASA POWER (2001–2020), elevation-corrected | Good. Better than the sunshine data I fired for saying Bogotá gets 3,850 hours of sun |
| Big Mac price | The Economist's Big Mac index | Delicious |
| GDP, life expectancy | World Bank | National, not per city |
| Cars, salaries | Me, with a spreadsheet | **Rough estimates.** Don't quote these at a dinner party |

## No swimming

Official city boundaries love the sea. San Francisco's runs out to the county line in
the Pacific, so it "measured" 601 km² when the actual city is 121. New York was
dragging 445 km² of harbour around. So every cached city gets clipped to land:
`scripts/lib/land.ts` grabs the `ocean` polygons from the same OpenFreeMap tiles the
map uses and subtracts them. Bays and harbours go, rivers and lakes stay (sorry, the
Seine is still part of Paris). San Francisco is now 122 km², New York 772 km², both
within a rounding error of the official land area.

## The city cache (a.k.a. the robots)

Looking a city up live means asking five free services nicely, which can take a
minute. So two very patient scripts pre-visit the ~1,000 most famous cities and save
**one JSON file per city** in `static/cities/`, with outline, facts, photo, climate,
transit and parks. Cached cities load in one request.

```sh
pnpm dev   # the builder uses the local API, so keep this running
node --experimental-strip-types scripts/build-city-cache.ts 1000 http://localhost:5173
node --experimental-strip-types scripts/enrich-city-cache.ts climate,transit,green
node --experimental-strip-types scripts/clip-to-land.ts   # only needed for files built before clipping existed
```

Both are resumable and polite: one request at a time, a 20-second breather between
OpenStreetMap queries, and the parks robot stops at ~1 GB a day. (Ask me how I know
Overpass blocks you if you're not polite. Actually, don't.) Cities are ranked by how
many Wikipedias have an article about them, which is why Lyon makes the cut and
"Dhaka Division" (a 20,000 km² region pretending to be a city) does not.

Live lookups are cached too: finished cities and transit for 30 days at the edge
(plus Workers KV if you bind one, see below), and the heavy park measurement for
uncached cities only runs when someone clicks "Measure parks".

Optional, for a global cache that survives edge evictions:

```sh
pnpm exec wrangler kv namespace create CITY_CACHE
# then add the printed id to wrangler.jsonc:
# "kv_namespaces": [{ "binding": "CITY_CACHE", "id": "<id>" }]
```

`pnpm data` refreshes the country numbers (Big Mac, World Bank).

## Stack

SvelteKit 2 + Svelte 5, Tailwind 4, MapLibre with OpenFreeMap tiles, resvg-wasm for
the share images, all on a Cloudflare Worker. No ads, no trackers, no cookies, no
newsletter popup asking for my email before I'm allowed to see Paris.

## Thanks

To every OpenStreetMap mapper who traced a park boundary at 2 a.m. You're the real
MVPs. And to Claude, who wrote most of this while I kept changing the colour scheme.

— Camilo

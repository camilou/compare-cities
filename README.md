# Compare cities 🗺️

**Live:** https://compare-cities.hacer.workers.dev
**Code:** https://github.com/camilou/compare-cities

I always wanted to know how big Bogotá really is compared to Paris. Not "according to
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
npm install
npm run dev          # http://localhost:5173
npm run build && npm run preview   # production build in the local Workers runtime
npm run deploy       # ship it to Cloudflare (npx wrangler login first)
```

Node 22. Yes, SvelteKit 3 wants 22.17 and I have 22.16. We're on SvelteKit 2.
We don't talk about it.

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
| City outlines | OpenStreetMap via Nominatim | Official boundaries. Some cities are weird (Tokyo includes islands, Bogotá's district includes a whole páramo) |
| Search | Photon + our own cache | Big cities first, accents optional |
| Population, founding, mayor, sister cities | Wikidata | Pretty good. Some cities were founded "3rd century BC", which is very precise |
| Photo + blurb | Wikipedia | Good |
| Metro, stations, bike lanes, parks | OpenStreetMap via Overpass | As good as the volunteers who mapped your city. Thank them |
| Climate | NASA POWER (2001–2020), elevation-corrected | Good. Better than the sunshine data I fired for saying Bogotá gets 3,850 hours of sun |
| Big Mac price | The Economist's Big Mac index | Delicious |
| GDP, life expectancy | World Bank | National, not per city |
| Cars, salaries | Me, with a spreadsheet | **Rough estimates.** Don't quote these at a dinner party |

## The city cache (a.k.a. the robots)

Looking a city up live means asking five free services nicely, which can take a
minute. So two very patient scripts pre-visit the ~1,000 most famous cities and save
**one JSON file per city** in `static/cities/`, with outline, facts, photo, climate,
transit and parks. Cached cities load in one request.

```sh
npm run dev   # the builder uses the local API, so keep this running
node --experimental-strip-types scripts/build-city-cache.ts 1000 http://localhost:5173
node --experimental-strip-types scripts/enrich-city-cache.ts climate,transit,green
```

Both are resumable and polite: one request at a time, and the parks robot stops at
~1 GB a day so OpenStreetMap doesn't send me strongly worded emails. Cities are
ranked by how many Wikipedias have an article about them, which is why Lyon makes
the cut and "Dhaka Division" (a 20,000 km² region pretending to be a city) does not.

`npm run data` refreshes the country numbers (Big Mac, World Bank).

## Stack

SvelteKit 2 + Svelte 5, Tailwind 4, MapLibre with OpenFreeMap tiles, resvg-wasm for
the share images, all on a Cloudflare Worker. No ads, no trackers, no cookies, no
newsletter popup asking for my email before I'm allowed to see Paris.

## Thanks

To every OpenStreetMap mapper who traced a park boundary at 2 a.m. You're the real
MVPs. And to Claude, who wrote most of this while I kept changing the colour scheme.

— Camilo

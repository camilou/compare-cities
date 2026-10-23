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
(plus Workers KV, globally), and the heavy park measurement for
uncached cities only runs when someone clicks "Measure parks".

## If this goes viral (fingers crossed)

Everything is cached in layers so a traffic spike lands on Cloudflare, not on the
free services we borrow data from:

| Layer | What it holds | For how long |
| --- | --- | --- |
| Static files (no Worker at all) | 1,000 city files, fonts, textures, the default preview image | 1 day fresh + a week stale-while-revalidate (fonts: forever) |
| Edge cache | Shared comparison pages, preview images, finished city lookups, transit, every upstream answer | 1 to 30 days |
| Workers KV | Finished city lookups and transit, globally and durably | 30 days |
| Your browser | Climate, transit, parks, land-clipped outlines, weather (30 min), search via the built-in city list | Until you clear it |

And some seatbelts:

- **Rate limits** per IP: 60 API calls and 20 fresh preview renders a minute.
  Cached preview images are never limited, so WhatsApp's crawler can unfurl a
  viral link as often as it likes.
- **Nominatim** is paced to one request per second (its policy), **Photon** to five,
  and both fail fast with a polite "busy" instead of queueing forever.
- **Previews only for cached cities.** Random ids can't trigger live lookups or
  expensive image renders.
- **Live parks only on click**, and the browser does the heavy lifting.

The one thing caching can't fix is the Workers free plan: 100,000 Worker requests a
day and 10 ms of CPU per request. Static files don't count, but every page view and
API call does, and drawing a preview image takes more than 10 ms the first time.
If the counter starts climbing, the $5/month Workers Paid plan raises that to 10
million requests and 30 seconds of CPU. Cheaper than a Big Mac in Switzerland.

`pnpm data` refreshes the country numbers (Big Mac, World Bank).

## TODO

- **Proper metro area comparisons.** Cities stop at their official limits, but
  Medellín without Bello, Itagüí and Envigado is only half the story. Plan:
  - Metro areas show up **in search as their own entries**: type "Medellín" and pick
    either *Medellín* or *Medellín metro area*. Same for Paris, Tokyo and friends.
  - **Two cache files per city**: `static/cities/R1343264.json` for the city and a
    separate file for its metro area (e.g. `static/cities/metro-R1343264.json`), each
    with its own outline, population, density, climate, transit and parks.
  - Use the EU's free **GHSL Urban Centre Database** for the outlines: one
    worldwide definition of "the continuous built-up blob", so Medellín's metro and
    Paris's metro are measured the same way. One download, no free services hammered.
  - Bonus fun fact: "Paris is 105 km². Greater Paris would swallow it many times over."

## Stack

SvelteKit 2 + Svelte 5, Tailwind 4, MapLibre with OpenFreeMap tiles, resvg-wasm for
the share images, all on a Cloudflare Worker. No ads, no trackers, no cookies, no
newsletter popup asking for my email before I'm allowed to see Paris.

## Thanks

To every OpenStreetMap mapper who traced a park boundary at 2 a.m. You're the real
MVPs. And to Claude, who wrote most of this while I kept changing the colour scheme.

— Camilo

import type { MultiPolygon, Polygon } from 'geojson';
import type { Climate } from './climate';
import type { GreenStats, TransitStats } from './osm';

export type Area = Polygon | MultiPolygon;

export interface Suggestion {
	id: string; // OSM id with type prefix, e.g. R7444
	name: string;
	context: string;
	countryCode?: string;
	kind: string;
}

export interface CityFacts {
	population?: { value: number; year?: number };
	founded?: { year: number; label: string };
	elevation?: number;
	officialArea?: number; // km²
	mayor?: string;
	nickname?: string;
	website?: string;
}

export interface City {
	twins?: string[];
	id: string;
	name: string;
	displayName: string;
	countryCode: string;
	country: string;
	center: [number, number]; // [lng, lat]
	geometry: Area;
	wikidata?: string;
	facts: CityFacts;
	summary?: { extract: string; image?: string; url: string };
	// Present in the static per-city cache (static/cities/<id>.json); fetched live otherwise.
	climate?: Climate;
	transit?: TransitStats;
	green?: GreenStats | null; // null: too large to measure (huge administrative areas)
}

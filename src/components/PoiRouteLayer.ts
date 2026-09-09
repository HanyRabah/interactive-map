import type mapboxgl from "mapbox-gl";

// The driving route from a project's site to one of its points of interest, fetched from
// Mapbox Directions and drawn as a two-layer line (a wide dark casing under a bright core,
// the standard way to keep a route legible over both pale desert and dark water).
//
// Distance and duration are deliberately NOT stored in the CMS: they change when roads do,
// and an admin typing "45 minutes" once is a number nobody will ever revisit. The token is
// the same public Mapbox token the map itself uses.

const SOURCE_ID = "poi-route";
const CASING_ID = "poi-route-casing";
const LINE_ID = "poi-route-line";

export type PoiRoute = {
  /** Road distance in kilometres. */
  km: number;
  /** Driving time in minutes, Mapbox's typical-conditions estimate. */
  minutes: number;
  coordinates: [number, number][];
};

/** Rounded the way a brochure would: under 10 km keeps a decimal, above it doesn't. */
export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`;
}

export async function fetchPoiRoute(
  from: [number, number],
  to: [number, number],
  token: string
): Promise<PoiRoute | null> {
  // overview=full, not simplified: at hero zoom a simplified geometry is a dozen points and
  // visibly cuts corners across open desert.
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}` +
    `?geometries=geojson&overview=full&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
  };
  const route = data.routes?.[0];
  if (!route) return null;
  return {
    km: route.distance / 1000,
    minutes: route.duration / 60,
    coordinates: route.geometry.coordinates,
  };
}

export function drawPoiRoute(map: mapboxgl.Map, coordinates: [number, number][], accent: string) {
  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  };

  const existing = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(geojson);
    return;
  }

  map.addSource(SOURCE_ID, { type: "geojson", data: geojson });
  map.addLayer({
    id: CASING_ID,
    type: "line",
    source: SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#07110f", "line-width": 7, "line-opacity": 0.85 },
  });
  map.addLayer({
    id: LINE_ID,
    type: "line",
    source: SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": accent, "line-width": 3 },
  });
}

export function removePoiRoute(map: mapboxgl.Map) {
  for (const id of [LINE_ID, CASING_ID]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

/** Bounding box of the route, so the camera can frame the whole drive. */
export function routeBounds(coordinates: [number, number][]): [[number, number], [number, number]] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

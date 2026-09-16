import type mapboxgl from "mapbox-gl";

// The interactive zones drawn over the 2D masterplan: one polygon per villa type, tinted by
// how much of that product is still available, brightening under the cursor.
//
// One GeoJSON source with a feature per zone, not a source per zone: Mapbox charges a layer's
// cost per draw call, and eighteen fill+line pairs would be thirty-six of them over a raster
// that already costs plenty. Feature-state carries the hover so moving the mouse repaints on
// the GPU instead of re-uploading the geometry.

const SOURCE_ID = "villa-zones";
const FILL_ID = "villa-zones-fill";
const LINE_ID = "villa-zones-line";
const LABEL_ID = "villa-zones-label";

export type VillaZone = {
  code: string;
  name: string;
  /** Masterplan area — decides the zone's colour. */
  area: string;
  /** Absent when the zone is a neighbourhood rather than one product. */
  areaSqm?: number;
  available: number;
  total: number;
  polygon: [number, number][];
};

// One hue per masterplan area, so neighbourhoods separate at a glance without reading a
// label. Zoya's three are pinned — chosen against the sand, planting and water actually
// underneath them — and fixed so a new area appended in /admin cannot recolour them. Any
// other area takes the next free palette slot in the order areas first appear in the
// project's zone list. Position, not a hash: thirteen names hashed into thirteen slots
// collided five times, and two neighbourhoods sharing a colour defeats the point.
export const AREA_COLORS: Record<string, string> = {
  "Sea Vil": "#1c93a0",
  "Isle Vil": "#e0714f",
  "Coconut Condo": "#9b8cf0",
};
// Distinct against green/sand plan graphics and from each other at 15% fill.
const PALETTE = [
  "#e2b33c", "#4fa3e0", "#e05c8a", "#5ec48a", "#c77dff", "#f08c3a",
  "#3fc1c9", "#d94f4f", "#8fd14f", "#f5c0e8", "#1c93a0", "#e0714f", "#9b8cf0",
];
/** Sold out reads grey whatever its area — the lens exists to show what is gone. */
const SOLD_OUT_COLOR = "#7b8b86";

/** Colour lookup for one project's areas. Build once from the zone list, reuse everywhere. */
export function areaPalette(areas: string[]): (area: string) => string {
  const slots = new Map<string, string>();
  let next = 0;
  for (const a of areas) {
    if (slots.has(a)) continue;
    slots.set(a, AREA_COLORS[a] ?? PALETTE[next++ % PALETTE.length]);
  }
  return (area) => slots.get(area) ?? AREA_COLORS[area] ?? PALETTE[0];
}

function toFeatureCollection(zones: VillaZone[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const color = areaPalette(zones.map((z) => z.area));
  return {
    type: "FeatureCollection",
    features: zones.map((z) => ({
      type: "Feature",
      // A stable id is what makes setFeatureState work at all — without it every hover is a
      // silent no-op.
      id: z.code,
      properties: {
        code: z.code,
        color: z.total > 0 && z.available === 0 ? SOLD_OUT_COLOR : color(z.area),
        // Both halves of the label, because two products can share a name and only the size
        // tells them apart.
        label: z.areaSqm ? `${z.name} · ${z.areaSqm}m²` : z.name,
      },
      geometry: {
        type: "Polygon",
        // GeoJSON polygons must close; the drawing tool stores an open ring.
        coordinates: [[...z.polygon, z.polygon[0]]],
      },
    })),
  };
}

// isStyleLoaded() is the wrong question: it means "every source has finished loading", which
// a map over continuously-streaming raster tiles is rarely in. The style getters only need the
// style to EXIST — undefined before it is set and after the map is removed, where they throw
// rather than return undefined. getStyle() answers exactly that and never throws.
export function drawVillaZones(map: mapboxgl.Map, zones: VillaZone[]) {
  if (!map.getStyle()) return;
  const data = toFeatureCollection(zones.filter((z) => z.polygon.length >= 3));

  const existing = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
    return;
  }

  map.addSource(SOURCE_ID, { type: "geojson", data, promoteId: "code" });

  map.addLayer({
    id: FILL_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.42, 0.15],
    },
  });

  map.addLayer({
    id: LINE_ID,
    type: "line",
    source: SOURCE_ID,
    layout: { "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.5, 1.2],
      "line-opacity": 0.9,
    },
  });

  map.addLayer({
    id: LABEL_ID,
    type: "symbol",
    source: SOURCE_ID,
    layout: {
      "text-field": ["get", "label"],
      "text-size": 11,
      "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
      "text-allow-overlap": false,
      // Zones are small and irregular; letting a label spill outside its own shape is worse
      // than hiding it, because it then points at the wrong plot.
      "text-max-width": 9,
    },
    paint: {
      "text-color": "#f5f3ee",
      "text-halo-color": "#07110f",
      "text-halo-width": 1.4,
      "text-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.75],
    },
  });
}

export function setVillaZoneHover(map: mapboxgl.Map, code: string | null, previous: string | null) {
  if (!map.getStyle() || !map.getSource(SOURCE_ID)) return;
  if (previous) map.setFeatureState({ source: SOURCE_ID, id: previous }, { hover: false });
  if (code) map.setFeatureState({ source: SOURCE_ID, id: code }, { hover: true });
}

export function removeVillaZones(map: mapboxgl.Map) {
  if (!map.getStyle()) return;
  for (const id of [LABEL_ID, LINE_ID, FILL_ID]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

export const VILLA_ZONE_FILL_LAYER = FILL_ID;
/** Bottom-to-top, so re-stacking them in this order preserves fill < line < label. */
export const VILLA_ZONE_LAYER_IDS = [FILL_ID, LINE_ID, LABEL_ID];

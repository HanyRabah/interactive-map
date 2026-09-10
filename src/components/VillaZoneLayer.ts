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
  areaSqm: number;
  available: number;
  total: number;
  polygon: [number, number][];
};

// One hue per masterplan area, so the three neighbourhoods separate at a glance without
// reading a single label. Chosen against what is actually underneath them — sand, vegetation
// and water — rather than as a generic categorical ramp: teal for the seafront, coral and
// violet because both stay distinct from dune and planting at any zoom. The order is fixed
// rather than derived, so a new area appended in /admin cannot recolour the existing three.
export const AREA_COLORS: Record<string, string> = {
  "Sea Vil": "#1c93a0",
  "Isle Vil": "#e0714f",
  "Coconut Condo": "#9b8cf0",
};
const FALLBACK_COLOR = "#7f9d96";
/** Sold out reads grey whatever its area — the lens exists to show what is gone. */
const SOLD_OUT_COLOR = "#7b8b86";

export function areaColor(area: string): string {
  return AREA_COLORS[area] ?? FALLBACK_COLOR;
}

function toFeatureCollection(zones: VillaZone[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: zones.map((z) => ({
      type: "Feature",
      // A stable id is what makes setFeatureState work at all — without it every hover is a
      // silent no-op.
      id: z.code,
      properties: {
        code: z.code,
        color: z.total > 0 && z.available === 0 ? SOLD_OUT_COLOR : areaColor(z.area),
        // Both halves of the label, because two products can share a name and only the size
        // tells them apart.
        label: `${z.name} · ${z.areaSqm}m²`,
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

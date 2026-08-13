import mapboxgl from "mapbox-gl";

// Google's undocumented tile endpoint (mt1.google.com/vt) — not a licensed Maps Platform
// product, used here at the user's explicit, informed request instead of Mapbox's own
// satellite-streets-v12. Only ever mounted during the "journey" (hero/masterplan) stages,
// never on the intro globe. If tiles start failing (Google blocking the pattern, network
// issues), autoFallback below removes this layer so Mapbox's own satellite tiles —
// already the base layer underneath — show through untouched.
const SOURCE_ID = "google-satellite";
const LAYER_ID = "google-satellite-layer";
const FAILURE_THRESHOLD = 3;

export function addGoogleImageryLayer(map: mapboxgl.Map, onFallback?: () => void) {
  if (map.getSource(SOURCE_ID)) return;

  map.addSource(SOURCE_ID, {
    type: "raster",
    tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 20,
  });

  const firstSymbolLayer = map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    { id: LAYER_ID, type: "raster", source: SOURCE_ID, paint: { "raster-opacity": 1, "raster-fade-duration": 0 } },
    firstSymbolLayer
  );

  let failures = 0;
  const onError = (e: mapboxgl.ErrorEvent & { sourceId?: string }) => {
    if (e.sourceId !== SOURCE_ID) return;
    failures += 1;
    if (failures >= FAILURE_THRESHOLD) {
      map.off("error", onError);
      removeGoogleImageryLayer(map);
      onFallback?.();
    }
  };
  map.on("error", onError);
}

export function removeGoogleImageryLayer(map: mapboxgl.Map) {
  if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

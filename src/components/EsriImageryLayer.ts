import mapboxgl from "mapbox-gl";

// Esri World Imagery — a legitimately licensed raster source (unlike scraping Google's
// undocumented mt1.google.com tile endpoint) for comparing imagery freshness against
// Mapbox's own satellite-streets-v12. ArcGIS tile URLs are {z}/{y}/{x}, not {z}/{x}/{y}.
export function addEsriImageryLayer(map: mapboxgl.Map) {
  if (map.getSource("esri-imagery")) return;

  map.addSource("esri-imagery", {
    type: "raster",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 19,
    attribution: "Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  });

  const firstSymbolLayer = map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    {
      id: "esri-imagery-layer",
      type: "raster",
      source: "esri-imagery",
      paint: { "raster-opacity": 1, "raster-fade-duration": 0 },
    },
    firstSymbolLayer
  );
}

export function removeEsriImageryLayer(map: mapboxgl.Map) {
  if (map.getLayer("esri-imagery-layer")) map.removeLayer("esri-imagery-layer");
  if (map.getSource("esri-imagery")) map.removeSource("esri-imagery");
}

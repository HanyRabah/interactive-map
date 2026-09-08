import mapboxgl from "mapbox-gl";

export type ImageMasterplanParams = {
  /** Footprint width (east-west before rotation), in meters. */
  widthMeters: number;
  /** Footprint height (north-south before rotation), in meters. */
  heightMeters: number;
  /** Rotation clockwise from north, in degrees. */
  rotationDeg: number;
  /** Meters east of the anchor lng/lat. */
  offsetE: number;
  /** Meters north of the anchor lng/lat. */
  offsetN: number;
};

export const DEFAULT_IMAGE_MASTERPLAN_PARAMS: ImageMasterplanParams = {
  widthMeters: 600,
  heightMeters: 600,
  rotationDeg: 0,
  offsetE: 0,
  offsetN: 0,
};

const aspectCache = new Map<string, number>();

/** Real width/height ratio of the image file — cached per URL, since it never changes. */
export function getImageAspectRatio(url: string): Promise<number> {
  const cached = aspectCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      aspectCache.set(url, ratio);
      resolve(ratio);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// A drawn boundary's bounding box essentially never matches the source image's own pixel
// aspect ratio — forcing both width and height to the box independently (what used to
// happen here) stretches the image. This fits it inside the box instead, preserving the
// real proportions: whichever dimension the box constrains tighter wins, the other shrinks
// to match the image's true ratio.
export function fitToAspect(boxWidth: number, boxHeight: number, aspect: number): { widthMeters: number; heightMeters: number } {
  if (boxWidth / boxHeight > aspect) {
    return { widthMeters: boxHeight * aspect, heightMeters: boxHeight };
  }
  return { widthMeters: boxWidth, heightMeters: boxWidth / aspect };
}

// Raster ("image" source) layers are never queryable via queryRenderedFeatures, so Mapbox's
// layer-scoped click/hover events (map.on("click", layerId, ...)) silently never fire on
// them — a map-wide click handler has to test the point itself instead.
export function pointInQuad(point: [number, number], quad: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    const [xi, yi] = quad[i];
    const [xj, yj] = quad[j];
    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function metersToLngLat(lng: number, lat: number, eastMeters: number, northMeters: number): [number, number] {
  const latDelta = northMeters / 111_320;
  const lngDelta = eastMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lng + lngDelta, lat + latDelta];
}

// Corner order Mapbox's image source expects: top-left, top-right, bottom-right, bottom-left.
export function computeImageCorners(
  lng: number,
  lat: number,
  p: ImageMasterplanParams
): [[number, number], [number, number], [number, number], [number, number]] {
  const rad = (p.rotationDeg * Math.PI) / 180;
  const hw = p.widthMeters / 2;
  const hh = p.heightMeters / 2;
  const corners: [number, number][] = [
    [-hw, hh],
    [hw, hh],
    [hw, -hh],
    [-hw, -hh],
  ];
  return corners.map(([x, y]) => {
    const rx = x * Math.cos(rad) - y * Math.sin(rad);
    const ry = x * Math.sin(rad) + y * Math.cos(rad);
    return metersToLngLat(lng, lat, p.offsetE + rx, p.offsetN + ry);
  }) as [[number, number], [number, number], [number, number], [number, number]];
}

// Mapbox's native "image" source only accepts PNG/JPEG — rasterize SVG data URIs
// (our placeholder generator's output) on the fly; real photo/render URLs pass through.
function rasterizeIfSvg(url: string): Promise<string> {
  if (!url.startsWith("data:image/svg+xml")) return Promise.resolve(url);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width || 800;
      canvas.height = img.height || 600;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("2d context unavailable"));
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function addImageMasterplanLayer(
  map: mapboxgl.Map,
  id: string,
  imageUrl: string,
  lng: number,
  lat: number,
  params: ImageMasterplanParams
) {
  const url = await rasterizeIfSvg(imageUrl);
  const coordinates = computeImageCorners(lng, lat, params);

  // Re-entry (the journey calls this once entering "hero" and again entering
  // "masterplan") must UPDATE the existing source in place, not tear it down and
  // re-add: removing an image source mid-frame trips a "reading 'get'" TypeError
  // inside mapbox-gl 3.28's removeSource, which aborts after the layer is already
  // deleted — leaving the source stranded and the masterplan invisible.
  const existing = map.getSource(id) as mapboxgl.ImageSource | undefined;
  if (existing) {
    existing.updateImage({ url, coordinates });
    if (!map.getLayer(id)) {
      map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0.95, "raster-fade-duration": 0 } });
    }
    return;
  }

  map.addSource(id, { type: "image", url, coordinates });
  map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0.95, "raster-fade-duration": 0 } });
}

export function updateImageMasterplanLayer(map: mapboxgl.Map, id: string, lng: number, lat: number, params: ImageMasterplanParams) {
  const source = map.getSource(id) as mapboxgl.ImageSource | undefined;
  source?.setCoordinates(computeImageCorners(lng, lat, params));
}

export function removeImageMasterplanLayer(map: mapboxgl.Map, id: string) {
  // Same mapbox-gl 3.28 removeSource fragility as above — a failed teardown here must
  // not crash the caller (backToOverview), it just means the hidden source lingers.
  try {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  } catch (err) {
    console.warn("removeImageMasterplanLayer: teardown failed (mapbox removeSource quirk)", err);
  }
}

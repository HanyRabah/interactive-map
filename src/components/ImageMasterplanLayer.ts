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
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
  map.addSource(id, { type: "image", url, coordinates });
  map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0.95, "raster-fade-duration": 0 } });
}

export function updateImageMasterplanLayer(map: mapboxgl.Map, id: string, lng: number, lat: number, params: ImageMasterplanParams) {
  const source = map.getSource(id) as mapboxgl.ImageSource | undefined;
  source?.setCoordinates(computeImageCorners(lng, lat, params));
}

export function removeImageMasterplanLayer(map: mapboxgl.Map, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
}

// Geometry helpers for the boundary-drawing tool: trace a site outline on the map,
// derive its centroid/rotation/extent, and use that to seed masterplan calibration
// instead of guessing offset/rotation/scale numbers by hand.

export type LngLat = [number, number];

export function lngLatToMeters(lng: number, lat: number, originLng: number, originLat: number): [number, number] {
  const north = (lat - originLat) * 111_320;
  const east = (lng - originLng) * 111_320 * Math.cos((originLat * Math.PI) / 180);
  return [east, north];
}

export function metersToLngLat(east: number, north: number, originLng: number, originLat: number): LngLat {
  const lat = originLat + north / 111_320;
  const lng = originLng + east / (111_320 * Math.cos((originLat * Math.PI) / 180));
  return [lng, lat];
}

function cross(o: [number, number], a: [number, number], b: [number, number]) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// Andrew's monotone chain, standard O(n log n) convex hull.
export function convexHull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export type MinRect = { angleDeg: number; width: number; height: number; center: [number, number] };

// Rotating calipers minimum-area bounding rectangle: for a real site boundary, the
// tightest-fit rectangle almost always shares an edge with the polygon, so we only
// need to test one rotation per hull edge rather than search all angles.
export function minAreaRect(points: [number, number][]): MinRect {
  const hull = convexHull(points);
  if (hull.length < 3) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return { angleDeg: 0, width: maxX - minX, height: maxY - minY, center: [(minX + maxX) / 2, (minY + maxY) / 2] };
  }

  let best: MinRect | null = null;
  for (let i = 0; i < hull.length; i++) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % hull.length];
    const edgeAngle = Math.atan2(y2 - y1, x2 - x1);
    const cos = Math.cos(-edgeAngle);
    const sin = Math.sin(-edgeAngle);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of hull) {
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      minX = Math.min(minX, rx);
      maxX = Math.max(maxX, rx);
      minY = Math.min(minY, ry);
      maxY = Math.max(maxY, ry);
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;
    if (!best || area < best.width * best.height) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      // rotate the rect center back into world space
      const cosBack = Math.cos(edgeAngle);
      const sinBack = Math.sin(edgeAngle);
      const worldCx = cx * cosBack - cy * sinBack;
      const worldCy = cx * sinBack + cy * cosBack;
      best = { angleDeg: (edgeAngle * 180) / Math.PI, width, height, center: [worldCx, worldCy] };
    }
  }
  return best!;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km between two [lng, lat] points. Real coordinates in, real distance out — no estimation. */
export function haversineKm(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

export function polygonCentroid(points: [number, number][]): [number, number] {
  let x = 0, y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

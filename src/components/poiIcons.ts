import type { PoiCategory } from "@/data/projects";

// One icon per POI category, as raw SVG *children* on a 24x24 grid. Stored as markup
// strings rather than React components because they're needed in two places that can't
// share a component: the JSX list on the hero stage, and the innerHTML of a vanilla DOM
// element handed to mapboxgl.Marker. Stroke-only, 1.5px, matching the globe button — these
// render at 14-18px and a filled glyph turns to mud at that size.
export const POI_ICON_PATHS: Record<PoiCategory, string> = {
  // Plane, banking left.
  airport: '<path d="M10.2 3.3a1.6 1.6 0 0 1 3 0L14.5 9l6.2 3.4v2l-6.2-1.7-.8 4 2 1.6v1.4l-3.4-1-3.4 1v-1.4l2-1.6-.8-4L3.9 14v-2L10 9z"/>',
  // Skyline.
  city: '<path d="M3 21h18"/><path d="M5 21V9l5-3v15"/><path d="M14 21V11l5 2v8"/><path d="M8 12h.01M8 15.5h.01M17 15h.01M17 18h.01"/>',
  // Sailboat.
  marina: '<path d="M12 3v11"/><path d="M12 4.5 6.5 14H12"/><path d="M12 14h5.5L12 6"/><path d="M3.5 17.5h17l-2.2 3.5H5.7z"/>',
  // Parasol over waves.
  beach: '<path d="M12 4a7 7 0 0 1 7 7H5a7 7 0 0 1 7-7z"/><path d="M12 11v9"/><path d="M3 21c1.5-1.2 3-1.2 4.5 0S10.5 22.2 12 21s3-1.2 4.5 0"/>',
  // Flag on a green.
  golf: '<path d="M9 20V4l8 3.5-8 3.5"/><path d="M6 20.5h8"/>',
  // Cross in a rounded square.
  hospital: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M12 8.5v7"/><path d="M8.5 12h7"/>',
  // Mortarboard.
  school: '<path d="M12 4 2.5 8.5 12 13l9.5-4.5z"/><path d="M6.5 10.7V15c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-4.3"/><path d="M21.5 8.5V14"/>',
  // Shopping bag.
  shopping: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  // Map pin.
  landmark: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
};

/** A complete <svg> string, for innerHTML on a marker element. */
export function poiIconSvg(category: PoiCategory, size = 16): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${POI_ICON_PATHS[category]}</svg>`
  );
}

// Single source of truth for the project catalog — moved out of GlobePortfolioMap.tsx so
// server code (the /api/projects catalog routes) can import it without dragging in a
// "use client" component and its mapbox-gl CSS import, which a route handler can't load.
// All cross-module imports here are `import type` (erased at compile), so this module has
// ZERO runtime dependencies and is safe in any bundle.

import type { MediaPhoto, MediaVideo } from "@/components/MediaModal";
import type { MasterplanModel, MasterplanParams } from "@/components/MasterplanLayer";
import type { ImageMasterplanParams } from "@/components/ImageMasterplanLayer";

// ponytail: inline SVG placeholders stand in for real aerial photos/renders.
// Swap TimelineEntry.image for a real photo URL (or /public asset path) per date.
function placeholderPhoto(from: string, to: string, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="800" height="600" fill="url(#g)"/>
    <text x="400" y="300" font-family="sans-serif" font-size="28" fill="white" text-anchor="middle" opacity="0.85">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export type TimelineEntry = {
  date: string;
  label: string;
  image: string;
};

// Per-project CRM connection — which live-inventory backend this project's /api/units
// calls route to. Set from the CMS admin panel (cms catalog); in-repo projects omit it
// and fall back to the global CRM_PROVIDER env default. SERVER-ONLY: the public catalog
// API strips this field (it can carry credentials).
export type ProjectCrmConfig =
  | { provider: "mock" }
  | { provider: "sap" }
  | {
      provider: "salesforce";
      instanceUrl: string;
      clientId: string;
      clientSecret: string;
      /** Value of Project_Id__c in that org's Unit__c records. */
      externalProjectId: string;
      currency?: string;
    };

/** Category drives which icon the overview list and the map marker use. */
export type PoiCategory =
  | "airport" | "city" | "marina" | "beach" | "golf" | "hospital" | "school" | "shopping" | "landmark";

/** Somewhere near the site worth knowing the drive to. Distance and time are NOT stored —
 *  they're routed live from the project's coordinates when a visitor asks. */
export type PointOfInterest = {
  name: string;
  category: PoiCategory;
  lng: number;
  lat: number;
};

export type Project = {
  id: string;
  name: string;
  developer: string;
  /** Tenant key — which client's pathed experience (/lmd, /ora) this project appears in. */
  clientSlug?: string;
  country: string;
  countryCode: string;
  /** Optional: a project whose area isn't publicly confirmed lists without a pin. */
  lng?: number;
  lat?: number;
  /** How trustworthy the coordinates are — drives fly-in zoom depth. */
  precision?: "exact" | "district" | "city";
  /** Server-only inventory routing — see ProjectCrmConfig. Never exposed via /api/projects. */
  crm?: ProjectCrmConfig;
  timeline?: TimelineEntry[];
  media?: { photos?: MediaPhoto[]; videos?: MediaVideo[] };
  model?: MasterplanModel;
  modelCalibration?: MasterplanParams;
  /** A second, independently-calibrated 3D model (e.g. a lagoon/water feature spanning a wider area than the masterplan). */
  lagoonModel?: MasterplanModel;
  lagoonCalibration?: MasterplanParams;
  masterplanImage?: { url: string; params?: ImageMasterplanParams };
  /** Surveyed site outline (real data), when available — skips hand-tracing entirely. */
  boundaryPolygon?: [number, number][];
  /** Nearby landmarks listed on the site overview, each routable from the site. */
  pointsOfInterest?: PointOfInterest[];
};

export const PROJECTS: Project[] = [
  {
    id: "one-ninety",
    name: "One Ninety, New Cairo",
    developer: "LMD",
    country: "Egypt",
    countryCode: "EG",
    lng: 31.4025592,
    lat: 30.0133243,
    timeline: [
      { date: "2023-01", label: "Undeveloped land", image: placeholderPhoto("#8a7a54", "#c9b98a", "Jan 2023") },
      { date: "2024-06", label: "Infrastructure & foundations", image: placeholderPhoto("#7a7a72", "#b9b9ab", "Jun 2024") },
      { date: "2025-08", label: "Construction in progress", image: placeholderPhoto("#6b7280", "#9ca3af", "Aug 2025") },
      { date: "2026-08", label: "Current", image: placeholderPhoto("#4b5563", "#94a3b8", "Aug 2026 · Current") },
      { date: "planned", label: "Planned (final render)", image: placeholderPhoto("#312e81", "#818cf8", "Planned") },
    ],
    // ponytail: placeholder gallery/video — swap `image`/`src` for real DP Productions assets per project.
    media: {
      videos: [
        { title: "Aerial Flythrough — Aug 2026", poster: placeholderPhoto("#1f2937", "#4b5563", "Aerial Flythrough") },
      ],
      photos: [
        { caption: "North entrance", image: placeholderPhoto("#7c6a46", "#d8c79a", "North Entrance") },
        { caption: "Clubhouse render", image: placeholderPhoto("#334155", "#64748b", "Clubhouse") },
        { caption: "Landscaping detail", image: placeholderPhoto("#365314", "#84cc16", "Landscaping") },
        { caption: "Typical unit interior", image: placeholderPhoto("#3f3f46", "#a1a1aa", "Interior") },
        { caption: "Site progress — drone", image: placeholderPhoto("#6b7280", "#9ca3af", "Drone Progress") },
        { caption: "Masterplan overview", image: placeholderPhoto("#312e81", "#818cf8", "Masterplan") },
      ],
    },
  },
  { id: "lmd-capital", name: "LMD, New Capital", developer: "LMD", country: "Egypt", countryCode: "EG", lng: 31.7357, lat: 30.0192 },
  {
    id: "zoya-ghazala-bay",
    name: "Zoya Ghazala Bay",
    developer: "LMD",
    country: "Egypt",
    countryCode: "EG",
    lng: 28.595006,
    lat: 31.024578,
    // real client export (was 1.08GB/220M verts, unusable in a browser) — optimized via
    // gltf-transform (weld + meshopt simplify + draco) down to 29.7MB. Calibrated against
    // satellite imagery via the in-app "Calibrate" panel — re-tune there and re-copy if
    // the model or anchor point ever changes.
    model: { url: "/models/zoya-ghazala-bay.glb" },
    // offsetUp corrects a real bug: the loader used to auto-rest the model's lowest
    // vertex at ground level, but one outlier point in this file dragged that ~346m
    // below the actual buildings — floating the whole visible model ~346m above grade
    // and causing it to visibly drift as the camera panned/tilted. Fixed by trusting
    // the source's own Y=0 datum instead; re-check offsetUp here if it still looks off.
    modelCalibration: { scale: 1, rotationDeg: 0, offsetE: -55, offsetN: 537, offsetUp: 0 },
    // Second real client export ("ZOYA LAGOON SHOTS-1.glb", also 1.08GB/220M verts, same
    // no-texture "fallback Material" CAD export as the masterplan — colors come from
    // materialFor()'s name-based categories, e.g. its "VRayProxy_Sea ... Glass Edit"
    // meshes read as the glass/water category). Compressed the same way, down to 18.4MB.
    // Uncalibrated — params below are a starting guess (same anchor as the masterplan);
    // open the "3D Lagoon" button and tune via the Calibrate panel against real imagery.
    lagoonModel: { url: "/models/zoya-lagoon.glb" },
    lagoonCalibration: { scale: 1, rotationDeg: 0, offsetE: 0, offsetN: 0, offsetUp: 0 },
    // Real branded masterplan graphic (client-supplied "Masterplan.png", 6000x6000
    // 16-bit PNG at 46.9MB — re-encoded to 4096x4096 WebP q92 with alpha preserved,
    // 1.49MB, verified still exactly square (no distortion from the re-encode);
    // original kept at assets-src/zoya/Masterplan-original.png, outside public/ so
    // it's never served or committed. widthMeters/heightMeters are square (matching
    // the source PNG's real 1:1 aspect ratio) on purpose — an earlier version forced
    // it into the boundary's raw 1748x839 rotated-rect and stretched it. These exact
    // numbers were hand-tuned via the in-app "Adjust position" panel (nudge/resize/
    // rotate) against the satellite imagery and copied from there, not recomputed.
    masterplanImage: {
      url: "/media/zoya/masterplan.webp",
      params: { widthMeters: 1826, heightMeters: 1826, rotationDeg: -0.3, offsetE: -88, offsetN: -498 },
    },
    // Surveyed site outline (Nawy listings data), not hand-traced — use the "Use Site
    // Boundary" button to derive accurate width/height/rotation for both masterplans.
    boundaryPolygon: [
      [28.588756, 31.013028], [28.591625, 31.01253], [28.590335, 31.018742], [28.590467, 31.019031],
      [28.593066, 31.021013], [28.594135, 31.021913], [28.596454, 31.023079], [28.596636, 31.023246],
      [28.599044, 31.023994], [28.599554, 31.024634], [28.598856, 31.025071], [28.598716, 31.025221],
      [28.598674, 31.02534], [28.598255, 31.025807], [28.597788, 31.0261], [28.597048, 31.026824],
      [28.596501, 31.027308], [28.59093, 31.024241], [28.59139, 31.024028], [28.591272, 31.023621],
      [28.590273, 31.023729], [28.589903, 31.022437], [28.587975, 31.022364], [28.588137, 31.021348],
      [28.58864, 31.019333], [28.588675, 31.017476], [28.587879, 31.015681], [28.588277, 31.014311],
    ],
  },
  {
    id: "bec",
    name: "BEC",
    developer: "LMD",
    country: "Egypt",
    countryCode: "EG",
    lng: 34.757373,
    lat: 28.067182,
    // Real Sketchfab photogrammetry export (v1_-_bec.glb), the original 88.17MB file with an
    // 8192x8192 baked texture — kept un-optimized at the user's request instead of the
    // gltf-transform-compressed 1.84MB version, so expect a slower first load.
    model: { url: "/models/bec.glb" },
    // User-calibrated against real site imagery via the Calibrate panel.
    modelCalibration: { scale: 9.366, rotationDeg: -104, offsetE: -15, offsetN: 90, offsetUp: 0 },
  },
  { id: "swan-lake", name: "Swan Lake, Sheikh Zayed", developer: "Hassan Allam", country: "Egypt", countryCode: "EG", lng: 30.9421, lat: 30.0426 },
  { id: "dubai-hills", name: "Dubai Hills Estate", developer: "Emaar", country: "UAE", countryCode: "AE", lng: 55.2497, lat: 25.1124 },
  { id: "yas-island", name: "Yas Island", developer: "Aldar", country: "UAE", countryCode: "AE", lng: 54.6058, lat: 24.4972 },
  { id: "diriyah", name: "Diriyah Gate", developer: "DGDA", country: "Saudi Arabia", countryCode: "SA", lng: 46.5725, lat: 24.7333 },
  { id: "roshn", name: "SEDRA, Riyadh", developer: "ROSHN", country: "Saudi Arabia", countryCode: "SA", lng: 46.6753, lat: 24.7136 },
  { id: "nine-elms", name: "Nine Elms, London", developer: "St. Modwen", country: "United Kingdom", countryCode: "UK", lng: -0.1257, lat: 51.4816 },
];

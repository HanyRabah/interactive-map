"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapCompareOverlay, { boundsAround } from "./MapCompareOverlay";
import MediaModal, { type MediaPhoto, type MediaVideo } from "./MediaModal";
import { createMasterplanLayer, type MasterplanModel, type MasterplanLayer, type MasterplanParams, DEFAULT_MASTERPLAN_PARAMS } from "./MasterplanLayer";
import {
  addImageMasterplanLayer,
  updateImageMasterplanLayer,
  removeImageMasterplanLayer,
  getImageAspectRatio,
  fitToAspect,
  type ImageMasterplanParams,
  DEFAULT_IMAGE_MASTERPLAN_PARAMS,
} from "./ImageMasterplanLayer";
import { lngLatToMeters, minAreaRect, type MinRect } from "./boundary";

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

function formatTimelineDate(date: string) {
  if (date === "planned") return "Planned";
  const [y, m] = date.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = Number(m) - 1;
  return m && months[mi] ? `${months[mi]} ${y}` : date;
}

type TimelineEntry = {
  date: string;
  label: string;
  image: string;
};

export type Project = {
  id: string;
  name: string;
  developer: string;
  country: string;
  countryCode: string;
  lng: number;
  lat: number;
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

const COUNTRIES = Array.from(new Set(PROJECTS.map((p) => p.country))).map((country) => {
  const sample = PROJECTS.find((p) => p.country === country)!;
  return {
    country,
    countryCode: sample.countryCode,
    projects: PROJECTS.filter((p) => p.country === country),
  };
});

const REGIONS = ["Middle East", "Europe", "Asia"];
const PROJECT_ZOOM = 17.5;

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

function detectWebgl(): "webgl2" | "webgl1" | "unsupported" {
  if (typeof document === "undefined") return "unsupported";
  const canvas = document.createElement("canvas");
  if (canvas.getContext("webgl2")) return "webgl2";
  if (canvas.getContext("webgl")) return "webgl1";
  return "unsupported";
}

export default function GlobePortfolioMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const spinning = useRef(true);
  const [region, setRegion] = useState("Middle East");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>("Egypt");
  const [projection, setProjection] = useState<"globe" | "mercator">("globe");
  const [loaded, setLoaded] = useState(false);
  const [webgl, setWebgl] = useState<"webgl2" | "webgl1" | "unsupported" | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [compareIndex, setCompareIndex] = useState(0);
  const [compareOpen, setCompareOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [masterplan3DOpen, setMasterplan3DOpen] = useState(false);
  const [lagoon3DOpen, setLagoon3DOpen] = useState(false);
  const [imageMasterplanOpen, setImageMasterplanOpen] = useState(false);
  const [calib3D, setCalib3D] = useState<MasterplanParams>(DEFAULT_MASTERPLAN_PARAMS);
  const [calibLagoon, setCalibLagoon] = useState<MasterplanParams>(DEFAULT_MASTERPLAN_PARAMS);
  const [calibImage, setCalibImage] = useState<ImageMasterplanParams>(DEFAULT_IMAGE_MASTERPLAN_PARAMS);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const masterplanLayerId = useRef<string | null>(null);
  const masterplanLayerObj = useRef<MasterplanLayer | null>(null);
  const lagoonLayerId = useRef<string | null>(null);
  const lagoonLayerObj = useRef<MasterplanLayer | null>(null);
  const imageMasterplanId = useRef<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const drawModeRef = useRef(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const drawPointsRef = useRef<[number, number][]>([]);
  const [boundaryResult, setBoundaryResult] = useState<{ rect: MinRect; centroidMeters: [number, number] } | null>(
    null
  );
  const [modelFootprint, setModelFootprint] = useState<{ width: number; depth: number } | null>(null);

  useEffect(() => {
    // one-time environment capability check, not synchronizing with any external subscription
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebgl(detectWebgl());
  }, []);

  function flyToProject(p: Project) {
    spinning.current = false;
    setSelectedProject(p);
    setCompareIndex(0);
    setCompareOpen(false);
    setMediaOpen(false);
    removeMasterplanLayer();
    removeLagoonLayer();
    removeImageMasterplan();
    clearBoundary();
    setDrawMode(false);
    drawModeRef.current = false;
    map.current?.flyTo({ center: [p.lng, p.lat], zoom: PROJECT_ZOOM, pitch: 60, duration: 2600, essential: true });
  }

  function removeMasterplanLayer() {
    const m = map.current;
    if (m && masterplanLayerId.current && m.getLayer(masterplanLayerId.current)) {
      m.removeLayer(masterplanLayerId.current);
    }
    masterplanLayerId.current = null;
    masterplanLayerObj.current = null;
    setMasterplan3DOpen(false);
    setModelFootprint(null);
  }

  function enterMasterplan3D(p: Project) {
    const m = map.current;
    if (!m) return;
    setCompareOpen(false);
    removeImageMasterplan();
    const layerId = `masterplan-${p.id}`;
    const params = p.modelCalibration ?? DEFAULT_MASTERPLAN_PARAMS;
    if (!m.getLayer(layerId)) {
      const layer = createMasterplanLayer(layerId, p.lng, p.lat, 0, p.model, params, setModelFootprint);
      m.addLayer(layer);
      masterplanLayerObj.current = layer;
    }
    masterplanLayerId.current = layerId;
    setCalib3D(params);
    setMasterplan3DOpen(true);
    m.flyTo({ center: [p.lng, p.lat], zoom: 17, pitch: 55, bearing: -20, duration: 1800 });
  }

  function removeLagoonLayer() {
    const m = map.current;
    if (m && lagoonLayerId.current && m.getLayer(lagoonLayerId.current)) {
      m.removeLayer(lagoonLayerId.current);
    }
    lagoonLayerId.current = null;
    lagoonLayerObj.current = null;
    setLagoon3DOpen(false);
  }

  // Independent of enterMasterplan3D on purpose — both 3D layers can be open together so
  // the (still-uncalibrated) lagoon model can be visually aligned against the already-tuned
  // masterplan, not just against bare satellite imagery.
  function enterLagoon3D(p: Project) {
    const m = map.current;
    if (!m || !p.lagoonModel) return;
    setCompareOpen(false);
    removeImageMasterplan();
    const layerId = `lagoon-${p.id}`;
    const params = p.lagoonCalibration ?? DEFAULT_MASTERPLAN_PARAMS;
    if (!m.getLayer(layerId)) {
      const layer = createMasterplanLayer(layerId, p.lng, p.lat, 0, p.lagoonModel, params);
      m.addLayer(layer);
      lagoonLayerObj.current = layer;
    }
    lagoonLayerId.current = layerId;
    setCalibLagoon(params);
    setLagoon3DOpen(true);
    m.flyTo({ center: [p.lng, p.lat], zoom: 15.5, pitch: 55, bearing: -20, duration: 1800 });
  }

  function updateCalibLagoon(next: MasterplanParams) {
    setCalibLagoon(next);
    lagoonLayerObj.current?.setParams(next);
    map.current?.triggerRepaint();
  }

  function updateCalib3D(next: MasterplanParams) {
    setCalib3D(next);
    masterplanLayerObj.current?.setParams(next);
    map.current?.triggerRepaint();
  }

  function removeImageMasterplan() {
    const m = map.current;
    if (m && imageMasterplanId.current) removeImageMasterplanLayer(m, imageMasterplanId.current);
    imageMasterplanId.current = null;
    setImageMasterplanOpen(false);
  }

  function enterImageMasterplan(p: Project) {
    const m = map.current;
    if (!m || !p.masterplanImage) return;
    removeMasterplanLayer();
    setCompareOpen(false);
    const layerId = `masterplan-image-${p.id}`;
    const params = p.masterplanImage.params ?? DEFAULT_IMAGE_MASTERPLAN_PARAMS;
    addImageMasterplanLayer(m, layerId, p.masterplanImage.url, p.lng, p.lat, params).catch((err) =>
      console.error("Failed to add masterplan image layer", err)
    );
    imageMasterplanId.current = layerId;
    setCalibImage(params);
    setImageMasterplanOpen(true);
    // Unlike the compare-mode overlay (plain HTML, only reads correctly top-down), this
    // is a real georeferenced Mapbox "image" source — it projects correctly at any pitch/
    // bearing, so there's no need to flatten the camera; fitBounds keeps whatever tilt the
    // map is already at.
    const { sw, ne } = boundsAround(p.lng, p.lat, Math.max(params.widthMeters, params.heightMeters) / 2 + 100);
    m.fitBounds([sw, ne], { padding: 60, duration: 1200 });
  }

  function updateCalibImage(p: Project, next: ImageMasterplanParams) {
    const m = map.current;
    setCalibImage(next);
    if (m && imageMasterplanId.current) updateImageMasterplanLayer(m, imageMasterplanId.current, p.lng, p.lat, next);
  }

  function enterCompare(p: Project) {
    const m = map.current;
    if (!m) return;
    removeMasterplanLayer();
    removeImageMasterplan();
    setCompareOpen(true);
    m.dragRotate.disable();
    m.touchZoomRotate.disableRotation();
    const { sw, ne } = boundsAround(p.lng, p.lat, 300);
    m.easeTo({ pitch: 0, bearing: 0, duration: 900 });
    window.setTimeout(() => {
      m.fitBounds([sw, ne], { padding: 60, duration: 1200 });
    }, 300);
  }

  function exitCompare(p: Project) {
    const m = map.current;
    setCompareOpen(false);
    if (!m) return;
    m.dragRotate.enable();
    m.touchZoomRotate.enableRotation();
    m.flyTo({ center: [p.lng, p.lat], zoom: PROJECT_ZOOM, pitch: 60, duration: 1600 });
  }

  function renderBoundaryDraw(points: [number, number][]) {
    const m = map.current;
    const src = m?.getSource("boundary-draw") as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    const features: GeoJSON.Feature[] = [
      ...points.map((p, i) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: p },
        properties: { i },
      })),
      ...(points.length >= 2
        ? [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: points }, properties: {} }]
        : []),
      ...(points.length >= 3
        ? [{ type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [[...points, points[0]]] }, properties: {} }]
        : []),
    ];
    src.setData({ type: "FeatureCollection", features });
  }

  function startDrawing(p: Project) {
    const m = map.current;
    if (!m) return;
    removeMasterplanLayer();
    removeImageMasterplan();
    setCompareOpen(false);
    setBoundaryResult(null);
    drawPointsRef.current = [];
    setDrawPoints([]);
    renderBoundaryDraw([]);
    setDrawMode(true);
    drawModeRef.current = true;
    m.dragRotate.disable();
    m.touchZoomRotate.disableRotation();
    m.easeTo({ pitch: 0, bearing: 0, duration: 900 });
    window.setTimeout(() => {
      const { sw, ne } = boundsAround(p.lng, p.lat, 400);
      m.fitBounds([sw, ne], { padding: 60, duration: 1200 });
    }, 300);
  }

  function undoDrawPoint() {
    const next = drawPointsRef.current.slice(0, -1);
    drawPointsRef.current = next;
    setDrawPoints(next);
    renderBoundaryDraw(next);
  }

  function cancelDrawing() {
    setDrawMode(false);
    drawModeRef.current = false;
    drawPointsRef.current = [];
    setDrawPoints([]);
    renderBoundaryDraw([]);
    map.current?.dragRotate.enable();
    map.current?.touchZoomRotate.enableRotation();
  }

  function computeBoundaryResult(p: Project, points: [number, number][]) {
    const meterPts = points.map(([lng, lat]) => lngLatToMeters(lng, lat, p.lng, p.lat));
    const rect = minAreaRect(meterPts);
    // rect.center (the rotating-calipers rectangle's own center) anchors the fitted
    // shape better than a plain vertex average, which skews toward denser corners.
    setBoundaryResult({ rect, centroidMeters: rect.center });
  }

  function finishDrawing(p: Project) {
    const pts = drawPointsRef.current;
    if (pts.length < 3) return;
    computeBoundaryResult(p, pts);
    setDrawMode(false);
    drawModeRef.current = false;
    map.current?.dragRotate.enable();
    map.current?.touchZoomRotate.enableRotation();
  }

  function loadOfficialBoundary(p: Project) {
    const m = map.current;
    if (!m || !p.boundaryPolygon) return;
    removeMasterplanLayer();
    removeImageMasterplan();
    setCompareOpen(false);
    drawPointsRef.current = p.boundaryPolygon;
    setDrawPoints(p.boundaryPolygon);
    renderBoundaryDraw(p.boundaryPolygon);
    computeBoundaryResult(p, p.boundaryPolygon);
    m.easeTo({ pitch: 0, bearing: 0, duration: 900 });
    window.setTimeout(() => {
      const lngs = p.boundaryPolygon!.map((pt) => pt[0]);
      const lats = p.boundaryPolygon!.map((pt) => pt[1]);
      m.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 80, duration: 1200 }
      );
    }, 300);
  }

  function clearBoundary() {
    setBoundaryResult(null);
    drawPointsRef.current = [];
    setDrawPoints([]);
    renderBoundaryDraw([]);
  }

  async function applyBoundaryToImage(p: Project) {
    if (!boundaryResult || !p.masterplanImage) return;
    const { rect, centroidMeters } = boundaryResult;
    // The drawn box's aspect ratio essentially never matches the real image's own — fitting
    // both dimensions to it independently stretched the graphic. fitToAspect keeps the real
    // proportions and shrinks whichever side the box doesn't tightly constrain.
    const aspect = await getImageAspectRatio(p.masterplanImage.url).catch(() => rect.width / rect.height);
    const { widthMeters, heightMeters } = fitToAspect(rect.width, rect.height, aspect);
    const next: ImageMasterplanParams = {
      widthMeters: Math.round(widthMeters),
      heightMeters: Math.round(heightMeters),
      rotationDeg: Math.round(rect.angleDeg * 10) / 10,
      offsetE: Math.round(centroidMeters[0]),
      offsetN: Math.round(centroidMeters[1]),
    };
    if (!imageMasterplanOpen) enterImageMasterplan(p);
    window.setTimeout(() => updateCalibImage(p, next), imageMasterplanOpen ? 0 : 350);
  }

  function applyBoundaryTo3D(p: Project) {
    if (!boundaryResult) return;
    const { rect, centroidMeters } = boundaryResult;
    const longSide = Math.max(rect.width, rect.height);
    const footprintLong = modelFootprint ? Math.max(modelFootprint.width, modelFootprint.depth) : null;
    const scale = footprintLong ? Math.round((longSide / footprintLong) * 1000) / 1000 : calib3D.scale;
    const next: MasterplanParams = {
      scale,
      rotationDeg: Math.round(rect.angleDeg * 10) / 10,
      offsetE: Math.round(centroidMeters[0]),
      offsetN: Math.round(centroidMeters[1]),
      offsetUp: calib3D.offsetUp,
    };
    if (!masterplan3DOpen) enterMasterplan3D(p);
    window.setTimeout(() => updateCalib3D(next), masterplan3DOpen ? 0 : 350);
  }

  function toggleProjection() {
    const next = projection === "globe" ? "mercator" : "globe";
    setProjection(next);
    map.current?.setProjection(next);
  }

  useEffect(() => {
    if (!mapContainer.current || map.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      projection: "globe",
      center: [35, 26],
      zoom: 1.6,
      pitch: 0,
      attributionControl: false,
    });

    m.on("style.load", () => {
      m.setFog({
        color: "rgb(20, 24, 38)",
        "high-color": "rgb(36, 44, 74)",
        "horizon-blend": 0.03,
        "space-color": "rgb(4, 6, 14)",
        "star-intensity": 0.4,
      });

      m.addSource("projects", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: PROJECTS.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            properties: { id: p.id, name: p.name },
          })),
        },
      });

      m.addLayer({
        id: "project-glow",
        type: "circle",
        source: "projects",
        paint: {
          "circle-radius": 14,
          "circle-color": "#6366f1",
          "circle-opacity": 0.25,
          "circle-blur": 1,
        },
      });

      m.addLayer({
        id: "project-dot",
        type: "circle",
        source: "projects",
        paint: {
          "circle-radius": 4.5,
          "circle-color": "#818cf8",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      m.on("click", "project-dot", (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.id as string | undefined;
        const project = PROJECTS.find((p) => p.id === id);
        if (!project) return;
        flyToProject(project);
      });

      m.on("mouseenter", "project-dot", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "project-dot", () => (m.getCanvas().style.cursor = ""));

      m.addSource("boundary-draw", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "boundary-draw-fill",
        type: "fill",
        source: "boundary-draw",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#818cf8", "fill-opacity": 0.2 },
      });
      m.addLayer({
        id: "boundary-draw-line",
        type: "line",
        source: "boundary-draw",
        filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]],
        paint: { "line-color": "#818cf8", "line-width": 2 },
      });
      m.addLayer({
        id: "boundary-draw-points",
        type: "circle",
        source: "boundary-draw",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-width": 2, "circle-stroke-color": "#6366f1" },
      });

      m.on("click", (e) => {
        if (!drawModeRef.current) return;
        const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const next = [...drawPointsRef.current, pt];
        drawPointsRef.current = next;
        setDrawPoints(next);
        renderBoundaryDraw(next);
      });

      setLoaded(true);
      setMapInstance(m);
    });

    // slow idle spin until the user interacts or navigates
    m.on("mousedown", () => (spinning.current = false));
    m.on("dragstart", () => (spinning.current = false));
    let rafId: number;
    const spin = () => {
      if (spinning.current && !m.isMoving() && m.getZoom() < 3) {
        const c = m.getCenter();
        m.easeTo({ center: [c.lng + 0.25, c.lat], duration: 100, easing: (n) => n });
      }
      rafId = requestAnimationFrame(spin);
    };
    rafId = requestAnimationFrame(spin);

    map.current = m;
    return () => {
      cancelAnimationFrame(rafId);
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount; handlers read map.current fresh at call time
  }, []);

  const filteredCountries = COUNTRIES.map((c) => ({
    ...c,
    projects: c.projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
  })).filter((c) => query === "" || c.projects.length > 0);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0a0c14] text-zinc-100">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#11131f] px-5">
        <h1 className="text-sm font-medium tracking-wide text-zinc-300">Global Portfolio Map</h1>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="z-10 flex w-72 shrink-0 flex-col border-r border-white/10 bg-[#11131f]/95 backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-500/20 text-xs font-bold text-indigo-300">
                DP
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-100">
                  Global Portfolio
                </div>
                <div className="text-[10px] text-zinc-500">DP Productions Interactive</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 border-b border-white/10 px-4 py-3 text-[11px]">
            <span className="mr-1 text-zinc-500">Select Region</span>
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={`rounded px-2 py-1 transition-colors ${
                  region === r ? "bg-indigo-500/20 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold">Projects</span>
            <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
              {PROJECTS.length} active
            </span>
          </div>

          <div className="px-4 pb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects or cities..."
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-400/50"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-2">
            {filteredCountries.map(({ country, countryCode, projects }) => (
              <div key={country} className="mb-1">
                <button
                  onClick={() => setExpanded(expanded === country ? null : country)}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-white/5"
                >
                  <span className="flex h-5 w-6 items-center justify-center rounded bg-white/10 text-[9px] font-bold text-zinc-400">
                    {countryCode}
                  </span>
                  <span className="flex-1 text-xs font-semibold text-zinc-200">{country}</span>
                  <span className="text-[10px] text-zinc-500">{projects.length}</span>
                </button>
                {expanded === country && (
                  <div className="ml-8 border-l border-white/10 pl-2">
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => flyToProject(p)}
                        className="block w-full truncate rounded px-2 py-1.5 text-left text-[11px] text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-[10px] text-zinc-500">
            <span className="uppercase tracking-wide">Total Coverage</span>
            <span className="text-sm font-semibold text-zinc-200">1,240,000 m²</span>
          </div>
        </aside>

        {/* Map */}
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0">
            <div ref={mapContainer} className="h-full w-full" />
          </div>

          {!MAPBOX_TOKEN && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0c14] p-8 text-center">
              <div className="max-w-sm text-sm text-zinc-400">
                <p className="mb-2 font-medium text-zinc-200">Mapbox token missing</p>
                <p>
                  Add <code className="rounded bg-white/10 px-1 py-0.5 text-xs">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to{" "}
                  <code className="rounded bg-white/10 px-1 py-0.5 text-xs">.env.local</code> to load the globe.
                </p>
              </div>
            </div>
          )}

          {MAPBOX_TOKEN && !loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0c14]">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
            </div>
          )}

          {/* Zoom / projection controls */}
          <div className="absolute right-4 top-4 flex flex-col gap-1 rounded-lg border border-white/10 bg-[#11131f]/90 p-1 backdrop-blur">
            <button
              onClick={() => map.current?.zoomIn({ duration: 400 })}
              className="flex h-8 w-8 items-center justify-center rounded text-lg text-zinc-300 hover:bg-white/10"
            >
              +
            </button>
            <button
              onClick={() => map.current?.zoomOut({ duration: 400 })}
              className="flex h-8 w-8 items-center justify-center rounded text-lg text-zinc-300 hover:bg-white/10"
            >
              −
            </button>
            <div className="my-0.5 h-px bg-white/10" />
            <button
              onClick={toggleProjection}
              title="Toggle globe / flat"
              className={`flex h-8 w-8 items-center justify-center rounded text-sm hover:bg-white/10 ${
                projection === "globe" ? "bg-indigo-500 text-white" : "text-zinc-300"
              }`}
            >
              ⊙
            </button>
            <button
              onClick={() => {
                setSelectedProject(null);
                setCompareOpen(false);
                setMediaOpen(false);
                removeMasterplanLayer();
                removeLagoonLayer();
                removeImageMasterplan();
                clearBoundary();
                setDrawMode(false);
                drawModeRef.current = false;
                map.current?.flyTo({ center: [35, 26], zoom: 1.6, pitch: 0, duration: 1800 });
              }}
              title="Reset view"
              className="flex h-8 w-8 items-center justify-center rounded text-sm text-zinc-300 hover:bg-white/10"
            >
              ⤢
            </button>
          </div>

          {/* On-map before/after overlay */}
          {selectedProject?.timeline && compareOpen && mapInstance && (
            <MapCompareOverlay
              map={mapInstance}
              bounds={boundsAround(selectedProject.lng, selectedProject.lat, 300)}
              beforeImage={selectedProject.timeline[0].image}
              beforeLabel={selectedProject.timeline[0].label}
              afterImage={selectedProject.timeline[compareIndex].image}
              afterLabel={selectedProject.timeline[compareIndex].label}
            />
          )}

          {/* Drawing toolbar */}
          {selectedProject && drawMode && (
            <div className="absolute inset-x-4 bottom-4 z-10 max-w-xl rounded-lg border border-white/10 bg-[#11131f]/95 p-3 backdrop-blur sm:mx-auto">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-zinc-300">
                  Click the map to trace {selectedProject.name}&apos;s boundary — {drawPoints.length} point
                  {drawPoints.length === 1 ? "" : "s"}
                  {drawPoints.length < 3 && <span className="text-zinc-500"> (need 3+)</span>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={undoDrawPoint}
                    disabled={drawPoints.length === 0}
                    className="rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-200 disabled:opacity-30"
                  >
                    Undo
                  </button>
                  <button
                    onClick={cancelDrawing}
                    className="rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => finishDrawing(selectedProject)}
                    disabled={drawPoints.length < 3}
                    className="rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400 disabled:opacity-30"
                  >
                    Finish
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Selected project control bar */}
          {selectedProject && !drawMode && (
            <div className="absolute inset-x-4 bottom-4 z-10 max-w-xl rounded-lg border border-white/10 bg-[#11131f]/95 p-3 backdrop-blur sm:mx-auto">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-100">{selectedProject.name}</div>
                  {compareOpen && (
                    <div className="truncate text-[11px] text-zinc-500">Drag the handle on the map to compare</div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedProject.timeline &&
                    (compareOpen ? (
                      <button
                        onClick={() => exitCompare(selectedProject)}
                        className="rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
                      >
                        Exit Compare
                      </button>
                    ) : (
                      <button
                        onClick={() => enterCompare(selectedProject)}
                        className="rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/20"
                      >
                        Compare
                      </button>
                    ))}

                  {selectedProject.masterplanImage &&
                    (imageMasterplanOpen ? (
                      <button
                        onClick={() => removeImageMasterplan()}
                        className="rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
                      >
                        Exit Masterplan
                      </button>
                    ) : (
                      <button
                        onClick={() => enterImageMasterplan(selectedProject)}
                        className="rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/20"
                      >
                        Masterplan
                      </button>
                    ))}

                  {masterplan3DOpen ? (
                    <button
                      onClick={() => removeMasterplanLayer()}
                      className="rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
                    >
                      Exit 3D
                    </button>
                  ) : (
                    <button
                      onClick={() => enterMasterplan3D(selectedProject)}
                      className="rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/20"
                    >
                      3D Masterplan
                    </button>
                  )}

                  {selectedProject.lagoonModel &&
                    (lagoon3DOpen ? (
                      <button
                        onClick={() => removeLagoonLayer()}
                        className="rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
                      >
                        Exit Lagoon
                      </button>
                    ) : (
                      <button
                        onClick={() => enterLagoon3D(selectedProject)}
                        className="rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/20"
                      >
                        3D Lagoon
                      </button>
                    ))}

                  {selectedProject.media && (
                    <button
                      onClick={() => setMediaOpen(true)}
                      className="rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/20"
                    >
                      Media
                    </button>
                  )}

                  {selectedProject.boundaryPolygon && (
                    <button
                      onClick={() => loadOfficialBoundary(selectedProject)}
                      className="rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/20"
                    >
                      Use Site Boundary
                    </button>
                  )}

                  {(selectedProject.model || selectedProject.masterplanImage) && (
                    <button
                      onClick={() => startDrawing(selectedProject)}
                      className="rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/20"
                    >
                      Draw Boundary
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setSelectedProject(null);
                      setCompareOpen(false);
                      removeMasterplanLayer();
                      removeLagoonLayer();
                      removeImageMasterplan();
                      clearBoundary();
                      map.current?.dragRotate.enable();
                      map.current?.touchZoomRotate.enableRotation();
                    }}
                    className="rounded px-2 py-1.5 text-xs text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                  >
                    Close
                  </button>
                </div>
              </div>

              {compareOpen && selectedProject.timeline && (
                <div className="relative mt-4 px-2">
                  <div className="absolute left-2 right-2 top-[7px] h-px bg-white/15" />
                  <div className="relative flex items-start justify-between">
                    {selectedProject.timeline.map((t, i) => (
                      <button
                        key={t.date}
                        onClick={() => setCompareIndex(i)}
                        className="group flex flex-col items-center gap-1.5"
                        style={{ width: `${100 / selectedProject.timeline!.length}%` }}
                      >
                        <span
                          className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${
                            i === compareIndex
                              ? "border-indigo-400 bg-indigo-500"
                              : "border-white/30 bg-[#11131f] group-hover:border-white/60"
                          }`}
                        />
                        <span
                          className={`text-center text-[10px] font-medium leading-tight ${
                            i === compareIndex ? "text-indigo-300" : "text-zinc-500 group-hover:text-zinc-300"
                          }`}
                        >
                          {formatTimelineDate(t.date)}
                        </span>
                        <span className="hidden text-center text-[9px] text-zinc-600 sm:block">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Calibration panel — live-adjust the masterplan against the satellite imagery */}
          {selectedProject && (masterplan3DOpen || lagoon3DOpen || imageMasterplanOpen || boundaryResult) && (
            <div className="absolute left-4 top-4 z-10 w-60 rounded-lg border border-white/10 bg-[#11131f]/95 p-3 text-xs backdrop-blur">
              {boundaryResult && (
                <div className={masterplan3DOpen || imageMasterplanOpen ? "mb-3 border-b border-white/10 pb-3" : ""}>
                  <div className="mb-2 font-semibold text-zinc-200">Boundary captured</div>
                  <div className="mb-2 text-zinc-400">
                    {Math.round(boundaryResult.rect.width)}m × {Math.round(boundaryResult.rect.height)}m, rotation{" "}
                    {Math.round(boundaryResult.rect.angleDeg)}°
                  </div>
                  <div className="space-y-1.5">
                    {selectedProject.model && (
                      <button
                        onClick={() => applyBoundaryTo3D(selectedProject)}
                        className="w-full rounded bg-white/10 px-2 py-1.5 text-left text-[11px] font-medium text-zinc-200 hover:bg-white/20"
                      >
                        Apply to 3D Model{modelFootprint ? "" : " (scale needs model loaded)"}
                      </button>
                    )}
                    {selectedProject.masterplanImage && (
                      <button
                        onClick={() => applyBoundaryToImage(selectedProject)}
                        className="w-full rounded bg-white/10 px-2 py-1.5 text-left text-[11px] font-medium text-zinc-200 hover:bg-white/20"
                      >
                        Apply to Masterplan Image
                      </button>
                    )}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(
                            `boundary: ${JSON.stringify(drawPoints)},`
                          )
                        }
                        className="flex-1 rounded bg-white/10 px-2 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-white/20"
                      >
                        Copy polygon
                      </button>
                      <button
                        onClick={clearBoundary}
                        className="rounded px-2 py-1.5 text-[11px] text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {masterplan3DOpen && (
                <div className={lagoon3DOpen || imageMasterplanOpen ? "mb-3 border-b border-white/10 pb-3" : ""}>
                  <div className="mb-2 font-semibold text-zinc-200">Calibrate 3D Masterplan</div>
                  <div className="space-y-2">
                  <CalibrationField
                    label="Offset E (m)"
                    value={calib3D.offsetE}
                    step={1}
                    onChange={(v) => updateCalib3D({ ...calib3D, offsetE: v })}
                  />
                  <CalibrationField
                    label="Offset N (m)"
                    value={calib3D.offsetN}
                    step={1}
                    onChange={(v) => updateCalib3D({ ...calib3D, offsetN: v })}
                  />
                  <CalibrationField
                    label="Offset Up (m)"
                    value={calib3D.offsetUp}
                    step={1}
                    onChange={(v) => updateCalib3D({ ...calib3D, offsetUp: v })}
                  />
                  <CalibrationField
                    label="Rotation (°)"
                    value={calib3D.rotationDeg}
                    step={1}
                    onChange={(v) => updateCalib3D({ ...calib3D, rotationDeg: v })}
                  />
                  <CalibrationField
                    label="Scale"
                    value={calib3D.scale}
                    step={0.01}
                    onChange={(v) => updateCalib3D({ ...calib3D, scale: v })}
                  />
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `modelCalibration: ${JSON.stringify(calib3D)},`
                      )
                    }
                    className="mt-1 w-full rounded bg-white/10 px-2 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-white/20"
                  >
                    Copy config
                  </button>
                  </div>
                </div>
              )}

              {lagoon3DOpen && (
                <div className={imageMasterplanOpen ? "mb-3 border-b border-white/10 pb-3" : ""}>
                  <div className="mb-2 font-semibold text-zinc-200">Calibrate 3D Lagoon</div>
                  <div className="space-y-2">
                    <CalibrationField
                      label="Offset E (m)"
                      value={calibLagoon.offsetE}
                      step={1}
                      onChange={(v) => updateCalibLagoon({ ...calibLagoon, offsetE: v })}
                    />
                    <CalibrationField
                      label="Offset N (m)"
                      value={calibLagoon.offsetN}
                      step={1}
                      onChange={(v) => updateCalibLagoon({ ...calibLagoon, offsetN: v })}
                    />
                    <CalibrationField
                      label="Offset Up (m)"
                      value={calibLagoon.offsetUp}
                      step={1}
                      onChange={(v) => updateCalibLagoon({ ...calibLagoon, offsetUp: v })}
                    />
                    <CalibrationField
                      label="Rotation (°)"
                      value={calibLagoon.rotationDeg}
                      step={1}
                      onChange={(v) => updateCalibLagoon({ ...calibLagoon, rotationDeg: v })}
                    />
                    <CalibrationField
                      label="Scale"
                      value={calibLagoon.scale}
                      step={0.01}
                      onChange={(v) => updateCalibLagoon({ ...calibLagoon, scale: v })}
                    />
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(`lagoonCalibration: ${JSON.stringify(calibLagoon)},`)
                      }
                      className="mt-1 w-full rounded bg-white/10 px-2 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-white/20"
                    >
                      Copy config
                    </button>
                  </div>
                </div>
              )}

              {imageMasterplanOpen && (
                <div className="space-y-2">
                  <CalibrationField
                    label="Width (m)"
                    value={calibImage.widthMeters}
                    step={10}
                    onChange={(v) => updateCalibImage(selectedProject, { ...calibImage, widthMeters: v })}
                  />
                  <CalibrationField
                    label="Height (m)"
                    value={calibImage.heightMeters}
                    step={10}
                    onChange={(v) => updateCalibImage(selectedProject, { ...calibImage, heightMeters: v })}
                  />
                  <CalibrationField
                    label="Offset E (m)"
                    value={calibImage.offsetE}
                    step={1}
                    onChange={(v) => updateCalibImage(selectedProject, { ...calibImage, offsetE: v })}
                  />
                  <CalibrationField
                    label="Offset N (m)"
                    value={calibImage.offsetN}
                    step={1}
                    onChange={(v) => updateCalibImage(selectedProject, { ...calibImage, offsetN: v })}
                  />
                  <CalibrationField
                    label="Rotation (°)"
                    value={calibImage.rotationDeg}
                    step={1}
                    onChange={(v) => updateCalibImage(selectedProject, { ...calibImage, rotationDeg: v })}
                  />
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `masterplanImage: { url: "...", params: ${JSON.stringify(calibImage)} },`
                      )
                    }
                    className="mt-1 w-full rounded bg-white/10 px-2 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-white/20"
                  >
                    Copy config
                  </button>
                </div>
              )}
            </div>
          )}

          {mediaOpen && selectedProject?.media && (
            <MediaModal
              projectName={selectedProject.name}
              photos={selectedProject.media.photos}
              videos={selectedProject.media.videos}
              onClose={() => setMediaOpen(false)}
            />
          )}

          {/* Footer status bar */}
          <div className="absolute bottom-4 right-4 flex items-center gap-3 rounded-lg border border-white/10 bg-[#11131f]/90 px-3 py-2 text-[10px] text-zinc-500 backdrop-blur">
            <span className={webgl === "unsupported" ? "text-red-400" : ""}>
              {webgl === "webgl2" && "WebGL 2.0 Ready"}
              {webgl === "webgl1" && "WebGL 1.0 (no WebGL2)"}
              {webgl === "unsupported" && "WebGL unsupported"}
              {webgl === null && "Checking WebGL..."}
            </span>
            <span className="text-zinc-700">|</span>
            <span className="font-medium text-zinc-300">DP Interactive</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalibrationField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-zinc-400">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded border border-white/10 bg-white/5 px-1.5 py-1 text-right text-zinc-100 outline-none focus:border-indigo-400/50"
      />
    </label>
  );
}

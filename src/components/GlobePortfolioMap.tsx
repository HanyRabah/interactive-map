"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapCompareOverlay, { boundsAround } from "./MapCompareOverlay";
import MediaModal from "./MediaModal";
import { createMasterplanLayer, type MasterplanLayer, type MasterplanParams, DEFAULT_MASTERPLAN_PARAMS } from "./MasterplanLayer";
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

function formatTimelineDate(date: string) {
  if (date === "planned") return "Planned";
  const [y, m] = date.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = Number(m) - 1;
  return m && months[mi] ? `${months[mi]} ${y}` : date;
}

// Project type + catalog data moved to @/data/projects (a zero-runtime-dependency module)
// so server code — the /api/projects catalog routes — can import them without pulling in
// this "use client" component and its mapbox-gl CSS import. Re-exported here so existing
// consumers (ZoyaShowcase, /portfolio) keep their import paths.
import { PROJECTS, type Project } from "@/data/projects";
export { PROJECTS };
export type { Project };

// Every in-repo project carries coordinates; narrowing once here keeps all the map math
// below free of per-use undefined checks (CMS projects CAN omit coords, but this admin
// view reads only the in-repo array).
type PinnedProject = Project & { lng: number; lat: number };
const MAP_PROJECTS = PROJECTS as PinnedProject[];


const COUNTRIES = Array.from(new Set(MAP_PROJECTS.map((p) => p.country))).map((country) => {
  const sample = MAP_PROJECTS.find((p) => p.country === country)!;
  return {
    country,
    countryCode: sample.countryCode,
    projects: MAP_PROJECTS.filter((p) => p.country === country),
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
  const [selectedProject, setSelectedProject] = useState<PinnedProject | null>(null);
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

  function flyToProject(p: PinnedProject) {
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

  function enterMasterplan3D(p: PinnedProject) {
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
  function enterLagoon3D(p: PinnedProject) {
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

  function enterImageMasterplan(p: PinnedProject) {
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

  function updateCalibImage(p: PinnedProject, next: ImageMasterplanParams) {
    const m = map.current;
    setCalibImage(next);
    if (m && imageMasterplanId.current) updateImageMasterplanLayer(m, imageMasterplanId.current, p.lng, p.lat, next);
  }

  function enterCompare(p: PinnedProject) {
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

  function exitCompare(p: PinnedProject) {
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

  function startDrawing(p: PinnedProject) {
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

  function computeBoundaryResult(p: PinnedProject, points: [number, number][]) {
    const meterPts = points.map(([lng, lat]) => lngLatToMeters(lng, lat, p.lng, p.lat));
    const rect = minAreaRect(meterPts);
    // rect.center (the rotating-calipers rectangle's own center) anchors the fitted
    // shape better than a plain vertex average, which skews toward denser corners.
    setBoundaryResult({ rect, centroidMeters: rect.center });
  }

  function finishDrawing(p: PinnedProject) {
    const pts = drawPointsRef.current;
    if (pts.length < 3) return;
    computeBoundaryResult(p, pts);
    setDrawMode(false);
    drawModeRef.current = false;
    map.current?.dragRotate.enable();
    map.current?.touchZoomRotate.enableRotation();
  }

  function loadOfficialBoundary(p: PinnedProject) {
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

  async function applyBoundaryToImage(p: PinnedProject) {
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

  function applyBoundaryTo3D(p: PinnedProject) {
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
          features: MAP_PROJECTS.map((p) => ({
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
        const project = MAP_PROJECTS.find((p) => p.id === id);
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
              {MAP_PROJECTS.length} active
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

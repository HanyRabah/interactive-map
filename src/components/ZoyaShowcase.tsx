"use client";

/*
THESIS: The terrain itself is the living canvas — real aerial imagery, water, and
  atmosphere carried by GPU shaders, not decoration layered on a static map; refuses
  the flat-glass PropTech-dashboard default.
OWN-WORLD: Deep teal-black ground, LMD's real monochrome wordmark for brand entrance,
  one incandescent teal accent (Zoya's own campaign color, not invented) for hovers;
  oversized Geist Sans hero word against tiny tracked-out Geist Mono margin labels held
  in solid cards, never bare text over live terrain; a cursor-reactive shader glint and
  day-to-night sun sweep live on the real Mapbox/Three.js terrain and 3D masterplan.
STORY: A developer watches LMD's own mark resolve into a real coastline that breathes —
  light shifts, the field warps toward the cursor — then selects a real building in the
  masterplan and trusts DP to sell this vision to buyers, with the rest of LMD's real
  portfolio one switch away.
FIRST VIEWPORT: LMD wordmark on black, cross-fading into the globe; a plain black/white
  "Start the Journey" pill replaces any invented wordmark over the globe itself.
FORM: WebGL Shader Portal (challenger, user-picked over the assigned Coastal Travel
  Editorial direction), seed key f7cfe282, retinted to LMD/Zoya's real brand on request.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
  review, the verdict, and DESIGN.md.
*/

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  createMasterplanLayer,
  type MasterplanLayer,
  type MasterplanBuilding,
  type MasterplanParams,
} from "./MasterplanLayer";
import { createAtmosphereLayer, type AtmosphereLayer } from "./AtmosphereLayer";
import { PROJECTS } from "./GlobePortfolioMap";
import { ZoyaAsset } from "./ZoyaAsset";
import { ZOYA_HERO_VIDEO, ZOYA_AERIAL_PHOTOS, ZOYA_AERIAL_DIR } from "@/data/zoyaMedia";
import { LMD_PROJECTS, type LmdProjectStub } from "@/data/lmdProjects";

const ZOYA = PROJECTS.find((p) => p.id === "zoya-ghazala-bay")!;
const CALIB: MasterplanParams = ZOYA.modelCalibration ?? { scale: 1, rotationDeg: 0, offsetE: 0, offsetN: 0, offsetUp: 0 };

// Zoya's own campaign color (LMD's real embroidered "ZOYA" wordmark, lmd.com.eg/en) — not
// an invented accent. LMD's own brand mark is plain black/white; this teal is Zoya-specific.
const ACCENT = "#1c93a0";

const COUNTRIES_ORDER = ["Egypt", "UAE", "Spain", "Greece"] as const;

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
const HERO_CENTER: [number, number] = [ZOYA.lng, ZOYA.lat];
// Lower pitch than a typical "cinematic" establishing shot on purpose: at this specific
// coastal anchor point, a steep pitch put most of the frame over open sea/sky instead of
// the actual textured coastline — verified by screenshot, not assumed.
const HERO_VIEW = { zoom: 14.1, pitch: 42, bearing: -12 };
const MASTERPLAN_VIEW = { zoom: 17.2, pitch: 58, bearing: -20 };

// The same real-coordinate flight Zoya gets, generalized to every other LMD project — no
// hand-tuned per-site pitch/bearing exists for these (that took a screenshot-verified pass
// for Zoya alone), so they share one reasonable angle. Zoom is capped by how precise the
// coordinate actually is (see LmdProjectStub.precision) so a city-level guess doesn't zoom
// in and claim a precision the data doesn't have.
const GENERIC_HERO_VIEW = { pitch: 42, bearing: -12 };
const HERO_ZOOM_BY_PRECISION: Record<NonNullable<LmdProjectStub["precision"]>, number> = {
  exact: 15.5,
  district: 13.5,
  city: 11.5,
};

// No real aerial photography exists yet for any project but Zoya (see zoyaMedia.ts's own
// "drop real files in, they replace this automatically" pattern — same idea, just inline
// since there's no per-project media manifest yet). These are deliberately abstract
// gradient swatches with a caption, not an attempt to pass as a real photo.
function placeholderPhoto(seed: string, label: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const from = `hsl(${hue}, 40%, 20%)`;
  const to = `hsl(${(hue + 45) % 360}, 55%, 36%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="320" height="220" fill="url(#g)"/>
    <text x="160" y="115" font-family="sans-serif" font-size="14" fill="white" text-anchor="middle" opacity="0.85">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

type Stage = "logo" | "split" | "focus" | "flight" | "hero" | "masterplan" | "comingsoon";

const PINNED_PROJECTS = LMD_PROJECTS.filter(
  (p): p is LmdProjectStub & { lngLat: [number, number] } => !!p.lngLat,
);

// Rest-state padding, as a fraction of viewport width, for the split layout — pulls the
// globe and the logo panel in toward the shared center line instead of each sitting
// centered in its own half (which left a dead gap between two disconnected "islands").
const SPLIT_PADDING_FRACTION = 0.32;

// Ambient starfield: each star sits at a fixed final position and never itself moves — only
// its `.lmd-star-tail` animates, shrinking away like a comet settling into a point. Faster
// (900ms + stagger) than the globe's own ~3.8s arrival, generated once at module load.
const SKY_STARS = Array.from({ length: 90 }, () => ({
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 1 + Math.random() * 2,
  opacity: 0.35 + Math.random() * 0.65,
  angle: Math.random() * 360,
  tailLen: 14 + Math.random() * 22,
  delay: Math.random() * 400,
}));

// Mirrors MasterplanLayer's render() transform exactly (holder R/S/T, then the fixed
// RotateX90 + mercator scale + anchor translate) and hands off to Mapbox's own
// MercatorCoordinate for the final projection — a hand-rolled linear lat/lng approximation
// got the sign wrong here (Mercator Y increases southward; a naive "north = +z" flip placed
// every building marker off-screen, which is why none showed up in testing).
function buildingToLngLat(b: MasterplanBuilding, calib: MasterplanParams, anchorLng: number, anchorLat: number): [number, number] {
  const modelTransform = mapboxgl.MercatorCoordinate.fromLngLat([anchorLng, anchorLat], 0);
  const mercatorScale = modelTransform.meterInMercatorCoordinateUnits();
  const rad = (calib.rotationDeg * Math.PI) / 180;
  const bx = b.localCenter[0] * calib.scale;
  const by = b.localCenter[1] * calib.scale;
  const bz = b.localCenter[2] * calib.scale;
  const x1 = bx * Math.cos(rad) + bz * Math.sin(rad) + calib.offsetE;
  const y1 = by + calib.offsetUp;
  const z1 = -bx * Math.sin(rad) + bz * Math.cos(rad) + calib.offsetN;
  const mercatorX = modelTransform.x + x1 * mercatorScale;
  const mercatorY = modelTransform.y + z1 * mercatorScale;
  const mercatorZ = (modelTransform.z ?? 0) + y1 * mercatorScale;
  const ll = new mapboxgl.MercatorCoordinate(mercatorX, mercatorY, mercatorZ).toLngLat();
  return [ll.lng, ll.lat];
}

function cleanBuildingName(raw: string) {
  return raw.replace(/^vrayproxy_?/i, "").replace(/_/g, " ").trim() || raw;
}

// Module-level (not component-scoped) so Math.random stays clearly outside any render path —
// only ever called from the decrypt-reveal hook below, which itself only ever runs from a click.
function shuffledIndices(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function randomGlyph(): string {
  return SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];
}

// Shared decrypt-style reveal: any letter/digit in `target` locks in in random order (not
// left-to-right) while still-unresolved ones flicker through random glyphs; everything else
// (spaces, punctuation, °) shows immediately. Used for both the project title and its lat/lng
// so any text that needs to "arrive" uses the same one animation instead of two different ones.
function useScrambleReveal(target: string, resetKey: unknown): string {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!target) return;
    const order = shuffledIndices(target.length);
    const revealed = new Array(target.length).fill(false);
    let step = 0;
    const iv = window.setInterval(() => {
      revealed[order[step]] = true;
      step++;
      setText(target.split("").map((ch, i) => (revealed[i] || !/[a-zA-Z0-9]/.test(ch) ? ch : randomGlyph())).join(""));
      if (step >= order.length) window.clearInterval(iv);
    }, 55);
    return () => {
      window.clearInterval(iv);
      setText("");
    };
  }, [target, resetKey]);
  return text;
}

function fogFor(t: number) {
  // t: 0 night .. 1 midday — interpolated between two hand-tuned presets, not a generic default.
  const day = { color: "rgb(226, 238, 245)", high: "rgb(120, 160, 200)", space: "rgb(8, 12, 24)", star: 0 };
  const night = { color: "rgb(20, 24, 38)", high: "rgb(36, 44, 74)", space: "rgb(4, 6, 14)", star: 0.5 };
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const parse = (s: string) => s.match(/\d+/g)!.map(Number);
  const c = (a: string, b: string) => {
    const [ar, ag, ab] = parse(a);
    const [br, bg, bb] = parse(b);
    return `rgb(${mix(ar, br)}, ${mix(ag, bg)}, ${mix(ab, bb)})`;
  };
  return {
    color: c(night.color, day.color),
    "high-color": c(night.high, day.high),
    "horizon-blend": 0.04,
    "space-color": c(night.space, day.space),
    "star-intensity": night.star + (day.star - night.star) * t,
  };
}

// The default sunElevation (85, near-midday) drives star-intensity to ~0.03 via fogFor —
// which is why the intro/split/focus/coords scenes read as flat dark teal instead of real
// space. Those stages aren't showing a time-of-day at all, so they get their own fixed,
// deliberately starry preset instead of inheriting the hero day/night slider's default.
function introFog() {
  return { ...fogFor(0), "star-intensity": 1 };
}

// Real NASA GIBS imagery (VIIRS Black Marble / City Lights 2012), not a fabricated night
// texture — public tile service, no key required. Native max zoom is 8, well past anything
// the intro/split/focus/coords stages ever reach.
const BLACK_MARBLE_TILE_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg";
const BLACK_MARBLE_LAYER_ID = "black-marble";

export default function ZoyaShowcase() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const spinning = useRef(true);
  const atmosphere = useRef<AtmosphereLayer | null>(null);
  const atmosphereTarget = useRef(0);
  const atmosphereCurrent = useRef(0);
  const masterplanLayer = useRef<MasterplanLayer | null>(null);

  const [stage, setStage] = useState<Stage>("logo");
  const stageRef = useRef<Stage>("logo");
  const [logoVisible, setLogoVisible] = useState(false);
  const advancingRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [heroVideoFailed, setHeroVideoFailed] = useState(false);
  const [heroVideoVisible, setHeroVideoVisible] = useState(false);
  const [sunElevation, setSunElevation] = useState(85);
  const [buildings, setBuildings] = useState<{ name: string; lngLat: [number, number] }[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherNotice, setSwitcherNotice] = useState<string | null>(null);
  const [masterplanLoading, setMasterplanLoading] = useState(false);
  const [masterplanProgress, setMasterplanProgress] = useState(0);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  // Pin markers are plain DOM elements created once (see createPins, called only from
  // m.once("moveend", ...)) with a vanilla addEventListener — their click closure is never
  // recreated, so reading `stage`/`selectedPinId` directly inside it would always see the
  // values from that one-time creation render (both still "split"/null), permanently
  // breaking the same-pin-toggles-off behavior. selectPin reads stageRef (already kept in
  // sync elsewhere) and this ref instead of the reactive state.
  const selectedPinIdRef = useRef<string | null>(null);
  const pinMarkers = useRef<Map<string, { marker: mapboxgl.Marker; el: HTMLDivElement }>>(new Map());
  // Boolean, not raw zoom — the map fires "zoom" on every frame of every easeTo/flyTo, and
  // storing the raw number would re-render the whole component at 60fps during every
  // choreographed camera move. Only setState when the threshold is actually crossed.
  const [logoZoomHidden, setLogoZoomHidden] = useState(false);
  const logoZoomHiddenRef = useRef(false);
  // Night (real NASA night-lights + stars) vs day (normal daylit satellite) for the
  // split/focus scenes only — independent of the hero-stage sunElevation slider.
  const [introNight, setIntroNight] = useState(true);
  const [focusPanelVisible, setFocusPanelVisible] = useState(false);
  const [focusPanelMounted, setFocusPanelMounted] = useState(false);

  const selectedProject = selectedPinId === "zoya" ? { name: "Zoya", country: "Egypt" } : LMD_PROJECTS.find((p) => p.id === selectedPinId);
  const selectedLngLat: [number, number] | undefined =
    selectedPinId === "zoya" ? [ZOYA.lng, ZOYA.lat] : LMD_PROJECTS.find((p) => p.id === selectedPinId)?.lngLat;
  const selectedCoordsTarget = selectedLngLat
    ? `${Math.abs(selectedLngLat[1]).toFixed(4)}°${selectedLngLat[1] >= 0 ? "N" : "S"}, ${Math.abs(selectedLngLat[0]).toFixed(4)}°${selectedLngLat[0] >= 0 ? "E" : "W"}`
    : "";
  const revealedName = useScrambleReveal(selectedProject?.name ?? "", selectedPinId);
  const revealedCoords = useScrambleReveal(selectedCoordsTarget, selectedPinId);

  // The logo+slogan stay mounted for the whole session — the spec calls for them to
  // *move*, never to vanish, so this docks left instead of unmounting.
  function advanceFromLogo() {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setStage("split");
  }

  function selectPin(id: string) {
    // Reads refs, not the reactive `selectedPinId`/`stage` above: this is called from a
    // vanilla addEventListener attached once in createPins (see selectedPinIdRef's comment),
    // so a closure over the reactive values would always see them as they were at pin
    // creation time (null/"split") and same-pin-click-to-deselect would silently never fire.
    if (selectedPinIdRef.current === id && stageRef.current === "focus") {
      // toggle off: mirrors the split <-> focus transition back to its start state.
      // selectedPinId itself is cleared later, by the focus-panel effect below, once its
      // fade-out has actually finished — clearing it here would blank the name/coords
      // (selectedProject/revealedName/revealedCoords all key off it) instantly, leaving an
      // empty panel fading out instead of the real content.
      setStage("split");
      return;
    }
    setSelectedPinId(id);
    setFocusPanelMounted(true);
    if (stageRef.current === "split") setStage("focus");
  }

  function createPins() {
    const m = map.current;
    if (!m || pinMarkers.current.size > 0) return;
    PINNED_PROJECTS.forEach((p, i) => {
      // Four DOM levels on purpose (see globals.css comment above .lmd-pin-pop-wrap):
      // `host` is Mapbox's own positioned element (untouched), `popWrap` carries the
      // one-shot entrance keyframe, `content` carries the dissolve fade + click/hover, and
      // `glow` carries its own continuous pulse — each on a different element so their
      // `transform`/`opacity` changes don't fight over the cascade.
      const host = document.createElement("div");
      const popWrap = document.createElement("div");
      popWrap.className = "lmd-pin-pop-wrap";
      popWrap.style.animationDelay = `${i * 160}ms`;
      const content = document.createElement("div");
      content.className = "lmd-pin";
      content.dataset.projectId = p.id;
      content.addEventListener("click", (e) => {
        e.stopPropagation();
        selectPin(p.id);
      });
      const glow = document.createElement("div");
      glow.className = "lmd-pin-glow";
      const core = document.createElement("div");
      core.className = "lmd-pin-core";
      const label = document.createElement("div");
      label.className = "lmd-pin-label";
      label.textContent = p.name;
      content.append(glow, core, label);
      popWrap.appendChild(content);
      host.appendChild(popWrap);
      const marker = new mapboxgl.Marker({ element: host }).setLngLat(p.lngLat).addTo(m);
      pinMarkers.current.set(p.id, { marker, el: content });
    });
  }

  // Hero/masterplan/flight only ever show the real satellite photo now (no night version of
  // the ground exists at that zoom — see beginFlight). So a journey that starts on the night
  // globe fades the globe itself back to day first, in place, before the camera actually
  // moves — arriving at a day destination while the globe still looked like night was the
  // actual mismatch. `run` is whatever the journey's own flyTo/state changes are; it fires
  // immediately if already in day mode, or after the crossfade (matches the
  // raster-opacity-transition duration set on black-marble in style.load) if not.
  function transitionToDayThenRun(run: () => void) {
    const m = map.current;
    if (!m) return;
    spinning.current = false;
    if (!introNight) {
      run();
      return;
    }
    m.setFog(fogFor(1));
    if (m.getLayer(BLACK_MARBLE_LAYER_ID)) m.setPaintProperty(BLACK_MARBLE_LAYER_ID, "raster-opacity", 0);
    window.setTimeout(run, 1200);
  }

  // The lat/lng reveal now happens as soon as a pin is selected (see the focus-panel effect
  // below), so by the time this fires the coordinates are already on screen — no need for a
  // separate reveal-then-hold step before the camera actually moves.
  function startJourney() {
    if (!selectedPinId) return;
    // Moving forward (not deselecting), so no need to fade the panel out — just drop it,
    // same as it arrived. Without this it stayed mounted (and rendered, uselessly, right on
    // top of the flight/hero view) since nothing else ever clears focusPanelMounted on this
    // path — only the deselect-back-to-split effect above does.
    setFocusPanelVisible(false);
    setFocusPanelMounted(false);
    if (selectedPinId === "zoya") {
      beginFlight();
      return;
    }
    const project = LMD_PROJECTS.find((p) => p.id === selectedPinId);
    const lngLat = project?.lngLat;
    if (!lngLat) return;
    // Same real-coordinate flight Zoya gets (see GENERIC_HERO_VIEW above) — no calibrated
    // 3D masterplan exists for this one yet, so it lands on the honest "comingsoon" panel
    // instead of enterMasterplan, but the journey itself is the real thing.
    const zoom = HERO_ZOOM_BY_PRECISION[project?.precision ?? "city"];
    transitionToDayThenRun(() => {
      atmosphereTarget.current = 0.6;
      map.current?.flyTo({
        center: lngLat,
        zoom,
        pitch: GENERIC_HERO_VIEW.pitch,
        bearing: GENERIC_HERO_VIEW.bearing,
        duration: 3600,
        essential: true,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      });
      window.setTimeout(() => setStage("comingsoon"), 3700);
    });
  }

  // Logo entrance: fade/scale in, hold, then advance to the globe on its own — or skip on click.
  useEffect(() => {
    if (stage !== "logo") return;
    const inTimer = window.setTimeout(() => setLogoVisible(true), 60);
    const advanceTimer = window.setTimeout(advanceFromLogo, 2800);
    return () => {
      window.clearTimeout(inTimer);
      window.clearTimeout(advanceTimer);
    };
  }, [stage]);

  useEffect(() => {
    stageRef.current = stage;
    selectedPinIdRef.current = selectedPinId;
    if (stage !== "hero") return;
    const t = window.setTimeout(() => setHeroVideoVisible(true), 400);
    return () => {
      window.clearTimeout(t);
      setHeroVideoVisible(false);
    };
  }, [stage, selectedPinId]);

  // Sweeps the masterplan lights, the shader tint, and the map fog off one value. No longer
  // user-controlled (the slider is gone) — beginFlight fixes this to a daylit value once,
  // since hero/masterplan only ever show the real day satellite photo now.
  useEffect(() => {
    const t = Math.max(0, Math.min(90, sunElevation)) / 90;
    masterplanLayer.current?.setSunElevation(sunElevation);
    atmosphere.current?.setSunT(t);
    map.current?.setFog(fogFor(t));
  }, [sunElevation]);

  useEffect(() => {
    if (!mapContainer.current || map.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Starts as a near-invisible point centered in the right half (not pinned to the far
    // edge), near-zero zoom — invisible behind the full-screen logo stage — so the first
    // thing the user sees once the logo docks left is the globe growing out of deep space
    // toward the camera, not sliding in from off-screen at a size it already reads as "a globe."
    const startWidth = mapContainer.current.clientWidth || window.innerWidth;
    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      projection: "globe",
      center: [35, 26],
      zoom: -1.3,
      pitch: 0,
      attributionControl: false,
    });
    m.setPadding({ left: startWidth * 0.5, right: 0, top: 0, bottom: 0 });

    m.on("style.load", () => {
      m.setFog(introFog());
      // Real night-lights imagery for the space stages, opaque on top of the base satellite
      // style; opacity drops to 0 in beginFlight() as the real destination comes into frame,
      // cross-fading (via raster-opacity-transition) into the daylit satellite tiles beneath
      // rather than needing a manually-driven fade.
      m.addSource(BLACK_MARBLE_LAYER_ID, {
        type: "raster",
        tiles: [BLACK_MARBLE_TILE_URL],
        tileSize: 256,
        maxzoom: 8,
        attribution: "Imagery: NASA Earth Observatory (VIIRS Black Marble)",
      });
      m.addLayer({
        id: BLACK_MARBLE_LAYER_ID,
        type: "raster",
        source: BLACK_MARBLE_LAYER_ID,
        paint: { "raster-opacity": 1 },
      });
      m.setPaintProperty(BLACK_MARBLE_LAYER_ID, "raster-opacity-transition", { duration: 1200, delay: 0 });
      const atmosphereLayer = createAtmosphereLayer("atmosphere");
      m.addLayer(atmosphereLayer);
      atmosphere.current = atmosphereLayer;
      // Country, ocean/sea, and city names all clutter the globe at this scale and add
      // nothing — only continent names stay. Layer IDs confirmed against the actual
      // satellite-streets-v12 style JSON, not guessed.
      for (const id of [
        "country-label",
        "water-point-label",
        "water-line-label",
        "settlement-major-label",
        "settlement-minor-label",
        "settlement-subdivision-label",
      ]) {
        if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", "none");
      }
      setLoaded(true);
    });

    m.on("mousedown", () => (spinning.current = false));
    m.on("dragstart", () => (spinning.current = false));
    // Scroll/pinch-zoom didn't stop the idle spin before — a user zooming in during "split"
    // would have the globe drifting under them while they tried to look around. "wheel" only
    // ever fires for a real user gesture, never for our own choreographed easeTo/flyTo calls.
    m.on("wheel", () => (spinning.current = false));
    m.on("zoom", () => {
      const hidden = m.getZoom() > 2.3;
      if (hidden !== logoZoomHiddenRef.current) {
        logoZoomHiddenRef.current = hidden;
        setLogoZoomHidden(hidden);
      }
    });

    let rafId: number;
    const tick = () => {
      if (spinning.current && (stageRef.current === "logo" || stageRef.current === "split") && !m.isMoving()) {
        const c = m.getCenter();
        m.easeTo({ center: [c.lng + 0.06, c.lat], duration: 100, easing: (n) => n });
      }
      // ease atmosphere intensity toward its per-stage target every frame
      if (atmosphere.current) {
        atmosphereCurrent.current += (atmosphereTarget.current - atmosphereCurrent.current) * 0.04;
        atmosphere.current.setIntensity(atmosphereCurrent.current);
      }
      // Mapbox only repaints on demand (camera/data changes); the shader's own animation
      // (grain, glint pulse) needs an explicit nudge every frame to stay alive when the
      // camera is otherwise still.
      if (atmosphereCurrent.current > 0.001 || atmosphereTarget.current > 0.001) m.triggerRepaint();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    map.current = m;
    return () => {
      cancelAnimationFrame(rafId);
      m.remove();
      map.current = null;
    };
  }, []);

  // cursor -> shader glint (screen-space, normalized)
  useEffect(() => {
    const el = mapContainer.current;
    if (!el) return;
    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      atmosphere.current?.setMouse(x, y);
    }
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, []);

  // Split-screen choreography: globe eases from its tiny far-right starting padding (set at
  // map creation, above) to a settled rest state pulled in toward the shared center divide —
  // not centered in its own half, which read as two disconnected islands with a dead gap.
  // "focus" now keeps that same right-pulled composition (rather than centering full-width)
  // so the vacated left side can hold the project title/coords/button panel.
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    const w = mapContainer.current?.clientWidth ?? window.innerWidth;
    // These stages have no time-of-day of their own — night gets the fixed starry intro
    // preset (independent of whatever the hero day/night slider last left behind — e.g.
    // returning here from "comingsoon" should restore real space, not a daylit sky); day
    // is a plain toggle to the normal satellite imagery, no stars.
    if (stage === "split" || stage === "focus") {
      if (introNight) {
        m.setFog(introFog());
        if (m.getLayer(BLACK_MARBLE_LAYER_ID)) m.setPaintProperty(BLACK_MARBLE_LAYER_ID, "raster-opacity", 1);
      } else {
        m.setFog(fogFor(1));
        if (m.getLayer(BLACK_MARBLE_LAYER_ID)) m.setPaintProperty(BLACK_MARBLE_LAYER_ID, "raster-opacity", 0);
      }
    }
    if (stage === "split") {
      m.easeTo({
        zoom: 1.6,
        padding: { left: w * SPLIT_PADDING_FRACTION, right: 0, top: 0, bottom: 0 },
        duration: 1600,
        // Standard ease-out cubic: starts moving immediately (no held-still opening beat)
        // and decelerates into rest — reads as quick and deliberate rather than the previous
        // slow-hold-then-rush curve, which is what made the whole entrance feel sluggish.
        easing: (t) => 1 - Math.pow(1 - t, 3),
      });
      // Pins pop in only once the globe itself has fully settled, not while it's still
      // mid-approach — "moveend" fires exactly when this easeTo actually finishes.
      m.once("moveend", () => createPins());
    } else if (stage === "focus") {
      // Mirror of "split": globe moves to the LEFT (padding.right pulls it into the remaining
      // left portion) so the vacated right side can hold the project title/coords/button panel.
      m.easeTo({
        ...(selectedLngLat ? { center: selectedLngLat } : {}),
        zoom: 2.15,
        padding: { left: 0, right: w * SPLIT_PADDING_FRACTION, top: 0, bottom: 0 },
        duration: 1400,
      });
      // The panel (title + coords + button) only fades in once the globe has actually
      // arrived at the zoomed-in framing — showing it earlier, while the camera is still
      // mid-flight, read as arriving ahead of the motion instead of because of it.
      m.once("moveend", () => setFocusPanelVisible(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- createPins reads refs fresh, not a reactive dep
  }, [stage, loaded, selectedPinId, introNight]);

  // Focus-panel exit: entrance is handled above, in the choreography effect's "focus" branch
  // (tied to the actual camera moveend, not a fixed timer). This only handles leaving —
  // fading the panel back out on deselect before actually unmounting it, so it can't just
  // vanish. The JSX below is gated on `focusPanelMounted` (set true synchronously in
  // selectPin's click handler, not here — setting it from inside an effect body trips
  // react-hooks/set-state-in-effect), not `stage === "focus"` directly, specifically so it
  // can stay in the DOM for the 500ms fade-out; selectedPinId is also only cleared once that
  // fade finishes, since selectedProject/revealedName/revealedCoords all key off it — clearing
  // it immediately would blank the text while a now-empty card was still fading out.
  useEffect(() => {
    if (stage !== "split" || !selectedPinId) return;
    const hideTimer = window.setTimeout(() => setFocusPanelVisible(false), 0);
    const clearTimer = window.setTimeout(() => {
      setSelectedPinId(null);
      setFocusPanelMounted(false);
    }, 500);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [stage, selectedPinId]);

  // Toggle the selected-pin style without recreating markers (that would replay the pop-in).
  useEffect(() => {
    pinMarkers.current.forEach(({ el }, id) => el.classList.toggle("lmd-pin-selected", id === selectedPinId));
  }, [selectedPinId]);

  // Dissolve every pin once the journey actually starts — no longer needed once we're
  // zooming toward one specific project; comes back if the user lands back on split/focus.
  useEffect(() => {
    const show = stage === "split" || stage === "focus";
    pinMarkers.current.forEach(({ el }) => el.classList.toggle("lmd-pin-hidden", !show));
  }, [stage]);

  // Markers are imperative DOM (mapboxgl.Marker), so they're cleaned up once on unmount
  // rather than through the reactive effect above, which must not re-run per stage change.
  /* eslint-disable react-hooks/exhaustive-deps -- unmount-only cleanup; must read pinMarkers.current fresh here, not a stale snapshot */
  useEffect(() => {
    return () => {
      pinMarkers.current.forEach(({ marker }) => marker.remove());
      pinMarkers.current.clear();
    };
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  function beginFlight() {
    if (!map.current) return;
    setSwitcherOpen(false);
    // The hero/masterplan ground is always the real satellite photo — see
    // transitionToDayThenRun above for why there's no night version of it. sunElevation
    // (still used for the masterplan's own lighting and the fog/atmosphere) is fixed to a
    // daylit value here rather than carried from introNight, to match.
    setSunElevation(85);
    transitionToDayThenRun(() => {
      if (!map.current) return;
      setStage("flight");
      atmosphereTarget.current = 0.6;
      map.current.flyTo({
        center: HERO_CENTER,
        zoom: HERO_VIEW.zoom,
        pitch: HERO_VIEW.pitch,
        bearing: HERO_VIEW.bearing,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
        duration: 4200,
        essential: true,
      });
      window.setTimeout(() => setStage("hero"), 4300);
    });
  }

  function enterMasterplan() {
    const m = map.current;
    if (!m) return;
    atmosphereTarget.current = 0.35;
    m.flyTo({
      center: HERO_CENTER,
      zoom: MASTERPLAN_VIEW.zoom,
      pitch: MASTERPLAN_VIEW.pitch,
      bearing: MASTERPLAN_VIEW.bearing,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      duration: 2400,
    });
    if (!masterplanLayer.current) {
      // ~28MB Draco-compressed GLB — real network+parse time. The camera flying in is
      // motion enough to hide a lot, but on a slow connection it wasn't: nothing else
      // signaled a click had registered, so it read as broken rather than loading.
      setMasterplanLoading(true);
      setMasterplanProgress(0);
      const layer = createMasterplanLayer(
        "zoya-masterplan",
        ZOYA.lng,
        ZOYA.lat,
        0,
        ZOYA.model,
        CALIB,
        (_footprint, real) => {
          const placed = real.map((b) => ({
            name: cleanBuildingName(b.name),
            lngLat: buildingToLngLat(b, CALIB, ZOYA.lng, ZOYA.lat),
          }));
          setBuildings(placed);
          setMasterplanLoading(false);
        },
        (fraction) => setMasterplanProgress(fraction)
      );
      m.addLayer(layer);
      masterplanLayer.current = layer;
      masterplanLayer.current.setSunElevation(sunElevation);
    }
    setStage("masterplan");
  }

  function backToOverview() {
    const m = map.current;
    if (!m) return;
    setSelectedBuilding(null);
    atmosphereTarget.current = 0.6;
    m.flyTo({
      center: HERO_CENTER,
      zoom: HERO_VIEW.zoom,
      pitch: HERO_VIEW.pitch,
      bearing: HERO_VIEW.bearing,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      duration: 2000,
    });
    setStage("hero");
  }

  function goToProject(id: string) {
    setSwitcherOpen(false);
    if (id === "zoya" && stage === "masterplan") {
      backToOverview();
      return;
    }
    const proj = LMD_PROJECTS.find((p) => p.id === id);
    if (!proj?.lngLat) {
      setSwitcherNotice(`${proj?.name ?? "This project"} — full interactive experience coming soon`);
      window.setTimeout(() => setSwitcherNotice(null), 2600);
      return;
    }
    if (stage === "logo") setStage("split");
    selectPin(id);
  }

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded || stage !== "masterplan" || buildings.length === 0) return;
    const sourceId = "zoya-buildings";
    if (!m.getSource(sourceId)) {
      m.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: buildings.map((b) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: b.lngLat },
            properties: { name: b.name },
          })),
        },
      });
      m.addLayer({
        id: "zoya-building-glow",
        type: "circle",
        source: sourceId,
        paint: { "circle-radius": 16, "circle-color": ACCENT, "circle-opacity": 0.2, "circle-blur": 1 },
      });
      m.addLayer({
        id: "zoya-building-dot",
        type: "circle",
        source: sourceId,
        paint: { "circle-radius": 5, "circle-color": ACCENT, "circle-stroke-width": 2, "circle-stroke-color": "#0a1614" },
      });
      m.on("click", "zoya-building-dot", (e) => {
        const name = e.features?.[0]?.properties?.name as string | undefined;
        if (name) setSelectedBuilding(name);
      });
      m.on("mouseenter", "zoya-building-dot", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "zoya-building-dot", () => (m.getCanvas().style.cursor = ""));
    }
    return () => {
      if (m.getLayer("zoya-building-dot")) m.removeLayer("zoya-building-dot");
      if (m.getLayer("zoya-building-glow")) m.removeLayer("zoya-building-glow");
      if (m.getSource(sourceId)) m.removeSource(sourceId);
    };
  }, [loaded, stage, buildings]);

  const showBrandMark = stage !== "logo" && !(stage === "split" && logoZoomHidden);
  const showSwitcherTrigger = stage !== "logo";

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden bg-[#070f0d] font-sans text-[#f5f3ee] ${introNight ? "" : "lmd-day"}`}
    >
      {/* mapbox-gl.css sets .mapboxgl-map { position: relative } on whatever element becomes
          the container — that collides with an "absolute" class at equal specificity and can
          win the cascade, collapsing this to height:0. Wrap it instead of positioning it directly. */}
      <div className="absolute inset-0">
        <div ref={mapContainer} className="h-full w-full" />
      </div>

      {/* Ambient starfield — always mounted (never unmounts, so each star's comet-tail
          keyframe only ever plays once), just faded in/out by stage via this wrapper's own
          opacity. NOT tied to introNight: the stars are the surrounding space, not the
          globe's lighting — the day/night switcher only relights the globe itself, so the
          backdrop stays put either way (this is also why it's called "introNight", not
          "spaceVisible"). Each star holds its final position the whole time; only its tail
          animates, shrinking into the dot to read as "arriving fast, then settling." */}
      <div
        className={`pointer-events-none absolute inset-0 z-10 overflow-hidden transition-opacity duration-700 ${
          stage === "logo" || stage === "split" || stage === "focus" ? "opacity-100" : "opacity-0"
        }`}
      >
        {SKY_STARS.map((s, i) => (
          <div key={i} className="lmd-star-host" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
            <div className="lmd-star-dot" style={{ width: s.size, height: s.size, opacity: s.opacity }} />
            <div
              className="lmd-star-tail"
              style={
                {
                  width: `${s.tailLen}px`,
                  "--tail-rotate": `${s.angle}deg`,
                  animationDelay: `${s.delay}ms`,
                } as CSSProperties
              }
            />
          </div>
        ))}
      </div>

      {/* Night/day switcher for the split/focus scenes only — Start the Journey fades the
          globe itself back to day first if it was night (see transitionToDayThenRun), since
          hero/masterplan only ever show the real day satellite photo; no separate control
          once a journey actually starts. */}
      {(stage === "split" || stage === "focus") && (
        <div className="absolute bottom-5 right-5 z-20 flex items-center gap-1 rounded-full border border-white/10 bg-[#0a1614]/90 p-1 backdrop-blur">
          <button
            onClick={() => setIntroNight(true)}
            className={`rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${
              introNight ? "bg-white text-[#070f0d]" : "text-[#8fa69e] hover:text-[#f5f3ee]"
            }`}
          >
            Night
          </button>
          <button
            onClick={() => setIntroNight(false)}
            className={`rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${
              !introNight ? "bg-white text-[#070f0d]" : "text-[#8fa69e] hover:text-[#f5f3ee]"
            }`}
          >
            Day
          </button>
        </div>
      )}

      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070f0d] p-8 text-center">
          <div className="max-w-sm text-sm text-[#8fa69e]">
            <p className="mb-2 font-medium text-[#f5f3ee]">Mapbox token missing</p>
            <p>
              Add <code className="rounded bg-white/10 px-1 py-0.5 text-xs">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 text-xs">.env.local</code> to load the experience.
            </p>
          </div>
        </div>
      )}

      {/* LOGO — LMD's real wordmark, first thing shown on black. Never unmounts: it docks to
          the left as the globe arrives (split), then exits further left once a pin is picked
          (focus) — a real move, not a vanish. */}
      {MAPBOX_TOKEN && (
        <div
          onClick={stage === "logo" ? advanceFromLogo : undefined}
          className={`absolute inset-0 z-20 bg-[#070f0d] transition-opacity duration-700 ${
            stage === "logo" ? "cursor-pointer opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
      )}
      {MAPBOX_TOKEN && (
        <div
          onClick={stage === "logo" ? advanceFromLogo : undefined}
          role={stage === "logo" ? "button" : undefined}
          aria-label={stage === "logo" ? "Skip intro" : undefined}
          style={{
            left: stage === "logo" ? "50%" : "32%",
            transform: `translate(-50%, -50%) translateX(${stage === "logo" || stage === "split" ? "0" : "-140%"})`,
            // Fades in place (no slide) when a manual zoom brings the globe close enough to
            // collide with the panel — the stage-driven slide-exit above is unaffected.
            opacity: stage === "logo" || (stage === "split" && !logoZoomHidden) ? 1 : 0,
            transition: "left 1400ms ease-out, transform 1400ms ease-out, opacity 1000ms ease-out",
          }}
          className={`absolute top-1/2 z-30 flex flex-col gap-6 ${
            stage === "logo" ? "cursor-pointer items-center text-center" : "pointer-events-none items-start text-left"
          }`}
        >
          <div
            className={`transition-all duration-1000 ease-out ${
              logoVisible ? "scale-100 opacity-100" : "scale-90 opacity-0"
            }`}
          >
            <Image src="/brand/lmd-logo-white.png" alt="LMD" width={378} height={157} priority className="h-14 w-auto sm:h-20" />
          </div>
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.4em] text-[#8fa69e] transition-opacity delay-500 duration-1000 ${
              logoVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            Digital Sales Experience
          </span>
        </div>
      )}

      {MAPBOX_TOKEN && !loaded && stage !== "logo" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#070f0d]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        </div>
      )}

      {/* Real DP aerial video, when present — the live satellite map underneath is already a real aerial view either way */}
      {stage === "hero" && !heroVideoFailed && (
        <video
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
            heroVideoVisible ? "opacity-100" : "opacity-0"
          }`}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setHeroVideoFailed(true)}
        >
          <source src={ZOYA_HERO_VIDEO} />
        </video>
      )}

      {/* Scrim bands: guaranteed text legibility regardless of what the live map/video shows
          underneath — a text-shadow alone isn't reliable over bright, high-detail satellite
          imagery, so every stage that carries UI over the live view gets a real gradient. */}
      {stage !== "logo" && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 via-black/25 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        </>
      )}

      {/* Persistent brand anchor, top-left, every stage past the logo — matches how LMD keeps
          its own mark pinned in their site nav. Opacity-driven (not conditionally-mounted) so
          a manual zoom-in/out during "split" fades it rather than popping it. */}
      {stage !== "logo" && (
        <div
          className={`pointer-events-none absolute left-5 top-5 z-20 transition-opacity duration-500 ${
            showBrandMark ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image src="/brand/lmd-logo-white.png" alt="LMD" width={378} height={157} className="h-5 w-auto opacity-90" />
        </div>
      )}

      {/* Project switcher — real LMD roster, grouped by country; only Zoya is a real
          interactive experience today, everything else says so honestly instead of faking it. */}
      {showSwitcherTrigger && (
        <div className="absolute right-5 top-5 z-20">
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            className="rounded-full border border-white/15 bg-[#0a1614]/90 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee] backdrop-blur transition-colors hover:border-white/40"
          >
            LMD Projects {switcherOpen ? "▴" : "▾"}
          </button>

          {switcherOpen && (
            <div className="absolute right-0 top-11 max-h-[70vh] w-64 overflow-y-auto rounded-lg border border-white/15 bg-[#0a1614]/97 p-3 shadow-2xl backdrop-blur">
              {COUNTRIES_ORDER.map((country) => {
                const projects = LMD_PROJECTS.filter((p) => p.country === country);
                if (projects.length === 0) return null;
                return (
                  <div key={country} className="mb-3 last:mb-0">
                    <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-[#8fa69e]">{country}</div>
                    <div className="flex flex-col gap-0.5">
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => goToProject(p.id)}
                          className={`flex items-center justify-between rounded px-2 py-1.5 text-left text-[13px] transition-colors ${
                            p.href ? "text-[#f5f3ee] hover:bg-white/10" : "text-[#6b7d78] hover:bg-white/5"
                          }`}
                        >
                          <span>{p.name}</span>
                          {!p.href && <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-[#556661]">Soon</span>}
                          {p.href && p.id === "zoya" && selectedPinId === "zoya" && (
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {switcherNotice && (
        <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-[#0a1614]/95 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee] shadow-xl backdrop-blur">
          {switcherNotice}
        </div>
      )}

      {/* Pins are real LMD project locations (mapboxgl.Marker, popped in via CSS once the
          globe settles in "split"). Selecting one moves the globe to the LEFT and takes over
          the RIGHT side: real project name and its real lat/lng both decrypt-reveal via the
          same useScrambleReveal hook (one consistent "text arriving" animation instead of a
          separate slide-in for the title), then the journey button fades in once they've
          mostly resolved. */}
      {focusPanelMounted && selectedPinId && loaded && MAPBOX_TOKEN && (
        <div
          className="absolute top-1/2 z-30 flex max-w-md flex-col items-start gap-4 transition-opacity duration-500"
          style={{ left: "68%", transform: "translate(-50%, -50%)", opacity: focusPanelVisible ? 1 : 0 }}
        >
          {/* The globe underneath is real satellite/night-lights imagery, not a solid
              backdrop — light terrain (desert, city lights) can land directly behind this
              text with near-zero contrast. A text-shadow (not a background card behind the
              text) is what carries legibility here — no extra shape competing with the globe. */}
          <div>
            <span
              className="text-lg font-bold uppercase tracking-[0.3em] text-[#d4af37] sm:text-xl"
              style={{ textShadow: "0 2px 14px rgba(0,0,0,0.85)" }}
            >
              {selectedProject?.country}
            </span>
            <h1
              className="mt-1 min-h-[1.05em] text-4xl font-bold leading-[1.05] text-[#f5f3ee] sm:text-5xl"
              style={{ textShadow: "0 2px 18px rgba(0,0,0,0.85)" }}
            >
              {revealedName}
            </h1>
          </div>
          <div
            className="min-h-[1.5em] font-mono text-lg font-bold tracking-[0.1em] text-white sm:text-2xl"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,0.85)" }}
          >
            {revealedCoords}
            <span className="animate-pulse">_</span>
          </div>
          <button
            onClick={startJourney}
            style={{
              opacity: focusPanelVisible ? 1 : 0,
              transform: focusPanelVisible ? "translateY(0)" : "translateY(12px)",
              transition:
                "opacity 500ms ease-out 550ms, transform 500ms ease-out 550ms, background-color 200ms ease-out, color 200ms ease-out",
            }}
            className="rounded-full border border-[#d4af37] bg-[#d4af37]/10 px-8 py-3 font-mono text-[12px] uppercase tracking-[0.3em] text-[#f2d9a0] shadow-[0_0_20px_rgba(212,175,55,0.25)] backdrop-blur hover:bg-[#d4af37] hover:text-[#070f0d]"
          >
            Start the Journey
          </button>
        </div>
      )}

      {/* Generic hero for a non-Zoya pin: the camera actually flew to the real coordinates
          (see HERO_ZOOM_BY_PRECISION above) — only the imagery is fake, and it's deliberately
          abstract (placeholderPhoto), not an attempt to pass as a real site photo. Swap these
          for real DP assets the same way Zoya's are dropped into public/media/<id>/aerial/
          once they exist. */}
      {stage === "comingsoon" && (
        <>
          <div className="absolute right-5 top-16 hidden rounded-lg border border-white/10 bg-[#0a1614]/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#8fa69e] backdrop-blur sm:block">
            {selectedCoordsTarget}
          </div>

          <div
            className="absolute left-5 top-16 text-2xl font-bold text-[#f5f3ee] sm:text-3xl"
            style={{ textShadow: "0 2px 16px rgba(0,0,0,0.85)" }}
          >
            {selectedProject?.name}
          </div>

          {selectedPinId && (
            <div className="pointer-events-none absolute bottom-24 left-1/2 hidden -translate-x-1/2 gap-2 sm:flex">
              {["Aerial view", "Site overview", "Community"].map((label) => (
                // eslint-disable-next-line @next/next/no-img-element -- generated data: URI, next/image optimization doesn't apply
                <img
                  key={label}
                  src={placeholderPhoto(`${selectedPinId}-${label}`, label)}
                  alt={`${selectedProject?.name} — placeholder, real photography pending`}
                  className="h-14 w-20 rounded border border-white/10 object-cover"
                />
              ))}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-3">
            <div className="rounded-lg border border-white/15 bg-[#0a1614]/90 px-6 py-3 text-center backdrop-blur">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8fa69e]">
                Full interactive experience coming soon — imagery shown is placeholder
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedPinId(null);
                setStage("split");
              }}
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7d78] hover:text-[#f5f3ee]"
            >
              ← Back to overview
            </button>
          </div>
        </>
      )}

      {/* HERO — no text overlay or scrim on purpose: the real aerial video/imagery carries
          the moment on its own now, with just the real coordinates and a way down to the
          masterplan. */}
      {stage === "hero" && (
        <>
          <div className="absolute right-5 top-16 hidden rounded-lg border border-white/10 bg-[#0a1614]/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#8fa69e] backdrop-blur sm:block">
            {ZOYA.lat.toFixed(4)}°N, {Math.abs(ZOYA.lng).toFixed(4)}°E
          </div>

          <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-4">
            <button
              onClick={enterMasterplan}
              className="rounded-full border bg-[#0a1614]/80 px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.25em] text-[#f5f3ee] backdrop-blur transition-colors"
              style={{ borderColor: `${ACCENT}80` }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = ACCENT;
                e.currentTarget.style.color = ACCENT;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = `${ACCENT}80`;
                e.currentTarget.style.color = "#f5f3ee";
              }}
            >
              Explore Masterplan ↓
            </button>
          </div>
        </>
      )}

      {/* MASTERPLAN */}
      {stage === "masterplan" && (
        <>
          <div className="absolute left-5 top-16 flex items-center gap-3">
            <button
              onClick={backToOverview}
              className="rounded-full border border-white/15 bg-[#0a1614]/90 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee] backdrop-blur hover:border-white/40"
            >
              ← Overview
            </button>
            <span className="rounded-full border border-white/10 bg-[#0a1614]/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8fa69e] backdrop-blur">
              {masterplanLoading
                ? `Loading model… ${Math.round(masterplanProgress * 100)}%`
                : `${buildings.length} buildings mapped`}
            </span>
          </div>

          <div className="absolute right-5 top-16 rounded-full border border-white/10 bg-[#0a1614]/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8fa69e] backdrop-blur">
            ZOYA · Interactive Masterplan
          </div>

          {/* Prominent, real-progress feedback — the top-left badge alone was too easy to
              miss while the camera is mid-flyTo; on a slow connection the 28MB model load
              read as "nothing happened" rather than "loading". */}
          {masterplanLoading && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#070f0d]/35 backdrop-blur-[2px]">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
              <div className="flex flex-col items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#f5f3ee]">
                  Loading interactive masterplan
                </span>
                <div className="h-1 w-40 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full transition-[width] duration-200"
                    style={{ width: `${Math.round(masterplanProgress * 100)}%`, backgroundColor: ACCENT }}
                  />
                </div>
              </div>
            </div>
          )}

          {selectedBuilding && (
            <div className="absolute left-5 bottom-24 w-64 rounded-lg border border-white/10 bg-[#0a1614]/95 p-4 backdrop-blur">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.25em]" style={{ color: ACCENT }}>
                Selected
              </div>
              <div className="text-lg font-semibold text-[#f5f3ee]">{selectedBuilding}</div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8fa69e]">
                Unit availability connects here
              </div>
              <button
                onClick={() => setSelectedBuilding(null)}
                className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8fa69e] hover:text-[#f5f3ee]"
              >
                Dismiss
              </button>
            </div>
          )}
        </>
      )}

      {/* aerial gallery strip — real assets when present, honest placeholders otherwise */}
      {stage === "hero" && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 hidden -translate-x-1/2 gap-2 sm:flex">
          {ZOYA_AERIAL_PHOTOS.map((p) => (
            <ZoyaAsset
              key={p.file}
              src={`${ZOYA_AERIAL_DIR}/${p.file}`}
              alt={p.caption}
              className="h-14 w-20 rounded border border-white/10 object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}

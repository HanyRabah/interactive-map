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

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  createMasterplanLayer,
  DEFAULT_MASTERPLAN_PARAMS,
  type MasterplanLayer,
  type MasterplanBuilding,
  type MasterplanParams,
} from "./MasterplanLayer";
import {
  addImageMasterplanLayer,
  updateImageMasterplanLayer,
  removeImageMasterplanLayer,
  getImageAspectRatio,
  fitToAspect,
  computeImageCorners,
  pointInQuad,
  DEFAULT_IMAGE_MASTERPLAN_PARAMS,
  type ImageMasterplanParams,
} from "./ImageMasterplanLayer";
import { lngLatToMeters, minAreaRect, type MinRect } from "./boundary";
import { addEsriImageryLayer, removeEsriImageryLayer } from "./EsriImageryLayer";
import { addGoogleImageryLayer, removeGoogleImageryLayer } from "./GoogleImageryLayer";
import type { JourneyImagerySource } from "@/app/api/journey-imagery/route";
import type { DefaultImagerySource } from "@/app/api/default-imagery/route";
import { createAtmosphereLayer, type AtmosphereLayer } from "./AtmosphereLayer";
import { PROJECTS } from "./GlobePortfolioMap";
import { ZOYA_HERO_VIDEO } from "@/data/zoyaMedia";
import { LMD_PROJECTS, type LmdProjectStub } from "@/data/lmdProjects";

const ZOYA = PROJECTS.find((p) => p.id === "zoya-ghazala-bay")!;

// Zoya's own campaign color (LMD's real embroidered "ZOYA" wordmark, lmd.com.eg/en) — not
// an invented accent. LMD's own brand mark is plain black/white; this teal is Zoya-specific.
const ACCENT = "#1c93a0";

// Which client's experience this showcase renders — /[client] routes pass a brand built
// from the catalog; the bare `/` route defaults to LMD, today's flagship. Everything
// client-specific (wordmark, roster, dropdown label) flows from here.
export type ClientBrand = {
  slug: string;
  name: string;
  /** Light/white wordmark for dark backgrounds; text wordmark renders when absent. */
  logoUrl?: string;
  roster: LmdProjectStub[];
};

const LMD_BRAND: ClientBrand = { slug: "lmd", name: "LMD", logoUrl: "/brand/lmd-logo-white.png", roster: LMD_PROJECTS };

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
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

// A PROJECTS entry (GlobePortfolioMap.tsx's real data) that made it this far always has a
// real, calibrated model/masterplanImage — that's what routes it through the flight/
// masterplan flow below instead of the honest "comingsoon" placeholder.
type ShowcaseProject = (typeof PROJECTS)[number];

// Every hand-tuned pitch/zoom above was verified against a wide desktop viewport. A pitched
// camera keeps the target lng/lat anchored to screen-center regardless of aspect ratio, but
// a tall narrow (portrait phone) frame shows proportionally far less width — the same shot
// that reads as "establishing" on desktop reads as "site crammed in a corner, mostly empty
// sea/sky" on mobile. Pulling pitch down and zooming out slightly on narrow viewports fills
// the frame with more of the actual site instead of empty horizon.
function adjustForViewport<T extends { zoom: number; pitch: number }>(view: T): T {
  if (typeof window === "undefined" || window.innerWidth >= 640) return view;
  return { ...view, zoom: view.zoom - 1.1, pitch: Math.max(0, view.pitch - 20) };
}

// Zoya alone got a hand-tuned, screenshot-verified camera pass; every other real project
// (BEC today, more later) shares one reasonable generic angle instead of guessing a new
// one per site.
function viewsFor(id: string) {
  if (id === ZOYA.id) return { hero: adjustForViewport(HERO_VIEW), masterplan: adjustForViewport(MASTERPLAN_VIEW) };
  return {
    hero: adjustForViewport({ zoom: HERO_ZOOM_BY_PRECISION.exact, pitch: GENERIC_HERO_VIEW.pitch, bearing: GENERIC_HERO_VIEW.bearing }),
    masterplan: adjustForViewport({ zoom: 17, pitch: 55, bearing: -20 }),
  };
}

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

export default function ZoyaShowcase({ brand = LMD_BRAND }: { brand?: ClientBrand } = {}) {
  const roster = brand.roster;
  const pinnedProjects = useMemo(
    () => roster.filter((p): p is LmdProjectStub & { lngLat: [number, number] } => !!p.lngLat),
    [roster]
  );
  // Dropdown grouping order = first-appearance order in the roster (matches the old
  // hardcoded COUNTRIES_ORDER for LMD's own roster).
  const countries = useMemo(() => Array.from(new Set(roster.map((p) => p.country))), [roster]);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const spinning = useRef(true);
  const atmosphere = useRef<AtmosphereLayer | null>(null);
  const atmosphereTarget = useRef(0);
  const atmosphereCurrent = useRef(0);
  const masterplanLayer = useRef<MasterplanLayer | null>(null);
  const imageMasterplanId = useRef<string | null>(null);
  // Which image-masterplan layer ids already have their click-to-zoom handler bound — see
  // enter2DMasterplan's comment on why this guards against duplicate registrations.
  const boundImageClickLayers = useRef(new Set<string>());
  // The live project catalog. Starts as the in-repo PROJECTS array (instant, no loading
  // state), then /api/projects — the CMS-merged view — replaces it once fetched. That's
  // what makes a project added or edited in /admin light up the real journey stages
  // (fly-in, hero, 3D masterplan) without a deploy: the CMS's asset URLs and calibration
  // supersede the static ones. catalogRef mirrors it for event handlers (same pattern as
  // stageRef). On fetch failure the static array simply stays — the map never blanks.
  const [catalogProjects, setCatalogProjects] = useState<ShowcaseProject[]>(PROJECTS);
  const catalogRef = useRef<ShowcaseProject[]>(PROJECTS);
  useEffect(() => {
    catalogRef.current = catalogProjects;
  }, [catalogProjects]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Hydrate, THEN warm the HTTP cache for whichever asset URLs won — preloading the
      // static list first would double-download every model once the CMS URLs replace it.
      let list: ShowcaseProject[] = PROJECTS;
      try {
        const res = await fetch("/api/projects", { cache: "no-store" });
        const data = (await res.json()) as { projects?: ShowcaseProject[] };
        if (Array.isArray(data.projects) && data.projects.length > 0) list = data.projects;
      } catch {
        // static fallback already in place
      }
      if (cancelled) return;
      setCatalogProjects(list);
      for (const p of list) {
        if (p.model?.url) fetch(p.model.url).catch(() => {});
        if (p.masterplanImage?.url) fetch(p.masterplanImage.url).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Which real project (Zoya, BEC, ...) the flight/hero/masterplan stages are currently
  // showing. A ref for the imperative map calls (flyTo center/model url etc., read at call
  // time, not captured in a stale closure) plus a state mirror so render can react to it.
  const activeProjectRef = useRef<ShowcaseProject>(ZOYA);
  const [activeProjectId, setActiveProjectId] = useState(ZOYA.id);
  const activeProject = catalogProjects.find((p) => p.id === activeProjectId) ?? ZOYA;
  // "2d" when the active project has a real masterplan image (Zoya today) — the flat
  // branded graphic is the more legible default; "3d" for a project with only a model
  // (BEC today), so its real GLB is what "Explore Masterplan" actually shows.
  const [masterplanMode, setMasterplanMode] = useState<"2d" | "3d">("2d");
  // Live, per-mode calibration mirrors — start at the project's saved values, then track
  // whatever "Apply Boundary" or manual tuning does, so setParams/updateImageMasterplanLayer
  // calls always have the current numbers instead of stale ones baked in at layer creation.
  // Refs for imperative code (always current, no stale-closure risk); state alongside so the
  // nudge/resize panel can actually display and react to the current values.
  const calib3DRef = useRef<MasterplanParams>(DEFAULT_MASTERPLAN_PARAMS);
  const calibImageRef = useRef<ImageMasterplanParams>(DEFAULT_IMAGE_MASTERPLAN_PARAMS);
  const [calib3D, setCalib3D] = useState<MasterplanParams>(DEFAULT_MASTERPLAN_PARAMS);
  const [calibImage, setCalibImage] = useState<ImageMasterplanParams>(DEFAULT_IMAGE_MASTERPLAN_PARAMS);
  const modelFootprint = useRef<{ width: number; depth: number } | null>(null);
  // Raw building centers (pre-lng/lat-conversion) kept alongside the placed `buildings`
  // state — applying a boundary fit changes calib3DRef, and without these the building
  // dots would stay at their old (now-wrong) positions until the whole model reloads.
  const rawBuildings = useRef<MasterplanBuilding[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const drawModeRef = useRef(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const drawPointsRef = useRef<[number, number][]>([]);
  const [boundaryResult, setBoundaryResult] = useState<{ rect: MinRect; centroidMeters: [number, number] } | null>(
    null
  );
  // Calibration tools (Draw Boundary, the drawing toolbar/result panel, Adjust Position) are
  // for DP staff tuning a project, not something a real visitor should ever see — hidden
  // unless the URL explicitly asks for them (e.g. ?tools=1), not on by default.
  const [toolsEnabled, setToolsEnabled] = useState(false);
  // The raw ?tools= value, relayed as-is to /api/journey-imagery's POST for server-side
  // secret comparison — never checked client-side, so the real secret never has to ship
  // in the JS bundle, only whatever the URL happens to contain.
  const toolsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    // Syncing from the URL (an external system) on mount, not derived from React state —
    // the one-time read the lint rule's own docs carve out as fine.
    const params = new URLSearchParams(window.location.search);
    toolsKeyRef.current = params.get("tools");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToolsEnabled(params.has("tools"));
  }, []);

  // Reactive (unlike adjustForViewport's one-time synchronous read at click-time) — the
  // logo panel below needs an actual render-time value, since its position is computed as
  // inline style rather than pure Tailwind classes.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Perspective (the hand-tuned/generic masterplan angle) vs a flat top-down view — applies
  // to whichever of 2D/3D is currently showing.
  const [topView, setTopView] = useState(false);

  // Global, persisted default imagery source (Esri vs Mapbox's own satellite) — applies
  // everywhere, including the intro globe, not just the journey stages. Initial state
  // optimistically assumes "esri" (the intended new default) so there's no visible flash
  // of Mapbox-then-Esri while the fetch below is in flight; reconciled to the real value
  // once it resolves. defaultImageryRef mirrors it for use inside the style.load handler,
  // which may run before that fetch resolves.
  const [defaultImagery, setDefaultImagery] = useState<DefaultImagerySource>("esri");
  const defaultImageryRef = useRef<DefaultImagerySource>("esri");
  const [defaultImagerySaving, setDefaultImagerySaving] = useState(false);
  useEffect(() => {
    defaultImageryRef.current = defaultImagery;
  }, [defaultImagery]);
  useEffect(() => {
    fetch("/api/default-imagery", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { source?: DefaultImagerySource }) => {
        if (data.source === "esri" || data.source === "mapbox") setDefaultImagery(data.source);
      })
      .catch(() => {});
  }, []);
  // Reactive application: covers both the toggle button (state changes after mount) and
  // the case where this fetch resolves after style.load already ran (see onAdd below,
  // which also applies the ref's value directly for the common case it resolves first).
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    if (defaultImagery === "esri") addEsriImageryLayer(m);
    else removeEsriImageryLayer(m);
  }, [defaultImagery]);

  // Global "journey imagery source" flag — read from /api/journey-imagery (backed by a
  // shared Vercel Edge Config store) on mount, so it's the same for every visitor, not
  // just whoever last toggled it locally. journeySourceRef mirrors it for use inside
  // map event callbacks, same pattern as stageRef.
  const [journeySource, setJourneySource] = useState<JourneyImagerySource>("mapbox");
  const journeySourceRef = useRef<JourneyImagerySource>("mapbox");
  const [journeySourceSaving, setJourneySourceSaving] = useState(false);
  const googleImageryFailedRef = useRef(false);
  useEffect(() => {
    journeySourceRef.current = journeySource;
  }, [journeySource]);
  useEffect(() => {
    fetch("/api/journey-imagery", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { source?: JourneyImagerySource }) => {
        if (data.source === "google" || data.source === "mapbox") setJourneySource(data.source);
      })
      .catch(() => {});
  }, []);

  async function toggleJourneySource() {
    const next: JourneyImagerySource = journeySource === "mapbox" ? "google" : "mapbox";
    setJourneySourceSaving(true);
    try {
      const res = await fetch("/api/journey-imagery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: next, secret: toolsKeyRef.current }),
      });
      if (!res.ok) throw new Error(await res.text());
      googleImageryFailedRef.current = false;
      setJourneySource(next);
    } catch (err) {
      console.error("Failed to update journey imagery source", err);
    } finally {
      setJourneySourceSaving(false);
    }
  }

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

  const selectedProject = selectedPinId === "zoya" ? { name: "Zoya", country: "Egypt" } : roster.find((p) => p.id === selectedPinId);
  const selectedLngLat: [number, number] | undefined =
    selectedPinId === "zoya" ? [ZOYA.lng, ZOYA.lat] : roster.find((p) => p.id === selectedPinId)?.lngLat;
  const selectedCoordsTarget = selectedLngLat
    ? `${Math.abs(selectedLngLat[1]).toFixed(4)}°${selectedLngLat[1] >= 0 ? "N" : "S"}, ${Math.abs(selectedLngLat[0]).toFixed(4)}°${selectedLngLat[0] >= 0 ? "E" : "W"}`
    : "";
  const revealedName = useScrambleReveal(selectedProject?.name ?? "", selectedPinId);
  const revealedCoords = useScrambleReveal(selectedCoordsTarget, selectedPinId);

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
    pinnedProjects.forEach((p, i) => {
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
    // Any real project — one with an actual calibrated model/masterplanImage in PROJECTS,
    // not just an LMD_PROJECTS stub — gets the real flight/hero/masterplan flow. Zoya no
    // longer needs a special case here: it has a model like any other real project now.
    const real =
      catalogRef.current.find((p) => p.id === (selectedPinId === "zoya" ? "zoya-ghazala-bay" : selectedPinId)) ??
      (selectedPinId === "zoya" ? ZOYA : undefined);
    if (real?.model || real?.masterplanImage) {
      activeProjectRef.current = real;
      setActiveProjectId(real.id);
      setMasterplanMode(real.masterplanImage ? "2d" : "3d");
      beginFlight();
      return;
    }
    const project = roster.find((p) => p.id === selectedPinId);
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
    // On mobile the logo no longer docks to a side (see the persistent top-center panel
    // below) — nothing to make room for, so the globe stays centered instead of shifted
    // right under half the screen's width of dead padding.
    m.setPadding({ left: startWidth < 640 ? 0 : startWidth * 0.5, right: 0, top: 0, bottom: 0 });

    m.on("style.load", () => {
      m.setFog(introFog());
      // Applied here (not waiting for the /api/default-imagery fetch, which usually loses
      // this race to Mapbox's own style.load anyway) using the ref's current value —
      // "esri" until proven otherwise. The reactive effect above (keyed on defaultImagery
      // state) covers the opposite race, where the fetch resolves after this already ran.
      if (defaultImageryRef.current === "esri") addEsriImageryLayer(m);
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

      // Boundary-draw preview: click points, connecting line, and a translucent fill once
      // closed — same mechanism as the /portfolio page's "Draw Boundary" tool, ported here
      // so a misplaced masterplan (2D image or 3D model) can be corrected directly in this
      // experience instead of only in the admin-style portfolio view.
      m.addSource("boundary-draw", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "boundary-draw-fill",
        type: "fill",
        source: "boundary-draw",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": ACCENT, "fill-opacity": 0.2 },
      });
      m.addLayer({
        id: "boundary-draw-line",
        type: "line",
        source: "boundary-draw",
        filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]],
        paint: { "line-color": ACCENT, "line-width": 2 },
      });
      m.addLayer({
        id: "boundary-draw-points",
        type: "circle",
        source: "boundary-draw",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-width": 2, "circle-stroke-color": ACCENT },
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
    // On mobile the logo/details panels dock to the top/bottom instead of the side (see
    // the persistent logo panel and the focus panel below), so there's no side column to
    // clear space for — the globe stays centered instead of pushed toward one edge.
    const sidePadding = w < 640 ? 0 : w * SPLIT_PADDING_FRACTION;
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
        padding: { left: sidePadding, right: 0, top: 0, bottom: 0 },
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
        padding: { left: 0, right: sidePadding, top: 0, bottom: 0 },
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
    const project = activeProjectRef.current;
    const { hero } = viewsFor(project.id);
    transitionToDayThenRun(() => {
      if (!map.current) return;
      setStage("flight");
      atmosphereTarget.current = 0.6;
      // Journey-only imagery source (see journeySource) — mounted right as the flight
      // starts, not on arrival, so Google's tiles have the whole ~4.2s flyTo to load in
      // underneath the moving camera. Loading it only after arrival (the original
      // approach) meant visitors saw Mapbox's own satellite for the entire flight, then a
      // visible pop to Google right as the camera settled — exactly the "reveal" this
      // avoids. Never shown on the intro globe/split/focus stages. Falls back to Mapbox's
      // own satellite tiles (already underneath) automatically if Google's tiles error.
      if (journeySourceRef.current === "google" && !googleImageryFailedRef.current) {
        addGoogleImageryLayer(map.current, () => {
          googleImageryFailedRef.current = true;
        });
      }
      map.current.flyTo({
        center: [project.lng, project.lat],
        zoom: hero.zoom,
        pitch: hero.pitch,
        bearing: hero.bearing,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
        duration: 4200,
        essential: true,
      });
      window.setTimeout(() => {
        setStage("hero");
        // Show the real branded masterplan graphic draped in the scene right away, not
        // hidden behind a separate "Explore Masterplan" click — clicking it (see
        // enter2DMasterplan's click binding) zooms into the full masterplan stage.
        if (project.masterplanImage) enter2DMasterplan(project);
      }, 4300);
    });
  }

  function remove3DMasterplanLayer() {
    const m = map.current;
    if (m && masterplanLayer.current && m.getLayer(masterplanLayer.current.id)) {
      m.removeLayer(masterplanLayer.current.id);
    }
    masterplanLayer.current = null;
    setBuildings([]);
  }

  function removeImageMasterplan() {
    const m = map.current;
    if (m && imageMasterplanId.current) removeImageMasterplanLayer(m, imageMasterplanId.current);
    imageMasterplanId.current = null;
  }

  function enter3DMasterplan(project: ShowcaseProject) {
    const m = map.current;
    if (!m) return;
    removeImageMasterplan();
    const layerId = `masterplan-${project.id}`;
    if (masterplanLayer.current && masterplanLayer.current.id !== layerId) remove3DMasterplanLayer();
    if (!masterplanLayer.current && project.model) {
      // Real GLB — network+parse time varies with size. The camera flying in is motion
      // enough to hide a lot, but on a slow connection it wasn't: nothing else signaled a
      // click had registered, so it read as broken rather than loading.
      setMasterplanLoading(true);
      setMasterplanProgress(0);
      const calib = project.modelCalibration ?? DEFAULT_MASTERPLAN_PARAMS;
      calib3DRef.current = calib;
      setCalib3D(calib);
      const layer = createMasterplanLayer(
        layerId,
        project.lng,
        project.lat,
        0,
        project.model,
        calib,
        (footprint, real) => {
          modelFootprint.current = footprint;
          rawBuildings.current = real;
          const placed = real.map((b) => ({
            name: cleanBuildingName(b.name),
            lngLat: buildingToLngLat(b, calib3DRef.current, project.lng, project.lat),
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
    setMasterplanMode("3d");
  }

  function enter2DMasterplan(project: ShowcaseProject) {
    const m = map.current;
    if (!m || !project.masterplanImage) return;
    remove3DMasterplanLayer();
    const layerId = `masterplan-image-${project.id}`;
    const params = project.masterplanImage.params ?? DEFAULT_IMAGE_MASTERPLAN_PARAMS;
    calibImageRef.current = params;
    setCalibImage(params);
    addImageMasterplanLayer(m, layerId, project.masterplanImage.url, project.lng, project.lat, params).catch((err) =>
      console.error("Failed to add masterplan image layer", err)
    );
    // Raster ("image" source) layers are never queryable via queryRenderedFeatures, so
    // Mapbox's layer-scoped events (map.on("click", layerId, ...)) never fire on them —
    // a single map-wide handler tests the click point against the image's own geo quad
    // instead. Bound once per map instance (not per layer id), guarded so re-entering
    // 2D mode doesn't stack duplicate handlers.
    if (!boundImageClickLayers.current.has("map")) {
      boundImageClickLayers.current.add("map");
      m.on("click", (e) => {
        if (stageRef.current !== "hero" || !imageMasterplanId.current) return;
        const quad = computeImageCorners(activeProjectRef.current.lng, activeProjectRef.current.lat, calibImageRef.current);
        if (pointInQuad([e.lngLat.lng, e.lngLat.lat], quad)) openMasterplan();
      });
      m.on("mousemove", (e) => {
        if (stageRef.current !== "hero" || !imageMasterplanId.current) {
          m.getCanvas().style.cursor = "";
          return;
        }
        const quad = computeImageCorners(activeProjectRef.current.lng, activeProjectRef.current.lat, calibImageRef.current);
        m.getCanvas().style.cursor = pointInQuad([e.lngLat.lng, e.lngLat.lat], quad) ? "pointer" : "";
      });
    }
    imageMasterplanId.current = layerId;
    setMasterplanMode("2d");
  }

  function openMasterplan() {
    const m = map.current;
    if (!m) return;
    const project = activeProjectRef.current;
    atmosphereTarget.current = 0.35;
    setTopView(false);
    const { masterplan } = viewsFor(project.id);
    m.flyTo({
      center: [project.lng, project.lat],
      zoom: masterplan.zoom,
      pitch: masterplan.pitch,
      bearing: masterplan.bearing,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      duration: 2400,
    });
    // 2D is the default when a real branded masterplan graphic exists (Zoya) — it's the
    // more legible starting view. A project with only a calibrated 3D model (BEC, for now)
    // goes straight to that model instead, since there's no 2D asset yet to prefer.
    if (project.masterplanImage) enter2DMasterplan(project);
    else if (project.model) enter3DMasterplan(project);
    setStage("masterplan");
  }

  function toggleMasterplanMode() {
    const project = activeProjectRef.current;
    if (masterplanMode === "2d") enter3DMasterplan(project);
    else enter2DMasterplan(project);
  }

  // Perspective <-> flat top-down, for whichever of 2D/3D is currently showing. Zoom/center
  // stay put — only pitch (and bearing, since a tilted shot is rarely also north-up) move.
  function toggleTopView() {
    const m = map.current;
    if (!m) return;
    const project = activeProjectRef.current;
    const { masterplan } = viewsFor(project.id);
    const next = !topView;
    setTopView(next);
    m.easeTo({ pitch: next ? 0 : masterplan.pitch, bearing: next ? 0 : masterplan.bearing, duration: 900 });
  }

  // Global, persisted default imagery source — unlike journeySource (mapbox|google, ToS-risky,
  // journey-stages-only), Esri is a properly licensed replacement for Mapbox's own satellite
  // imagery, so it applies everywhere (including the intro globe) with no stage gating.
  async function toggleDefaultImagery() {
    const next: DefaultImagerySource = defaultImagery === "mapbox" ? "esri" : "mapbox";
    setDefaultImagerySaving(true);
    try {
      const res = await fetch("/api/default-imagery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: next, secret: toolsKeyRef.current }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDefaultImagery(next);
    } catch (err) {
      console.error("Failed to update default imagery source", err);
    } finally {
      setDefaultImagerySaving(false);
    }
  }

  function startDrawing() {
    const m = map.current;
    if (!m) return;
    setBoundaryResult(null);
    drawPointsRef.current = [];
    setDrawPoints([]);
    renderBoundaryDraw([]);
    setDrawMode(true);
    drawModeRef.current = true;
    m.dragRotate.disable();
    m.touchZoomRotate.disableRotation();
    // Top-down is easiest to trace accurately against — the tilted masterplan framing is
    // great for looking at, not for clicking precise ground points.
    m.easeTo({ pitch: 0, bearing: 0, duration: 700 });
  }

  function undoDrawPoint() {
    const next = drawPointsRef.current.slice(0, -1);
    drawPointsRef.current = next;
    setDrawPoints(next);
    renderBoundaryDraw(next);
  }

  function exitDrawMode() {
    setDrawMode(false);
    drawModeRef.current = false;
    map.current?.dragRotate.enable();
    map.current?.touchZoomRotate.enableRotation();
  }

  function cancelDrawing() {
    exitDrawMode();
    drawPointsRef.current = [];
    setDrawPoints([]);
    renderBoundaryDraw([]);
  }

  function clearBoundary() {
    setBoundaryResult(null);
    drawPointsRef.current = [];
    setDrawPoints([]);
    renderBoundaryDraw([]);
  }

  function finishDrawing() {
    const pts = drawPointsRef.current;
    if (pts.length < 3) return;
    const project = activeProjectRef.current;
    const meterPts = pts.map(([lng, lat]) => lngLatToMeters(lng, lat, project.lng, project.lat));
    const rect = minAreaRect(meterPts);
    // rect.center (the rotating-calipers rectangle's own center) anchors the fitted shape
    // better than a plain vertex average, which skews toward denser corners.
    setBoundaryResult({ rect, centroidMeters: rect.center });
    exitDrawMode();
  }

  function applyBoundaryTo3D() {
    if (!boundaryResult) return;
    const project = activeProjectRef.current;
    const m = map.current;
    if (!m) return;
    const { rect, centroidMeters } = boundaryResult;
    const footprint = modelFootprint.current;
    const longSide = Math.max(rect.width, rect.height);
    const footprintLong = footprint ? Math.max(footprint.width, footprint.depth) : null;
    const scale = footprintLong ? Math.round((longSide / footprintLong) * 1000) / 1000 : calib3DRef.current.scale;
    const next: MasterplanParams = {
      scale,
      rotationDeg: Math.round(rect.angleDeg * 10) / 10,
      offsetE: Math.round(centroidMeters[0]),
      offsetN: Math.round(centroidMeters[1]),
      offsetUp: calib3DRef.current.offsetUp,
    };
    calib3DRef.current = next;
    setCalib3D(next);
    if (masterplanMode !== "3d") enter3DMasterplan(project);
    masterplanLayer.current?.setParams(next);
    m.triggerRepaint();
    // Re-place the building dots too — they were computed from the old calibration and
    // would otherwise sit wherever the model used to be, not where it is now.
    if (rawBuildings.current.length > 0) {
      const placed = rawBuildings.current.map((b) => ({
        name: cleanBuildingName(b.name),
        lngLat: buildingToLngLat(b, next, project.lng, project.lat),
      }));
      setBuildings(placed);
    }
  }

  async function applyBoundaryToImage() {
    if (!boundaryResult) return;
    const project = activeProjectRef.current;
    const m = map.current;
    if (!m || !project.masterplanImage) return;
    const { rect, centroidMeters } = boundaryResult;
    // The drawn box's aspect ratio essentially never matches the real image's own — fitting
    // both dimensions to it independently stretched the graphic. fitToAspect keeps the real
    // proportions and shrinks whichever side the box doesn't tightly constrain.
    const aspect = await getImageAspectRatio(project.masterplanImage.url).catch(() => rect.width / rect.height);
    const { widthMeters, heightMeters } = fitToAspect(rect.width, rect.height, aspect);
    const next: ImageMasterplanParams = {
      widthMeters: Math.round(widthMeters),
      heightMeters: Math.round(heightMeters),
      rotationDeg: Math.round(rect.angleDeg * 10) / 10,
      offsetE: Math.round(centroidMeters[0]),
      offsetN: Math.round(centroidMeters[1]),
    };
    calibImageRef.current = next;
    setCalibImage(next);
    if (masterplanMode !== "2d") {
      enter2DMasterplan(project);
    } else if (imageMasterplanId.current) {
      updateImageMasterplanLayer(m, imageMasterplanId.current, project.lng, project.lat, next);
    }
  }

  // Fine manual adjustment after a boundary fit (or instead of one) — directional nudge +
  // resize, not raw number entry. Resize always scales width/height together (never
  // independently), so this can't reintroduce the stretch bug fitToAspect just fixed.
  function nudgeImage(dE: number, dN: number) {
    const project = activeProjectRef.current;
    const m = map.current;
    if (!m || !imageMasterplanId.current) return;
    const next = { ...calibImageRef.current, offsetE: calibImageRef.current.offsetE + dE, offsetN: calibImageRef.current.offsetN + dN };
    calibImageRef.current = next;
    setCalibImage(next);
    updateImageMasterplanLayer(m, imageMasterplanId.current, project.lng, project.lat, next);
  }

  function resizeImage(factor: number) {
    const project = activeProjectRef.current;
    const m = map.current;
    if (!m || !imageMasterplanId.current) return;
    const next = {
      ...calibImageRef.current,
      widthMeters: Math.round(calibImageRef.current.widthMeters * factor),
      heightMeters: Math.round(calibImageRef.current.heightMeters * factor),
    };
    calibImageRef.current = next;
    setCalibImage(next);
    updateImageMasterplanLayer(m, imageMasterplanId.current, project.lng, project.lat, next);
  }

  function rotateImage(deltaDeg: number) {
    const project = activeProjectRef.current;
    const m = map.current;
    if (!m || !imageMasterplanId.current) return;
    const next = { ...calibImageRef.current, rotationDeg: Math.round((calibImageRef.current.rotationDeg + deltaDeg) * 10) / 10 };
    calibImageRef.current = next;
    setCalibImage(next);
    updateImageMasterplanLayer(m, imageMasterplanId.current, project.lng, project.lat, next);
  }

  function nudge3D(dE: number, dN: number) {
    const next = { ...calib3DRef.current, offsetE: calib3DRef.current.offsetE + dE, offsetN: calib3DRef.current.offsetN + dN };
    calib3DRef.current = next;
    setCalib3D(next);
    masterplanLayer.current?.setParams(next);
    map.current?.triggerRepaint();
  }

  function resize3D(factor: number) {
    const next = { ...calib3DRef.current, scale: Math.round(calib3DRef.current.scale * factor * 1000) / 1000 };
    calib3DRef.current = next;
    setCalib3D(next);
    masterplanLayer.current?.setParams(next);
    map.current?.triggerRepaint();
  }

  function rotate3D(deltaDeg: number) {
    const next = { ...calib3DRef.current, rotationDeg: Math.round((calib3DRef.current.rotationDeg + deltaDeg) * 10) / 10 };
    calib3DRef.current = next;
    setCalib3D(next);
    masterplanLayer.current?.setParams(next);
    map.current?.triggerRepaint();
  }

  function backToOverview() {
    const m = map.current;
    if (!m) return;
    setSelectedBuilding(null);
    // The 2D masterplan is a flat, opaque raster patch draped exactly over the site — left
    // in place, it reads as a visual glitch once the camera pulls back out to the wider
    // hero framing. (The 3D model doesn't get the same treatment: it's real geometry that
    // was already fine sitting there, unnoticed, before this mode existed.)
    removeImageMasterplan();
    clearBoundary();
    exitDrawMode();
    atmosphereTarget.current = 0.6;
    setTopView(false);
    const project = activeProjectRef.current;
    const { hero } = viewsFor(project.id);
    m.flyTo({
      center: [project.lng, project.lat],
      zoom: hero.zoom,
      pitch: hero.pitch,
      bearing: hero.bearing,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      duration: 2000,
    });
    setStage("hero");
  }

  function goToProject(id: string) {
    setSwitcherOpen(false);
    if (map.current) removeGoogleImageryLayer(map.current);
    const real = catalogRef.current.find((p) => p.id === (id === "zoya" ? "zoya-ghazala-bay" : id));
    if (real && real.id === activeProjectId && stage === "masterplan") {
      backToOverview();
      return;
    }
    const proj = roster.find((p) => p.id === id);
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
    if (!m || !loaded || stage !== "masterplan" || masterplanMode !== "3d" || buildings.length === 0) return;
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
  }, [loaded, stage, masterplanMode, buildings]);

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
        <div className="absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-20 hidden items-center gap-1 rounded-full border border-white/10 bg-[#0a1614]/90 p-1 backdrop-blur sm:flex">
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

      {/* LOGO — LMD's real wordmark, first thing shown on black. Never unmounts: on desktop
          it docks to the left as the globe arrives (split), then exits further left once a
          pin is picked (focus) — a real move, not a vanish. On mobile there's no side
          column to dock into (the globe stays centered, see sidePadding above; the focus
          panel moves to the bottom, see below) — it settles into a small top-center mark
          instead of sliding, and just stays there rather than exiting. */}
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
          style={
            isMobile && stage !== "logo"
              ? { top: "1.25rem", left: "50%", transform: "translate(-50%, 0)", opacity: 1, transition: "opacity 500ms ease-out" }
              : {
                  left: stage === "logo" ? "50%" : "32%",
                  transform: `translate(-50%, -50%) translateX(${stage === "logo" || stage === "split" ? "0" : "-140%"})`,
                  // Fades in place (no slide) when a manual zoom brings the globe close enough to
                  // collide with the panel — the stage-driven slide-exit above is unaffected.
                  opacity: stage === "logo" || (stage === "split" && !logoZoomHidden) ? 1 : 0,
                  transition: "left 1400ms ease-out, transform 1400ms ease-out, opacity 1000ms ease-out",
                }
          }
          className={`absolute top-1/2 z-30 flex flex-col ${isMobile && stage !== "logo" ? "gap-1.5" : "gap-6"} ${
            stage === "logo" ? "cursor-pointer items-center text-center" : "pointer-events-none items-start text-left"
          } ${isMobile ? "items-center text-center" : ""}`}
        >
          <div
            className={`transition-all duration-1000 ease-out ${
              logoVisible ? "scale-100 opacity-100" : "scale-90 opacity-0"
            }`}
          >
            {brand.logoUrl ? (
              <Image
                src={brand.logoUrl}
                alt={brand.name}
                width={378}
                height={157}
                priority
                className={`w-auto ${isMobile && stage !== "logo" ? "h-6" : "h-14 sm:h-20"}`}
              />
            ) : (
              /* No uploaded wordmark yet — a typographic one keeps the intro intact
                 for any client the moment their projects exist. */
              <span
                className={`font-bold tracking-[0.2em] text-[#f5f3ee] ${isMobile && stage !== "logo" ? "text-xl" : "text-5xl sm:text-6xl"}`}
              >
                {brand.name}°
              </span>
            )}
          </div>
          <span
            className={`font-mono uppercase tracking-[0.4em] text-[#8fa69e] transition-opacity delay-500 duration-1000 ${
              logoVisible ? "opacity-100" : "opacity-0"
            } ${isMobile && stage !== "logo" ? "text-[7px] tracking-[0.25em]" : "text-[10px]"}`}
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

      {/* Real DP aerial video — Zoya-only real asset for now; no fabricated footage for
          other projects, they just show the live satellite map underneath instead. */}
      {stage === "hero" && activeProjectId === ZOYA.id && !heroVideoFailed && (
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
          a manual zoom-in/out during "split" fades it rather than popping it. Hidden on
          mobile: the logo panel above already stays pinned top-CENTER there instead of
          sliding away, so this would just be a second, redundant logo. */}
      {stage !== "logo" && !isMobile && (
        <div
          className={`pointer-events-none absolute left-5 top-5 z-20 transition-opacity duration-500 ${
            showBrandMark ? "opacity-100" : "opacity-0"
          }`}
        >
          {brand.logoUrl ? (
            <Image src={brand.logoUrl} alt={brand.name} width={378} height={157} className="h-5 w-auto opacity-90" />
          ) : (
            <span className="text-sm font-bold tracking-[0.2em] text-[#f5f3ee] opacity-90">{brand.name}°</span>
          )}
        </div>
      )}

      {/* Global, persisted default imagery source — applies everywhere (including the intro
          globe), unlike the journey-only toggle below. Right-anchored, stacked below the LMD
          Projects switcher (right-5 top-5) and the per-stage coordinate/status pill (right-5
          top-16) — the left side is where the masterplan calibration tools live. */}
      {toolsEnabled && (
        <button
          onClick={toggleDefaultImagery}
          disabled={defaultImagerySaving}
          className="absolute right-5 top-28 z-20 rounded-full border border-white/15 bg-[#0a1614]/90 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee] backdrop-blur transition-colors hover:border-white/40 disabled:opacity-50"
        >
          {defaultImagerySaving ? "Saving…" : `Default Imagery: ${defaultImagery === "esri" ? "Esri (all visitors)" : "Mapbox (all visitors)"}`}
        </button>
      )}

      {/* Global, persisted (Edge Config, shared by every visitor) journey imagery source —
          distinct from the default-imagery toggle above: this one is ToS-risky (Google),
          journey-stages-only, and independent of it. */}
      {toolsEnabled && (
        <button
          onClick={toggleJourneySource}
          disabled={journeySourceSaving}
          className="absolute right-5 top-40 z-20 rounded-full border border-white/15 bg-[#0a1614]/90 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee] backdrop-blur transition-colors hover:border-white/40 disabled:opacity-50"
        >
          {journeySourceSaving ? "Saving…" : `Journey Imagery: ${journeySource === "google" ? "Google (all visitors)" : "Mapbox (all visitors)"}`}
        </button>
      )}

      {/* Project switcher — real LMD roster, grouped by country; only Zoya is a real
          interactive experience today, everything else says so honestly instead of faking it. */}
      {showSwitcherTrigger && (
        <div className="absolute right-5 top-5 z-20">
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            className="rounded-full border border-white/15 bg-[#0a1614]/90 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee] backdrop-blur transition-colors hover:border-white/40"
          >
            {brand.name} Projects {switcherOpen ? "▴" : "▾"}
          </button>

          {switcherOpen && (
            <div className="absolute right-0 top-11 max-h-[70vh] w-64 overflow-y-auto rounded-lg border border-white/15 bg-[#0a1614]/97 p-3 shadow-2xl backdrop-blur">
              {countries.map((country) => {
                const projects = roster.filter((p) => p.country === country);
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
                          {p.href && selectedPinId === p.id && (
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
          // On mobile this sits bottom-center instead of vertically centered at left:68% —
          // the globe now stays centered too (see sidePadding above), so there's no side
          // column reserved for it, and a shrink-to-fit box anchored only by `left` clamps
          // to a tiny width on a narrow phone (see the old comment this replaced) whether or
          // not the globe makes room. sm: restores the original desktop composition.
          className="absolute inset-x-4 bottom-[calc(7rem+env(safe-area-inset-bottom))] top-auto z-30 flex max-w-md flex-col items-center gap-4 text-center transition-opacity duration-500 sm:inset-x-auto sm:bottom-auto sm:left-[68%] sm:top-1/2 sm:w-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:items-start sm:text-left"
          style={{ opacity: focusPanelVisible ? 1 : 0 }}
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
            // Was `hidden sm:flex` — invisible on mobile entirely. A fixed-width centered
            // flex row has nowhere to put 3 thumbnails on a 375px screen without colliding
            // with the coming-soon panel below, so it's a horizontally-scrollable strip
            // there instead (inset-x-4, its own bounded width) and only becomes the
            // intrinsic-width centered row once there's room, at sm:.
            <div className="absolute inset-x-4 bottom-24 flex gap-2 overflow-x-auto sm:inset-x-auto sm:left-1/2 sm:w-auto sm:-translate-x-1/2 sm:overflow-visible">
              {["Aerial view", "Site overview", "Community"].map((label) => (
                // eslint-disable-next-line @next/next/no-img-element -- generated data: URI, next/image optimization doesn't apply
                <img
                  key={label}
                  src={placeholderPhoto(`${selectedPinId}-${label}`, label)}
                  alt={`${selectedProject?.name} — placeholder, real photography pending`}
                  className="h-14 w-20 shrink-0 rounded border border-white/10 object-cover"
                />
              ))}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-[calc(2rem+env(safe-area-inset-bottom))] flex flex-col items-center gap-3">
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
            {activeProject.lat.toFixed(4)}°N, {Math.abs(activeProject.lng).toFixed(4)}°E
          </div>

          <div className="absolute inset-x-0 bottom-[calc(2rem+env(safe-area-inset-bottom))] flex flex-col items-center gap-4">
            <button
              onClick={openMasterplan}
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
          {/* One row spanning the full width (left-5 to right-5), not two independently-
              positioned absolute blocks — two blocks left the status pill overlapping (and
              blocking clicks on) "← Overview" on mobile. On mobile it's a single
              horizontally-scrollable strip (no-scrollbar, shrink-0 items) instead of
              wrapping to 2-3 stacked rows of pills, which ate a large chunk of the screen
              before any masterplan was visible; sm: restores the wrapped desktop layout,
              which has the width to spare. */}
          <div className="no-scrollbar absolute left-5 right-5 top-16 flex flex-nowrap items-center gap-3 overflow-x-auto sm:flex-wrap sm:overflow-visible">
            <button
              onClick={backToOverview}
              className="shrink-0 rounded-full border border-white/15 bg-[#0a1614]/90 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee] backdrop-blur hover:border-white/40"
            >
              ← Overview
            </button>
            {masterplanMode === "3d" && (
              <span className="shrink-0 rounded-full border border-white/10 bg-[#0a1614]/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8fa69e] backdrop-blur">
                {masterplanLoading
                  ? `Loading model… ${Math.round(masterplanProgress * 100)}%`
                  : `${buildings.length} buildings mapped`}
              </span>
            )}
            {/* Only worth offering when both a real branded graphic and a real calibrated
                model exist — Zoya today. A project with just one (BEC, so far) has nothing
                to switch to. */}
            {activeProject.masterplanImage && activeProject.model && (
              <button
                onClick={toggleMasterplanMode}
                className="shrink-0 rounded-full border border-white/15 bg-[#0a1614]/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee] backdrop-blur hover:border-white/40"
              >
                {masterplanMode === "2d" ? "View in 3D" : "View 2D Masterplan"}
              </button>
            )}
            {(activeProject.masterplanImage || activeProject.model) && (
              <button
                onClick={toggleTopView}
                className="shrink-0 rounded-full border border-white/15 bg-[#0a1614]/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee] backdrop-blur hover:border-white/40"
              >
                {topView ? "Perspective View" : "Top View"}
              </button>
            )}
            {toolsEnabled && !drawMode && (activeProject.model || activeProject.masterplanImage) && (
              <button
                onClick={startDrawing}
                className="shrink-0 rounded-full border border-white/15 bg-[#0a1614]/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee] backdrop-blur hover:border-white/40"
              >
                Draw Boundary
              </button>
            )}
            <div className="shrink-0 rounded-full border border-white/10 bg-[#0a1614]/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8fa69e] backdrop-blur sm:ml-auto">
              {activeProject.name} · Interactive Masterplan
            </div>
          </div>

          {/* Drawing toolbar — click the map to trace the real site outline, top-down
              (see startDrawing) so it's easy to place points accurately. */}
          {toolsEnabled && drawMode && (
            <div className="absolute inset-x-0 bottom-8 z-20 flex justify-center">
              <div className="flex items-center gap-3 rounded-full border border-white/15 bg-[#0a1614]/95 px-4 py-2.5 backdrop-blur">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8fa69e]">
                  Click the map to trace {activeProject.name}&apos;s boundary — {drawPoints.length} point
                  {drawPoints.length === 1 ? "" : "s"}
                  {drawPoints.length < 3 && " (need 3+)"}
                </span>
                <button
                  onClick={undoDrawPoint}
                  disabled={drawPoints.length === 0}
                  className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8fa69e] hover:text-[#f5f3ee] disabled:opacity-30"
                >
                  Undo
                </button>
                <button
                  onClick={cancelDrawing}
                  className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8fa69e] hover:text-[#f5f3ee]"
                >
                  Cancel
                </button>
                <button
                  onClick={finishDrawing}
                  disabled={drawPoints.length < 3}
                  className="rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#070f0d] disabled:opacity-30"
                  style={{ backgroundColor: ACCENT }}
                >
                  Finish
                </button>
              </div>
            </div>
          )}

          {/* Boundary result — apply it to whichever masterplan(s) exist for this project;
              the numbers are also copyable to hardcode permanently in PROJECTS. */}
          {toolsEnabled && boundaryResult && !drawMode && (
            <div className="absolute left-5 top-32 w-64 rounded-lg border border-white/15 bg-[#0a1614]/95 p-3 text-[11px] backdrop-blur">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee]">Boundary captured</div>
              <div className="mb-3 font-mono text-[10px] text-[#8fa69e]">
                {Math.round(boundaryResult.rect.width)}m × {Math.round(boundaryResult.rect.height)}m, rotation{" "}
                {Math.round(boundaryResult.rect.angleDeg)}°
              </div>
              <div className="space-y-1.5">
                {activeProject.model && (
                  <button
                    onClick={applyBoundaryTo3D}
                    className="w-full rounded bg-white/10 px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-[#f5f3ee] hover:bg-white/20"
                  >
                    Apply to 3D Model
                  </button>
                )}
                {activeProject.masterplanImage && (
                  <button
                    onClick={applyBoundaryToImage}
                    className="w-full rounded bg-white/10 px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-[#f5f3ee] hover:bg-white/20"
                  >
                    Apply to Masterplan Image
                  </button>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => navigator.clipboard.writeText(`boundary: ${JSON.stringify(drawPoints)},`)}
                    className="flex-1 rounded bg-white/10 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#f5f3ee] hover:bg-white/20"
                  >
                    Copy polygon
                  </button>
                  <button
                    onClick={clearBoundary}
                    className="rounded px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#8fa69e] hover:text-[#f5f3ee]"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Manual fine-tuning — nudge/rotate/resize, available any time (not just after a
              boundary fit). Resize always scales width & height (or 3D scale) together, so
              this can't stretch the image the way independent width/height entry did. */}
          {toolsEnabled && !drawMode && (masterplanMode === "2d" ? activeProject.masterplanImage : activeProject.model) && (
            <div
              className="absolute w-52 rounded-lg border border-white/15 bg-[#0a1614]/95 p-3 text-[11px] backdrop-blur"
              style={{ left: 20, top: boundaryResult ? 300 : 128 }}
            >
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f5f3ee]">Adjust position</div>
              <div className="mb-3 grid grid-cols-3 gap-1">
                <div />
                <button
                  onClick={() => (masterplanMode === "2d" ? nudgeImage(0, 5) : nudge3D(0, 5))}
                  className="rounded bg-white/10 py-1.5 text-[#f5f3ee] hover:bg-white/20"
                >
                  ↑
                </button>
                <div />
                <button
                  onClick={() => (masterplanMode === "2d" ? nudgeImage(-5, 0) : nudge3D(-5, 0))}
                  className="rounded bg-white/10 py-1.5 text-[#f5f3ee] hover:bg-white/20"
                >
                  ←
                </button>
                <div className="flex items-center justify-center font-mono text-[9px] text-[#556661]">move</div>
                <button
                  onClick={() => (masterplanMode === "2d" ? nudgeImage(5, 0) : nudge3D(5, 0))}
                  className="rounded bg-white/10 py-1.5 text-[#f5f3ee] hover:bg-white/20"
                >
                  →
                </button>
                <div />
                <button
                  onClick={() => (masterplanMode === "2d" ? nudgeImage(0, -5) : nudge3D(0, -5))}
                  className="rounded bg-white/10 py-1.5 text-[#f5f3ee] hover:bg-white/20"
                >
                  ↓
                </button>
                <div />
              </div>
              <div className="mb-2 flex items-center justify-between gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#8fa69e]">Size</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => (masterplanMode === "2d" ? resizeImage(0.95) : resize3D(0.95))}
                    className="rounded bg-white/10 px-2.5 py-1 text-[#f5f3ee] hover:bg-white/20"
                  >
                    −
                  </button>
                  <button
                    onClick={() => (masterplanMode === "2d" ? resizeImage(1.05) : resize3D(1.05))}
                    className="rounded bg-white/10 px-2.5 py-1 text-[#f5f3ee] hover:bg-white/20"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="mb-3 flex items-center justify-between gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#8fa69e]">Rotate</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => (masterplanMode === "2d" ? rotateImage(-1) : rotate3D(-1))}
                    className="rounded bg-white/10 px-2.5 py-1 text-[#f5f3ee] hover:bg-white/20"
                  >
                    ↺
                  </button>
                  <button
                    onClick={() => (masterplanMode === "2d" ? rotateImage(1) : rotate3D(1))}
                    className="rounded bg-white/10 px-2.5 py-1 text-[#f5f3ee] hover:bg-white/20"
                  >
                    ↻
                  </button>
                </div>
              </div>
              <div className="mb-2 font-mono text-[9px] leading-relaxed text-[#556661]">
                {masterplanMode === "2d"
                  ? `${calibImage.widthMeters}×${calibImage.heightMeters}m · ${calibImage.rotationDeg}° · E${calibImage.offsetE} N${calibImage.offsetN}`
                  : `scale ${calib3D.scale} · ${calib3D.rotationDeg}° · E${calib3D.offsetE} N${calib3D.offsetN}`}
              </div>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(
                    masterplanMode === "2d"
                      ? `masterplanImage: { url: "...", params: ${JSON.stringify(calibImage)} },`
                      : `modelCalibration: ${JSON.stringify(calib3D)},`
                  )
                }
                className="w-full rounded bg-white/10 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#f5f3ee] hover:bg-white/20"
              >
                Copy config
              </button>
            </div>
          )}

          {/* Prominent, real-progress feedback — the top-left badge alone was too easy to
              miss while the camera is mid-flyTo; on a slow connection the 28MB model load
              read as "nothing happened" rather than "loading". */}
          {masterplanMode === "3d" && masterplanLoading && (
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

    </div>
  );
}

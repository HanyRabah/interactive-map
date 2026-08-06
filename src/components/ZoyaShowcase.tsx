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

import { useEffect, useRef, useState } from "react";
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
import { haversineKm } from "./boundary";
import { PROJECTS } from "./GlobePortfolioMap";
import { ZoyaAsset } from "./ZoyaAsset";
import { ZOYA_HERO_VIDEO, ZOYA_AERIAL_PHOTOS, ZOYA_AERIAL_DIR } from "@/data/zoyaMedia";
import { LMD_PROJECTS } from "@/data/lmdProjects";

const ZOYA = PROJECTS.find((p) => p.id === "zoya-ghazala-bay")!;
const CALIB: MasterplanParams = ZOYA.modelCalibration ?? { scale: 1, rotationDeg: 0, offsetE: 0, offsetN: 0, offsetUp: 0 };

// Zoya's own campaign color (LMD's real embroidered "ZOYA" wordmark, lmd.com.eg/en) — not
// an invented accent. LMD's own brand mark is plain black/white; this teal is Zoya-specific.
const ACCENT = "#1c93a0";

// Real, public landmark coordinates — distances below are computed (haversine, straight
// line), never asserted drive times we have no source for.
const LANDMARKS = [
  { name: "Cairo", lng: 31.2357, lat: 30.0444 },
  { name: "Cairo Int'l Airport", lng: 31.4056, lat: 30.1219 },
  { name: "Alexandria (Borg El Arab)", lng: 29.6966, lat: 30.9175 },
  { name: "New Alamein City", lng: 28.8667, lat: 30.9333 },
] as const;
const DISTANCES = LANDMARKS.map((l) => ({
  ...l,
  km: Math.round(haversineKm([ZOYA.lng, ZOYA.lat], [l.lng, l.lat])),
}));

const COUNTRIES_ORDER = ["Egypt", "UAE", "Spain", "Greece"] as const;

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
const HERO_CENTER: [number, number] = [ZOYA.lng, ZOYA.lat];
// Lower pitch than a typical "cinematic" establishing shot on purpose: at this specific
// coastal anchor point, a steep pitch put most of the frame over open sea/sky instead of
// the actual textured coastline — verified by screenshot, not assumed.
const HERO_VIEW = { zoom: 14.1, pitch: 42, bearing: -12 };
const MASTERPLAN_VIEW = { zoom: 17.2, pitch: 58, bearing: -20 };

type Stage = "logo" | "globe" | "flight" | "hero" | "masterplan";

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
  const [loaded, setLoaded] = useState(false);
  const [heroVideoFailed, setHeroVideoFailed] = useState(false);
  const [heroVideoVisible, setHeroVideoVisible] = useState(false);
  const [sunElevation, setSunElevation] = useState(85);
  const [buildings, setBuildings] = useState<{ name: string; lngLat: [number, number] }[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherNotice, setSwitcherNotice] = useState<string | null>(null);

  // Logo entrance: fade/scale in, hold, then advance to the globe on its own — or skip on click.
  useEffect(() => {
    if (stage !== "logo") return;
    const inTimer = window.setTimeout(() => setLogoVisible(true), 60);
    const advanceTimer = window.setTimeout(() => setStage("globe"), 2800);
    return () => {
      window.clearTimeout(inTimer);
      window.clearTimeout(advanceTimer);
    };
  }, [stage]);

  useEffect(() => {
    stageRef.current = stage;
    if (stage !== "hero") {
      setHeroVideoVisible(false);
      return;
    }
    const t = window.setTimeout(() => setHeroVideoVisible(true), 400);
    return () => window.clearTimeout(t);
  }, [stage]);

  // day/night: sweep the masterplan lights, the shader tint, and the map fog off one control
  useEffect(() => {
    const t = Math.max(0, Math.min(90, sunElevation)) / 90;
    masterplanLayer.current?.setSunElevation(sunElevation);
    atmosphere.current?.setSunT(t);
    map.current?.setFog(fogFor(t));
  }, [sunElevation]);

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
      m.setFog(fogFor(sunElevation / 90));
      const atmosphereLayer = createAtmosphereLayer("atmosphere");
      m.addLayer(atmosphereLayer);
      atmosphere.current = atmosphereLayer;
      setLoaded(true);
    });

    m.on("mousedown", () => (spinning.current = false));
    m.on("dragstart", () => (spinning.current = false));

    let rafId: number;
    const tick = () => {
      if (spinning.current && (stageRef.current === "logo" || stageRef.current === "globe") && !m.isMoving()) {
        const c = m.getCenter();
        m.easeTo({ center: [c.lng + 0.2, c.lat], duration: 100, easing: (n) => n });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; reads refs fresh at call time
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

  function beginFlight() {
    if (!map.current) return;
    setSwitcherOpen(false);
    spinning.current = false;
    setStage("flight");
    atmosphereTarget.current = 0.6;
    map.current.flyTo({
      center: HERO_CENTER,
      zoom: HERO_VIEW.zoom,
      pitch: HERO_VIEW.pitch,
      bearing: HERO_VIEW.bearing,
      duration: 4200,
      essential: true,
    });
    window.setTimeout(() => setStage("hero"), 4300);
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
      duration: 2400,
    });
    if (!masterplanLayer.current) {
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
        }
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
    m.flyTo({ center: HERO_CENTER, zoom: HERO_VIEW.zoom, pitch: HERO_VIEW.pitch, bearing: HERO_VIEW.bearing, duration: 2000 });
    setStage("hero");
  }

  function goToProject(id: string) {
    if (id === "zoya") {
      setSwitcherOpen(false);
      if (stage === "globe" || stage === "logo") beginFlight();
      else if (stage === "masterplan") backToOverview();
      return;
    }
    const name = LMD_PROJECTS.find((p) => p.id === id)?.name ?? "This project";
    setSwitcherNotice(`${name} — full interactive experience coming soon`);
    window.setTimeout(() => setSwitcherNotice(null), 2600);
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

  const showBrandMark = stage !== "logo";
  const showSwitcherTrigger = stage !== "logo";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#070f0d] font-sans text-[#f5f3ee]">
      {/* mapbox-gl.css sets .mapboxgl-map { position: relative } on whatever element becomes
          the container — that collides with an "absolute" class at equal specificity and can
          win the cascade, collapsing this to height:0. Wrap it instead of positioning it directly. */}
      <div className="absolute inset-0">
        <div ref={mapContainer} className="h-full w-full" />
      </div>

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

      {/* LOGO — LMD's real wordmark, first thing shown, on the same dark ground the globe
          fades in behind so the cross-fade never flashes a color change. */}
      {stage === "logo" && MAPBOX_TOKEN && (
        <button
          onClick={() => setStage("globe")}
          aria-label="Skip intro"
          className={`absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[#070f0d] transition-opacity duration-700 ${
            logoVisible ? "opacity-100" : "opacity-0"
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
        </button>
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
          its own mark pinned in their site nav. */}
      {showBrandMark && (
        <div className="pointer-events-none absolute left-5 top-5 z-20">
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
                          {p.href && p.id === "zoya" && stage !== "globe" && (
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

      {/* GLOBE — no invented wordmark here; just LMD's real mark (top-left, above) and a
          plain black/white CTA in the same monochrome the logo itself uses. */}
      {stage === "globe" && loaded && MAPBOX_TOKEN && (
        <div className="absolute inset-x-0 bottom-16 flex flex-col items-center gap-4 sm:bottom-20">
          <button
            onClick={beginFlight}
            className="rounded-full border border-white bg-white/5 px-8 py-3 font-mono text-[12px] uppercase tracking-[0.3em] text-white backdrop-blur transition-colors hover:bg-white hover:text-[#070f0d]"
          >
            Start the Journey
          </button>
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#6b7d78]">Zoya · Ghazala Bay, Egypt</span>
        </div>
      )}

      {/* HERO */}
      {(stage === "hero" || stage === "flight") && (
        <>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div
              className={`flex flex-col items-center gap-3 text-center transition-all duration-1000 ${
                stage === "hero" ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              }`}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#8fa69e] [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]">
                LMD presents
              </span>
              <span className="text-[20vw] font-semibold leading-none tracking-tight text-[#f5f3ee] drop-shadow-[0_4px_40px_rgba(0,0,0,0.5)] sm:text-[10rem]">
                ZOYA
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.35em] [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]"
                style={{ color: ACCENT }}
              >
                Ghazala Bay · North Coast, Egypt
              </span>
            </div>
          </div>

          {stage === "hero" && (
            <>
              {/* Location intelligence — held in a solid card, never bare text over the terrain */}
              <div className="absolute left-5 top-16 hidden w-64 rounded-lg border border-white/10 bg-[#0a1614]/90 p-3 backdrop-blur sm:block">
                <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[#f5f3ee]">Location intelligence</div>
                <div className="flex flex-col gap-2">
                  {DISTANCES.map((d) => (
                    <div key={d.name} className="flex flex-col">
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8fa69e]">{d.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: ACCENT }}>
                        ≈ {d.km} km
                      </span>
                    </div>
                  ))}
                </div>
              </div>

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
              {buildings.length > 0 ? `${buildings.length} buildings mapped` : "Loading model…"}
            </span>
          </div>

          <div className="absolute right-5 top-16 rounded-full border border-white/10 bg-[#0a1614]/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8fa69e] backdrop-blur">
            ZOYA · Interactive Masterplan
          </div>

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

      {/* Day / night — the one control that sweeps light, shader tint, and fog together */}
      {(stage === "hero" || stage === "masterplan") && (
        <div className="absolute bottom-5 right-5 flex items-center gap-3 rounded-full border border-white/10 bg-[#0a1614]/90 px-4 py-2 backdrop-blur">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8fa69e]">
            {sunElevation < 15 ? "Night" : sunElevation < 30 ? "Dusk" : "Day"}
          </span>
          <input
            type="range"
            min={0}
            max={90}
            value={sunElevation}
            onChange={(e) => setSunElevation(Number(e.target.value))}
            className="h-1 w-28 cursor-pointer"
            style={{ accentColor: ACCENT }}
            aria-label="Time of day"
          />
        </div>
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

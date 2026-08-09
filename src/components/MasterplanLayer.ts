import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import mapboxgl from "mapbox-gl";

export type MasterplanModel = {
  url: string;
};

export type MasterplanParams = {
  /** Uniform scale applied on top of auto-fit. 1 = no extra adjustment. */
  scale: number;
  /** Rotation around the vertical axis, in degrees, to align the model to true north. */
  rotationDeg: number;
  /** Meters east of the anchor lng/lat. */
  offsetE: number;
  /** Meters north of the anchor lng/lat. */
  offsetN: number;
  /** Meters above ground — corrects the model's own vertical datum if it isn't 0. */
  offsetUp: number;
};

export const DEFAULT_MASTERPLAN_PARAMS: MasterplanParams = {
  scale: 1,
  rotationDeg: 0,
  offsetE: 0,
  offsetN: 0,
  offsetUp: 0,
};

/** A real named mesh/group from the GLB whose name matched /building/i — never invented data. */
export type MasterplanBuilding = {
  name: string;
  /** Center in the model's own recentered local units (same frame applyParams transforms), pre-scale/rotation/offset. */
  localCenter: [number, number, number];
};

export interface MasterplanLayer extends mapboxgl.CustomLayerInterface {
  setParams(params: MasterplanParams): void;
  /** 0 = night, ~15 = dawn/dusk gold, 90 = midday — drives light color/intensity only, never direction (geometry was hand-tuned against real satellite imagery). */
  setSunElevation(elevationDeg: number): void;
}

const NIGHT_SUN = new THREE.Color(0x1a2340);
const DAWN_SUN = new THREE.Color(0xffb86b);
const DAY_SUN = new THREE.Color(0xfff4e0);
const NIGHT_SKY = new THREE.Color(0x0a0e1a);
const DAY_SKY = new THREE.Color(0xbfd9ff);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");

// Source export carries no colors/textures at all (raw CAD "fallback Material" only —
// confirmed via gltf-transform inspect, every material comes back unnamed/uncolored).
// The mesh names themselves are real though (ASPHALT, VRayProxy_Building A, CABANA,
// "Glass Edit", FOREST, etc.), so approximate real materials by category instead of
// rendering everything the same flat gray.
const materialCache = new Map<string, THREE.Material>();
function materialFor(name: string): THREE.Material {
  const n = name.toLowerCase();
  let key: string;
  if (n.includes("asphalt") || n.includes("curb")) key = "road";
  else if (n.includes("glass")) key = "glass";
  else if (
    n.includes("forest") ||
    n.includes("tropical") ||
    n.includes("ground cover") ||
    n.includes("cocos") ||
    n.includes("plant")
  )
    key = "vegetation";
  else key = "building";

  const cached = materialCache.get(key);
  if (cached) return cached;

  const material =
    key === "road"
      ? new THREE.MeshStandardMaterial({
          color: 0x3a3a3e,
          roughness: 0.95,
          metalness: 0,
        })
      : key === "glass"
        ? new THREE.MeshStandardMaterial({
            color: 0xa8d8e8,
            roughness: 0.1,
            metalness: 0.3,
            transparent: true,
            opacity: 0.55,
          })
        : key === "vegetation"
          ? new THREE.MeshStandardMaterial({
              color: 0x4a7c3f,
              roughness: 0.9,
              metalness: 0,
            })
          : new THREE.MeshStandardMaterial({
              color: 0xe4dcc8,
              roughness: 0.8,
              metalness: 0.02,
            });

  materialCache.set(key, material);
  return material;
}

// Anchors a Three.js scene to an exact lng/lat using Mapbox's CustomLayerInterface.
// Mapbox hands the layer its camera projection matrix every frame (render(gl, matrix));
// multiplying that by a model matrix built from MercatorCoordinate is what makes the
// scene track the map's pan/zoom/tilt/rotate in real time instead of floating separately.
export function createMasterplanLayer(
  id: string,
  lng: number,
  lat: number,
  altitude = 0,
  model?: MasterplanModel,
  initialParams: MasterplanParams = DEFAULT_MASTERPLAN_PARAMS,
  onModelLoaded?: (
    footprint: { width: number; depth: number },
    buildings: MasterplanBuilding[],
  ) => void,
  onProgress?: (fraction: number) => void,
): MasterplanLayer {
  const modelTransform = mapboxgl.MercatorCoordinate.fromLngLat(
    [lng, lat],
    altitude,
  );
  const mercatorScale = modelTransform.meterInMercatorCoordinateUnits();

  let camera: THREE.Camera;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let holder: THREE.Group | null = null;
  let sun: THREE.DirectionalLight;
  let fill: THREE.DirectionalLight;
  let hemi: THREE.HemisphereLight;

  function applyParams(p: MasterplanParams) {
    if (!holder) return;
    holder.position.set(p.offsetE, p.offsetUp, p.offsetN);
    holder.rotation.y = (p.rotationDeg * Math.PI) / 180;
    holder.scale.setScalar(p.scale);
  }

  function applySunElevation(elevationDeg: number) {
    if (!sun || !fill || !hemi) return;
    const t = Math.max(0, Math.min(90, elevationDeg)) / 90;
    sun.color.copy(
      t < 1 / 6
        ? NIGHT_SUN.clone().lerp(DAWN_SUN, t / (1 / 6))
        : DAWN_SUN.clone().lerp(DAY_SUN, (t - 1 / 6) / (5 / 6)),
    );
    sun.intensity = 0.12 + t * 1.03;
    fill.intensity = 0.05 + t * 0.3;
    hemi.color.copy(NIGHT_SKY.clone().lerp(DAY_SKY, t));
    hemi.intensity = 0.15 + t * 0.45;
  }

  return {
    id,
    type: "custom",
    renderingMode: "3d",

    setParams(p: MasterplanParams) {
      applyParams(p);
    },

    setSunElevation(deg: number) {
      applySunElevation(deg);
    },

    onAdd(map, gl) {
      camera = new THREE.Camera();
      scene = new THREE.Scene();

      // Sky/ground hemisphere for soft ambient color instead of a flat white wash,
      // plus a stronger key light and a dim opposite-side fill so facing surfaces
      // aren't uniformly lit (that flatness read as "grayed out"). Direction stays
      // fixed (hand-tuned against real satellite imagery); setSunElevation only
      // ever varies color/intensity, never position.
      hemi = new THREE.HemisphereLight(0xbfd9ff, 0x554433, 0.6);
      scene.add(hemi);
      sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
      sun.position.set(0, -70, 100).normalize();
      scene.add(sun);
      fill = new THREE.DirectionalLight(0xdbe8ff, 0.35);
      fill.position.set(0, -40, -80).normalize();
      scene.add(fill);

      holder = new THREE.Group();
      scene.add(holder);

      if (model) {
        // Real georeferenced masterplan export. Source CAD files carry no geographic
        // reference, so scale/rotation/offset are best-effort until checked against
        // satellite imagery — use the live calibration panel to tune them per project.
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        loader.load(
          model.url,
          (gltf) => {
            const root = gltf.scene;

            // Collect real building nodes by name before recentering (see below) — first
            // match per unique name wins, since a parent "Building A" group's descendants
            // often repeat "Building A" in their own names and would otherwise double-count.
            const seenNames = new Set<string>();
            const rawBuildings: MasterplanBuilding[] = [];
            root.traverse((obj) => {
              if (obj instanceof THREE.Mesh)
                obj.material = materialFor(obj.name);
              if (/building/i.test(obj.name) && !seenNames.has(obj.name)) {
                seenNames.add(obj.name);
                const bbox = new THREE.Box3().setFromObject(obj);
                if (!bbox.isEmpty()) {
                  const c = bbox.getCenter(new THREE.Vector3());
                  rawBuildings.push({
                    name: obj.name,
                    localCenter: [c.x, c.y, c.z],
                  });
                }
              }
            });

            const box = new THREE.Box3().setFromObject(root);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const buildings: MasterplanBuilding[] = rawBuildings.map((b) => ({
              name: b.name,
              localCenter: [
                b.localCenter[0] - center.x,
                b.localCenter[1],
                b.localCenter[2] - center.z,
              ],
            }));
            onModelLoaded?.({ width: size.x, depth: size.z }, buildings);
            // Recenter horizontally on the footprint only. Do NOT auto-rest box.min.y at
            // ground: a single outlier low vertex (stray geometry, a dipped terrain patch)
            // drags the whole bounding box and silently lifts the real model far off the
            // ground plane — exactly what caused visible parallax drift here (the box's Y
            // ranged -346 to +40, so resting box.min at 0 floated the actual buildings/roads
            // ~346m above grade). Trust the source file's own Y=0 datum instead, and use
            // modelCalibration.offsetUp in the calibration panel for any real correction.
            root.position.set(-center.x, 0, -center.z);

            holder!.add(root);
            applyParams(initialParams);
            onProgress?.(1);
          },
          (evt) => {
            if (evt.lengthComputable) onProgress?.(evt.loaded / evt.total);
          },
        );
      } else {
        // ponytail: procedural block massing stands in for a real georeferenced
        // masterplan export, used when no model.url is supplied for a project.
        const layout = [
          { x: -40, y: -30, w: 24, d: 24, h: 60 },
          { x: -5, y: -35, w: 20, d: 20, h: 90 },
          { x: 30, y: -25, w: 26, d: 18, h: 45 },
          { x: -35, y: 20, w: 18, d: 18, h: 30 },
          { x: 0, y: 25, w: 30, d: 20, h: 70 },
          { x: 40, y: 15, w: 22, d: 22, h: 55 },
        ];
        const material = new THREE.MeshPhongMaterial({
          color: 0x818cf8,
          opacity: 0.9,
          transparent: true,
        });
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: 0xffffff,
          opacity: 0.5,
          transparent: true,
        });
        for (const b of layout) {
          const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
          const mesh = new THREE.Mesh(geo, material);
          mesh.position.set(b.x, b.h / 2, b.y);
          holder!.add(mesh);
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            edgeMaterial,
          );
          edges.position.copy(mesh.position);
          holder!.add(edges);
        }
        applyParams(initialParams);
      }

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },

    render(gl, matrix) {
      const m = new THREE.Matrix4().fromArray(matrix as unknown as number[]);
      const l = new THREE.Matrix4()
        .makeTranslation(
          modelTransform.x,
          modelTransform.y,
          modelTransform.z ?? 0,
        )
        .scale(new THREE.Vector3(mercatorScale, -mercatorScale, mercatorScale))
        .multiply(
          new THREE.Matrix4().makeRotationAxis(
            new THREE.Vector3(1, 0, 0),
            Math.PI / 2,
          ),
        );

      camera.projectionMatrix = m.multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
      renderer.resetState();
    },
  };
}

// Seeds the Payload CMS with the demo catalog: admin user, clients (LMD, ORA), Zoya's real
// assets, and the LMD roster. Idempotent — safe to re-run after a database reset (it
// registers the first user itself) or against a live DB (existing docs are PATCHed by slug,
// assets reused by filename).
//
// It seeds a STARTING POINT, not the truth: /admin owns the catalog now, so anything added
// or deleted there must not be resurrected here. BEC and LMD New Capital were deleted in
// /admin and are deliberately absent below — don't add a project back without checking.
//
//   node scripts/seed-cms.mjs            (server must be running on :3000)
//
// Roster source: LMD's own public project list (lmd.com.eg), same data that used to live
// hardcoded in src/data/lmdProjects.ts — the CMS owns it now.

import { readFile } from "node:fs/promises";

const BASE = process.env.SEED_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.PAYLOAD_ADMIN_EMAIL || "admin@dp.local";
const PASSWORD = process.env.PAYLOAD_ADMIN_PASSWORD || "cczaanSpFzaL4f";

let token = null;
const authHeaders = () => ({ Authorization: `JWT ${token}` });

async function json(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

async function login() {
  // First-register succeeds only on a fresh DB; either way, log in after.
  await fetch(`${BASE}/payload-api/users/first-register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, "confirm-password": PASSWORD }),
  }).catch(() => {});
  const data = await json(
    await fetch(`${BASE}/payload-api/users/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
  );
  token = data.token;
  console.log(`logged in as ${EMAIL}`);
}

async function findBy(collection, field, value) {
  const q = new URLSearchParams({ [`where[${field}][equals]`]: value, limit: "1" });
  const data = await json(await fetch(`${BASE}/payload-api/${collection}?${q}`, { headers: authHeaders() }));
  return data.docs?.[0] ?? null;
}

async function upsert(collection, field, value, doc) {
  const existing = await findBy(collection, field, value);
  const url = existing
    ? `${BASE}/payload-api/${collection}/${existing.id}`
    : `${BASE}/payload-api/${collection}`;
  const data = await json(
    await fetch(url, {
      method: existing ? "PATCH" : "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(doc),
    })
  );
  console.log(`${existing ? "updated" : "created"} ${collection}/${value} (id ${data.doc.id})`);
  return data.doc;
}

async function uploadAsset(localPath, filename, mime, caption) {
  const existing = await findBy("assets", "filename", filename);
  if (existing) {
    console.log(`asset ${filename} exists (id ${existing.id})`);
    return existing;
  }
  const form = new FormData();
  form.append("file", new Blob([await readFile(localPath)], { type: mime }), filename);
  form.append("_payload", JSON.stringify({ caption }));
  const data = await json(
    await fetch(`${BASE}/payload-api/assets`, { method: "POST", headers: authHeaders(), body: form })
  );
  console.log(`uploaded ${filename} (id ${data.doc.id})`);
  return data.doc;
}

// Zoya's live CRM connection. Sourced from SF_* env vars so a re-seed (or a fresh
// environment) reproduces the Salesforce demo instead of needing a manual PATCH; falls back
// to demo data when they're absent, so the seed still works with no Salesforce org at all.
// This is the per-project multi-tenant path: the global CRM_PROVIDER stays "mock".
function zoyaCrm() {
  const { SF_INSTANCE_URL, SF_CLIENT_ID, SF_CLIENT_SECRET, SF_CURRENCY } = process.env;
  if (!SF_INSTANCE_URL || !SF_CLIENT_ID || !SF_CLIENT_SECRET) {
    console.log("SF_* env vars absent — seeding Zoya with demo inventory");
    return { provider: "mock" };
  }
  return {
    provider: "salesforce",
    salesforce: {
      instanceUrl: SF_INSTANCE_URL,
      clientId: SF_CLIENT_ID,
      clientSecret: SF_CLIENT_SECRET,
      externalProjectId: "zoya",
      currency: SF_CURRENCY || "EGP",
    },
  };
}

const CAL_ZOYA = { scale: 1, rotationDeg: 0, offsetE: -55, offsetN: 537, offsetUp: 0 };
const CAL_ZOYA_LAGOON = { scale: 1, rotationDeg: 0, offsetE: 0, offsetN: 0, offsetUp: 0 };
const ZOYA_BOUNDARY = [
  [28.588756, 31.013028], [28.591625, 31.01253], [28.590335, 31.018742], [28.590467, 31.019031],
  [28.593066, 31.021013], [28.594135, 31.021913], [28.596454, 31.023079], [28.596636, 31.023246],
  [28.599044, 31.023994], [28.599554, 31.024634], [28.598856, 31.025071], [28.598716, 31.025221],
  [28.598674, 31.02534], [28.598255, 31.025807], [28.597788, 31.0261], [28.597048, 31.026824],
  [28.596501, 31.027308], [28.59093, 31.024241], [28.59139, 31.024028], [28.591272, 31.023621],
  [28.590273, 31.023729], [28.589903, 31.022437], [28.587975, 31.022364], [28.588137, 31.021348],
  [28.58864, 31.019333], [28.588675, 31.017476], [28.587879, 31.015681], [28.588277, 31.014311],
];

async function main() {
  await login();

  // The wordmark ships in-repo as a fallback, but the client record is what the pages
  // actually read — seed it so a fresh database is CMS-driven rather than falling back.
  const lmdLogo = await uploadAsset("public/brand/lmd-logo-white.png", "lmd-logo-white.png", "image/png", "LMD wordmark (white, for dark backgrounds)");
  const lmd = await upsert("clients", "slug", "lmd", { slug: "lmd", name: "LMD", logo: lmdLogo.id });
  const ora = await upsert("clients", "slug", "ora", { slug: "ora", name: "ORA Developers" });

  const mpAsset = await uploadAsset("public/media/zoya/masterplan.webp", "masterplan.webp", "image/webp", "Zoya branded masterplan graphic (4096x4096 WebP)");
  const zoyaGlb = await uploadAsset("public/models/zoya-ghazala-bay.glb", "zoya-ghazala-bay.glb", "model/gltf-binary", "Zoya masterplan 3D model (Draco-optimized, 28MB)");
  const lagoonGlb = await uploadAsset("public/models/zoya-lagoon.glb", "zoya-lagoon.glb", "model/gltf-binary", "Zoya lagoon 3D model (Draco-optimized, 18MB)");

  const base = (slug, name, country, countryCode, extras = {}) => ({
    slug, name, country, countryCode,
    client: lmd.id, developer: "LMD",
    crm: { provider: "mock" },
    ...extras,
  });

  // Real interactive projects
  await upsert("projects", "slug", "zoya-ghazala-bay", base("zoya-ghazala-bay", "Zoya Ghazala Bay", "Egypt", "EG", {
    lng: 28.595006, lat: 31.024578, precision: "exact",
    model: zoyaGlb.id, modelCalibration: CAL_ZOYA,
    lagoonModel: lagoonGlb.id, lagoonCalibration: CAL_ZOYA_LAGOON,
    masterplanImage: mpAsset.id,
    masterplanParams: { widthMeters: 1826, heightMeters: 1826, rotationDeg: -0.3, offsetE: -88, offsetN: -498 },
    boundaryPolygon: ZOYA_BOUNDARY,
    crm: zoyaCrm(),
    // Coordinates sourced, not estimated: the airport from its Wikipedia entry
    // (30°55'28"N 28°27'41"E), New Alamein from its own. The site overview routes to these
    // live, so they only need to be the right place — never a distance or a drive time.
    pointsOfInterest: [
      { name: "El Alamein International Airport", category: "airport", lng: 28.46139, lat: 30.92444 },
      { name: "New Alamein City", category: "city", lng: 28.905611, lat: 30.856 },
    ],
  }));
  // LMD's public roster (lmd.com.eg) — honest coming-soon entries until assets exist.
  await upsert("projects", "slug", "one-ninety", base("one-ninety", "One Ninety", "Egypt", "EG", { lng: 31.4025592, lat: 30.0133243, precision: "exact" }));
  await upsert("projects", "slug", "mindset", base("mindset", "Mindset", "Egypt", "EG", { lng: 30.9756, lat: 30.0131, precision: "district" }));
  await upsert("projects", "slug", "8ight", base("8ight", "8ight", "Egypt", "EG")); // area not confirmed — no pin
  await upsert("projects", "slug", "3sixty", base("3sixty", "3'Sixty", "Egypt", "EG", { lng: 31.49, lat: 30.03, precision: "district" }));
  await upsert("projects", "slug", "layan", base("layan", "Layan", "Egypt", "EG")); // area not confirmed — no pin
  await upsert("projects", "slug", "taiyo-residences", base("taiyo-residences", "Taiyo Residences", "UAE", "AE", { lng: 55.14, lat: 25.0805, precision: "city" }));
  await upsert("projects", "slug", "the-pier-residence", base("the-pier-residence", "The Pier Residence", "UAE", "AE", { lng: 55.14, lat: 25.0805, precision: "city" }));
  await upsert("projects", "slug", "rukan-community", base("rukan-community", "Rukan Community", "UAE", "AE", { lng: 55.3708, lat: 25.0378, precision: "district" }));
  await upsert("projects", "slug", "muntaner-91", base("muntaner-91", "Muntaner 91", "Spain", "ES", { lng: 2.1478, lat: 41.3915, precision: "district" }));
  await upsert("projects", "slug", "karaiskaki-15", base("karaiskaki-15", "Karaiskaki 15", "Greece", "GR", { lng: 23.6481, lat: 37.9475, precision: "district" }));

  // ORA
  await upsert("projects", "slug", "bayn-demo", {
    slug: "bayn-demo", name: "Bayn (Demo)", country: "UAE", countryCode: "AE",
    client: ora.id, developer: "ORA",
    lng: 54.85, lat: 24.85, precision: "district",
    crm: { provider: "mock" },
  });

  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

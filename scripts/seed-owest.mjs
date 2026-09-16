// Seeds O West (Orascom Development, 6th of October) into the CMS: the client and its
// lockup, the project with its masterplan and points of interest, and one villa type per
// neighbourhood carrying that neighbourhood's logo, hero, description, brochure and the
// unit designs sold inside it.
//
//   node scripts/seed-owest.mjs            (server must be running on :3000)
//   SEED_BASE_URL=https://… node scripts/seed-owest.mjs
//
// Idempotent: docs are matched by slug/code, assets reused by filename. Zone outlines come
// from scripts/data/owest-zones.json (derived from the per-neighbourhood cutouts on
// owest.com.eg, projected through the masterplan calibration) and are written ONLY where the
// villa type has no polygon yet — anything traced by hand in-app survives a re-seed.
//
// Source: owest.com.eg (robots.txt allows everything; the neighbourhood pages embed their
// full CMS records, which scripts/data/owest-neighborhoods.json is a capture of). Sizes and
// bedroom counts are the developer's own published figures, kept as text because they
// publish ranges ("77 - 195") and mixed types ("1 - 3 Duplex").

import { readFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SEED_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.PAYLOAD_ADMIN_EMAIL || "admin@dp.local";
const PASSWORD = process.env.PAYLOAD_ADMIN_PASSWORD || "cczaanSpFzaL4f";

// Site anchor, supplied by the client (Google Maps pin). Masterplan placement was fitted
// offline against Mapbox satellite and then corrected by the client in-app (?tools=1 →
// Adjust position → Copy config). The outlines in owest-zones.json are projected through
// THESE numbers — change them and re-derive the outlines, or the zones drift off the plan.
const OWEST = { lng: 30.9956521, lat: 29.956439 };
const MASTERPLAN = { widthMeters: 3761, heightMeters: 3147, rotationDeg: 3, offsetE: -675, offsetN: 496 };

// OpenStreetMap coordinates; Mapbox's geocoder has no POI coverage for Egypt.
const POIS = [
  { name: "Mall of Egypt", category: "shopping", lng: 31.0162, lat: 29.9725 },
  { name: "Sphinx International Airport", category: "airport", lng: 30.8816, lat: 30.1092 },
  { name: "Grand Egyptian Museum & Pyramids", category: "landmark", lng: 31.1191, lat: 29.9946 },
  { name: "Cairo International Airport", category: "airport", lng: 31.4246, lat: 30.1141 },
];

let token = null;
const auth = () => ({ Authorization: `JWT ${token}` });

async function json(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

async function login() {
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
  const data = await json(await fetch(`${BASE}/payload-api/${collection}?${q}`, { headers: auth() }));
  return data.docs?.[0] ?? null;
}

async function upsert(collection, field, value, doc) {
  const existing = await findBy(collection, field, value);
  const url = existing ? `${BASE}/payload-api/${collection}/${existing.id}` : `${BASE}/payload-api/${collection}`;
  const data = await json(
    await fetch(url, {
      method: existing ? "PATCH" : "POST",
      headers: { "content-type": "application/json", ...auth() },
      body: JSON.stringify(doc),
    })
  );
  console.log(`${existing ? "updated" : "created"} ${collection}/${value} (id ${data.doc.id})`);
  return data.doc;
}

const MIME = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

async function upload(localPath, caption) {
  const filename = path.basename(localPath);
  const existing = await findBy("assets", "filename", filename);
  if (existing) return existing;
  const form = new FormData();
  form.append("file", new Blob([await readFile(localPath)], { type: MIME[path.extname(filename).toLowerCase()] ?? "application/octet-stream" }), filename);
  form.append("_payload", JSON.stringify({ caption }));
  const data = await json(await fetch(`${BASE}/payload-api/assets`, { method: "POST", headers: auth(), body: form }));
  console.log(`  uploaded ${filename}`);
  return data.doc;
}

async function main() {
  await login();

  const logo = await upload("public/brand/owest-logo-white.png", "O West × Orascom Development lockup (white)");
  const client = await upsert("clients", "slug", "owest", { slug: "owest", name: "O West", logo: logo.id });

  const masterplan = await upload("public/media/owest/masterplan.png", "O West masterplan (owest.com.eg, 1576×1318)");
  const project = await upsert("projects", "slug", "o-west", {
    slug: "o-west",
    name: "O West",
    client: client.id,
    developer: "Orascom Development",
    country: "Egypt",
    countryCode: "EG",
    lng: OWEST.lng,
    lat: OWEST.lat,
    precision: "exact",
    masterplanImage: masterplan.id,
    masterplanParams: MASTERPLAN,
    pointsOfInterest: POIS,
    crm: { provider: "mock" },
    order: 1,
  });

  // Orascom's other destinations: pinned on the globe and listed in the switcher, no
  // journey yet — no masterplan or model means they show as coming soon.
  for (const [i, d] of [
    { slug: "makadi-heights", name: "Makadi Heights", lng: 33.8880241, lat: 26.9715437 },
    { slug: "el-gouna", name: "El Gouna", lng: 33.6601748, lat: 27.402723 },
  ].entries()) {
    await upsert("projects", "slug", d.slug, {
      ...d,
      client: client.id,
      developer: "Orascom Development",
      country: "Egypt",
      countryCode: "EG",
      precision: "exact",
      crm: { provider: "mock" },
      order: i + 2,
    });
  }

  const hoods = JSON.parse(await readFile("scripts/data/owest-neighborhoods.json", "utf8"));
  const zones = JSON.parse(await readFile("scripts/data/owest-zones.json", "utf8"));
  const dir = "public/media/owest/neighborhoods";
  for (const h of hoods) {
    const hLogo = h.logoFile ? await upload(path.join(dir, h.logoFile), `${h.name} logo`) : null;
    const hero = h.galleryFiles?.[0] ? await upload(path.join(dir, h.galleryFiles[0]), `${h.name} — hero`) : null;
    const variants = [];
    for (const u of h.units) {
      const img = u.imageFile ? await upload(path.join(dir, u.imageFile), `${h.name} — ${u.name}`) : null;
      variants.push({
        name: u.name,
        unitType: u.unitType || undefined,
        sizeText: u.sqm || undefined,
        bedroomsText: u.bedrooms && u.bedrooms !== "-" ? u.bedrooms : undefined,
        bathroomsText: u.bathrooms && u.bathrooms !== "-" && u.bathrooms !== "0" ? u.bathrooms : undefined,
        image: img?.id,
      });
    }
    const code = `owest-${h.slug}`;
    const existingType = await findBy("villaTypes", "code", code);
    await upsert("villaTypes", "code", code, {
      project: project.id,
      code,
      area: h.name, // one zone per neighbourhood: the neighbourhood is its own area
      name: h.name,
      logo: hLogo?.id,
      image: hero?.id,
      description: h.description || undefined,
      brochureUrl: h.brochure || undefined,
      variants,
      ...(existingType?.polygon || !zones[code] ? {} : { polygon: zones[code] }),
    });
  }

  console.log(`\nO West seeded: 1 client, 1 project, ${hoods.length} neighbourhoods, ${hoods.reduce((a, h) => a + h.units.length, 0)} unit designs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

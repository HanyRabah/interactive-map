// Seeds il Cazar Developments into the CMS: the client and its lockup, "The Crest" as the
// flagship with a real masterplan and five product-mode zones (one per unit category it
// actually sells), and the developer's other ten projects as coming-soon pins (no masterplan
// yet, same as Orascom's Makadi Heights / El Gouna).
//
//   node scripts/seed-ilcazar.mjs            (server must be running on :3000)
//   SEED_BASE_URL=https://… node scripts/seed-ilcazar.mjs
//
// Idempotent: docs are matched by slug/code, assets reused by filename.
//
// Source: ilcazar.com/projects (robots.txt allows everything). The Crest's masterplan image
// and zone names ("The Signature Ville", "CrestVille", "Crestonia", "Crestside",
// "Crestfield") are the developer's own, scraped from ilcazar.com/the-crest/. Coordinates for
// every project are Google Maps pins for the project's own listing (not geocoded from the
// address text). Unit sizes, prices and availability are demo figures — bedroom counts per
// zone are the developer's own published figures.
//
// The Crest's masterplanParams were fitted in-app against Mapbox satellite imagery
// (?tools=1 → Adjust position → Copy config).

import { readFile } from "node:fs/promises";

const BASE = process.env.SEED_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.PAYLOAD_ADMIN_EMAIL || "admin@dp.local";
const PASSWORD = process.env.PAYLOAD_ADMIN_PASSWORD || "cczaanSpFzaL4f";

const DEVELOPER = "il Cazar Developments";

// Google Maps pin for the project's own listing.
const THE_CREST = { lng: 31.5418677, lat: 29.9609591 };
// Fitted in-app against Mapbox satellite (?tools=1 → Adjust position → Copy config).
const MASTERPLAN = { widthMeters: 1392, heightMeters: 986, rotationDeg: 58, offsetE: 175, offsetN: 205 };

const POIS = [
  { name: "American University in Cairo", category: "school", lng: 31.4984253, lat: 30.0231678 },
  { name: "Cairo International Airport", category: "airport", lng: 31.3796689, lat: 30.1175993 },
  { name: "Capital International Airport", category: "airport", lng: 31.8404325, lat: 30.073924 },
];

// The developer's other ten projects — pinned on the globe and listed in the switcher, no
// masterplan yet, so they land on the honest "coming soon" panel.
const OTHER_PROJECTS = [
  { slug: "vea", name: "VÉA", lng: 31.575679, lat: 29.9595082 },
  { slug: "the-c", name: "The C", lng: 28.1795974, lat: 31.0672045 },
  { slug: "westdays", name: "Westdays", lng: 30.943154, lat: 30.005516 },
  { slug: "glen", name: "Glen", lng: 31.575075, lat: 29.959852 },
  { slug: "il-cazar-stoda", name: "Stoda", lng: 31.3837938, lat: 30.0810946 },
  { slug: "safia", name: "Safia", lng: 28.2022195, lat: 31.0620891 },
  { slug: "park-sight", name: "Park Sight", lng: 31.6246632, lat: 30.0058768 },
  { slug: "creek-district", name: "Creek District", lng: 31.5054449, lat: 30.0850173 },
  { slug: "creek-town", name: "Creek Town", lng: 31.5054449, lat: 30.0850173 },
  { slug: "go-heliopolis", name: "Go Heliopolis", lng: 31.3407125, lat: 30.0727905 },
];

// The Crest's own unit mix (ilcazar.com/the-crest/): one zone per category, each a single
// product (bedroom count is the developer's figure; size/price/availability are demo
// figures in the same spirit as the rest of this repo's mock CRM data).
//
// Each category is actually scattered across several plots on the real masterplan, not one
// blob — so each gets ADDRESSES_PER_ZONE separate villaType docs ("addresses"), every one
// traceable as its own polygon in-app. All of them share the same area/name/image/etc., so
// the buyer only ever sees one product name ("Standalone Villa"); the "-01".."-10" suffix is
// purely the internal join key between a specific shape on the map and its slice of mock
// inventory — it never renders. Matches the per-address split in the mock CRM
// (src/lib/crm/providers/mock.ts's addressedSeeds); change one, change the other.
const ADDRESSES_PER_ZONE = 10;

// planImage is each category's own floor/unit plan from ilcazar.com/the-crest/'s "Available
// units" → VIEW PLAN carousels — one representative floor per category (most show several;
// ground/first floor is the one kept), shown behind the card's "View plan" toggle.
const ZONES = [
  {
    code: "signature-ville",
    area: "The Signature Ville",
    name: "Signature Villa",
    bedroomsText: "3",
    areaSqm: 280,
    priceFrom: 9500000,
    image: "signature-villa.jpg",
    planImage: "plan-signature-villa.jpg",
  },
  {
    code: "crestville",
    area: "CrestVille",
    name: "Standalone Villa",
    bedroomsText: "4",
    areaSqm: 350,
    priceFrom: 14000000,
    image: "standalone-villa.jpg",
    planImage: "plan-standalone-villa.jpg",
  },
  {
    code: "crestonia",
    area: "Crestonia",
    name: "Quad",
    bedroomsText: "3",
    areaSqm: 230,
    priceFrom: 8200000,
    image: "quad.jpg",
    planImage: "plan-quad.jpg",
  },
  {
    code: "crestside",
    area: "Crestside",
    name: "Town House",
    bedroomsText: "3",
    areaSqm: 210,
    priceFrom: 7400000,
    image: "townhouse.jpg",
    planImage: "plan-townhouse.jpg",
  },
  {
    code: "crestfield",
    area: "Crestfield",
    name: "Duplex & Apartment",
    bedroomsText: "3",
    areaSqm: 180,
    priceFrom: 5600000,
    image: "duplex-apartment.png",
    planImage: "plan-duplex-apartment.jpg",
  },
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

async function removeBy(collection, field, value) {
  const existing = await findBy(collection, field, value);
  if (!existing) return;
  await json(await fetch(`${BASE}/payload-api/${collection}/${existing.id}`, { method: "DELETE", headers: auth() }));
  console.log(`  removed ${collection}/${value} (superseded by addressed sub-zones)`);
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
  const filename = localPath.split("/").pop();
  const existing = await findBy("assets", "filename", filename);
  if (existing) return existing;
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const form = new FormData();
  form.append("file", new Blob([await readFile(localPath)], { type: MIME[ext] ?? "application/octet-stream" }), filename);
  form.append("_payload", JSON.stringify({ caption }));
  const data = await json(await fetch(`${BASE}/payload-api/assets`, { method: "POST", headers: auth(), body: form }));
  console.log(`  uploaded ${filename}`);
  return data.doc;
}

async function main() {
  await login();

  const logo = await upload("public/brand/ilcazar-logo-white.png", "il Cazar Developments lockup (white)");
  const client = await upsert("clients", "slug", "ilcazar", { slug: "ilcazar", name: "il Cazar Developments", logo: logo.id });

  const masterplan = await upload("public/media/ilcazar/masterplan.jpg", "The Crest masterplan (ilcazar.com)");
  const crest = await upsert("projects", "slug", "the-crest", {
    slug: "the-crest",
    name: "The Crest",
    client: client.id,
    developer: DEVELOPER,
    country: "Egypt",
    countryCode: "EG",
    lng: THE_CREST.lng,
    lat: THE_CREST.lat,
    precision: "exact",
    masterplanImage: masterplan.id,
    masterplanParams: MASTERPLAN,
    pointsOfInterest: POIS,
    crm: { provider: "mock" },
    order: 1,
  });

  for (const [i, d] of OTHER_PROJECTS.entries()) {
    await upsert("projects", "slug", d.slug, {
      ...d,
      client: client.id,
      developer: DEVELOPER,
      country: "Egypt",
      countryCode: "EG",
      precision: "exact",
      crm: { provider: "mock" },
      order: i + 2,
    });
  }

  const dir = "public/media/ilcazar/zones";
  for (const z of ZONES) {
    const img = await upload(`${dir}/${z.image}`, `The Crest — ${z.name}`);
    const planImg = await upload(`${dir}/${z.planImage}`, `The Crest — ${z.name} (floor plan)`);
    const prefix = `ilcazar-crest-${z.code}`;
    await removeBy("villaTypes", "code", prefix); // pre-split single-polygon doc, if still around
    for (let n = 1; n <= ADDRESSES_PER_ZONE; n++) {
      const code = `${prefix}-${String(n).padStart(2, "0")}`;
      await upsert("villaTypes", "code", code, {
        project: crest.id,
        code,
        area: z.area,
        name: z.name,
        bedroomsText: z.bedroomsText,
        areaSqm: z.areaSqm,
        image: img.id,
        planImage: planImg.id,
        brochureUrl: "https://ilcazar.com/wp-content/uploads/2023/03/The-Crest-Villas-E-Brochure-1-1.pdf",
      });
    }
  }

  console.log(
    `\nil Cazar seeded: 1 client, ${1 + OTHER_PROJECTS.length} projects, ${ZONES.length * ADDRESSES_PER_ZONE} addressed zones on The Crest.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

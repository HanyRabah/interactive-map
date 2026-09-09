// Seeds Zoya's 18 villa types (3 masterplan areas) into the CMS, uploading each render.
//
//   node scripts/seed-villa-types.mjs            (server must be running on :3000)
//   SEED_BASE_URL=https://… node scripts/seed-villa-types.mjs
//
// Idempotent: villa types are matched by `code`, images reused by filename. It never
// touches `polygon` — those are drawn in-app with ?tools=1 and would be destroyed by a
// re-seed otherwise, which is the whole reason this is a separate script from seed-cms.mjs.
//
// Source: LMD's own sub-project pages (lmd.com.eg/en/zoya/sub-project/{sea-vil,isle-vil,
// coconut-condo}), including the duplicate product names they really do sell — two
// "Twin Palm Condo" (180 and 235 m²), two "Town Casa" (230 and 235), two "Shoreline Villa
// with Basement" (945 and 920), and a "Coconut Condo" in both Isle Vil (5 bed) and Coconut
// Condo (3 bed). `code` carries the uniqueness; `name` stays as buyers see it.

import { readFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SEED_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.PAYLOAD_ADMIN_EMAIL || "admin@dp.local";
const PASSWORD = process.env.PAYLOAD_ADMIN_PASSWORD || "cczaanSpFzaL4f";
const PROJECT_SLUG = process.env.SEED_PROJECT_SLUG || "zoya-ghazala-bay";
const IMAGE_DIR = "public/media/zoya/villa-types";

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

async function uploadImage(filename) {
  const existing = await findBy("assets", "filename", filename);
  if (existing) return existing;
  const form = new FormData();
  const body = await readFile(path.join(IMAGE_DIR, filename));
  const mime = filename.endsWith(".png") ? "image/png" : "image/webp";
  form.append("file", new Blob([body], { type: mime }), filename);
  form.append("_payload", JSON.stringify({ caption: `Zoya villa type render — ${filename}` }));
  const data = await json(
    await fetch(`${BASE}/payload-api/assets`, { method: "POST", headers: auth(), body: form })
  );
  console.log(`  uploaded ${filename}`);
  return data.doc;
}

async function main() {
  await login();

  const project = await findBy("projects", "slug", PROJECT_SLUG);
  if (!project) throw new Error(`No project with slug "${PROJECT_SLUG}" — seed the catalog first.`);

  const types = JSON.parse(await readFile("scripts/data/zoya-villa-types.json", "utf8"));

  // Several products share a render on LMD's own site (all three Twin Palm/Palm Condo
  // variants, both Town Casas). Upload once, reference many.
  const assets = new Map();
  for (const filename of new Set(types.map((t) => t.image.replaceAll(" ", "-")))) {
    assets.set(filename, await uploadImage(filename));
  }

  for (const t of types) {
    const image = assets.get(t.image.replaceAll(" ", "-"));
    const existing = await findBy("villaTypes", "code", t.code);
    const doc = {
      project: project.id,
      code: t.code,
      area: t.area,
      name: t.name,
      areaSqm: t.areaSqm,
      bedroomsText: t.bedroomsText,
      image: image?.id,
      // polygon deliberately omitted — a PATCH without it leaves any drawn shape alone.
    };
    const res = await json(
      await fetch(
        existing ? `${BASE}/payload-api/villaTypes/${existing.id}` : `${BASE}/payload-api/villaTypes`,
        {
          method: existing ? "PATCH" : "POST",
          headers: { "content-type": "application/json", ...auth() },
          body: JSON.stringify(doc),
        }
      )
    );
    const shape = res.doc.polygon ? "has polygon" : "no polygon yet";
    console.log(`${existing ? "updated" : "created"} ${t.code} (${t.area}, ${shape})`);
  }

  console.log(`\n${types.length} villa types seeded.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

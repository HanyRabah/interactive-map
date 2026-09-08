import path from "path";
import { fileURLToPath } from "url";
import { buildConfig } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import sharp from "sharp";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Payload CMS — the admin surface for the project catalog. Two collections:
//
//   assets    every uploaded file (GLB models, masterplan graphics, videos, photos).
//             Stored under public/uploads so Next serves them statically at /uploads/<name>
//             with zero extra plumbing — the same URL shape the map already consumes.
//
//   projects  one document per development. Carries everything src/data/projects.ts
//             hardcodes today (coordinates, calibration, asset references) PLUS the
//             per-project CRM connection (which provider, which org, which credentials),
//             which is what makes the platform multi-tenant: Zoya can point at LMD's
//             Salesforce while Bayn points at ORA's, configured entirely from /admin.
//
// The REST API is mounted at /payload-api (not the default /api) because the app's own
// public API routes (/api/units, /api/projects, …) already own /api/* — Payload's
// catch-all would be shadowed by them and the admin UI would break.
export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || "dev-only-secret-change-me",
  routes: { api: "/payload-api" },
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URI || "file:./payload.db" },
  }),
  editor: lexicalEditor(),
  sharp,
  telemetry: false,
  graphQL: { disable: true },
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  admin: {
    user: "users",
    meta: { titleSuffix: " · DP Interactive Admin" },
  },
  collections: [
    {
      slug: "users",
      auth: true,
      admin: { useAsTitle: "email" },
      fields: [],
    },
    {
      slug: "assets",
      upload: {
        staticDir: path.resolve(dirname, "../public/uploads"),
        // No imageSizes: GLBs and videos aren't images, and the map consumes originals.
        mimeTypes: [
          "image/*",
          "video/*",
          "model/gltf-binary",
          // Browsers commonly upload .glb as octet-stream; Payload filters on the
          // reported type, so both must be allowed.
          "application/octet-stream",
        ],
      },
      admin: { useAsTitle: "filename", group: "Catalog" },
      fields: [{ name: "caption", type: "text" }],
    },
    {
      // The tenant boundary: LMD, ORA, … Every project belongs to exactly one client,
      // which drives the pathed experience (/lmd, /ora), the admin list filter, and —
      // eventually — per-client theming and domains.
      slug: "clients",
      admin: { useAsTitle: "name", group: "Catalog", defaultColumns: ["name", "slug"] },
      fields: [
        { name: "slug", type: "text", required: true, unique: true, admin: { description: "URL path segment — lowercase, e.g. lmd → localhost:3000/lmd" } },
        { name: "name", type: "text", required: true, admin: { description: "Display name, e.g. LMD, ORA Developers" } },
        { name: "logo", type: "upload", relationTo: "assets", admin: { description: "White/light wordmark for dark backgrounds. Text wordmark is used when absent." } },
      ],
    },
    {
      slug: "projects",
      admin: { useAsTitle: "name", group: "Catalog", defaultColumns: ["name", "client", "country"], listSearchableFields: ["name", "slug", "developer"] },
      hooks: {
        afterChange: [
          async ({ doc }) => {
            // CRM config may have changed — drop the cached per-project provider so the
            // next /api/units call reconnects with the new credentials/org.
            const { invalidateProviderForProject } = await import("@/lib/crm");
            invalidateProviderForProject(doc.slug);
          },
        ],
      },
      fields: [
        // Identity — slug doubles as the map's project id and the default CRM external id.
        { name: "slug", type: "text", required: true, unique: true, admin: { description: "URL-safe id, e.g. zoya-ghazala-bay. Also the map's project id." } },
        { name: "name", type: "text", required: true },
        { name: "client", type: "relationship", relationTo: "clients", required: true, admin: { description: "The developer this project belongs to — drives /[client] routing and the list filter." } },
        { name: "developer", type: "text", required: true, admin: { description: "Display name shown on cards (usually the client's name)." } },
        {
          type: "row",
          fields: [
            { name: "country", type: "text", required: true },
            { name: "countryCode", type: "text", required: true, maxLength: 2 },
          ],
        },
        {
          type: "row",
          fields: [
            // Optional on purpose: LMD's real roster includes projects whose exact area
            // isn't publicly confirmed yet (8ight, Layan) — they list in the dropdown as
            // honest coming-soon entries but get no pin until coordinates exist.
            { name: "lng", type: "number", admin: { description: "Leave empty if the location is unconfirmed — the project lists without a pin." } },
            { name: "lat", type: "number" },
          ],
        },
        {
          name: "precision",
          type: "select",
          defaultValue: "exact",
          options: [
            { label: "Exact site anchor", value: "exact" },
            { label: "District / named area", value: "district" },
            { label: "City-level only", value: "city" },
          ],
          admin: { description: "How precise the coordinates are — drives how far the camera commits when flying in." },
        },

        // 3D masterplan model + calibration (same fields the in-app Calibrate panel tunes).
        { name: "model", type: "upload", relationTo: "assets", admin: { description: "Optimized GLB (see docs — keep under ~30MB for desktop, ~5MB for a mobile variant)." } },
        {
          name: "modelCalibration",
          type: "group",
          admin: { condition: (data) => !!data?.model },
          fields: [
            { name: "scale", type: "number", defaultValue: 1 },
            { name: "rotationDeg", type: "number", defaultValue: 0 },
            { name: "offsetE", type: "number", defaultValue: 0 },
            { name: "offsetN", type: "number", defaultValue: 0 },
            { name: "offsetUp", type: "number", defaultValue: 0 },
          ],
        },

        // Optional second, independently-calibrated model (Zoya's lagoon shots span a
        // wider area than the masterplan and are placed separately).
        { name: "lagoonModel", type: "upload", relationTo: "assets", admin: { description: "Optional second GLB (e.g. lagoon/water feature) with its own calibration." } },
        {
          name: "lagoonCalibration",
          type: "group",
          admin: { condition: (data) => !!data?.lagoonModel },
          fields: [
            { name: "scale", type: "number", defaultValue: 1 },
            { name: "rotationDeg", type: "number", defaultValue: 0 },
            { name: "offsetE", type: "number", defaultValue: 0 },
            { name: "offsetN", type: "number", defaultValue: 0 },
            { name: "offsetUp", type: "number", defaultValue: 0 },
          ],
        },

        // 2D masterplan graphic + placement.
        { name: "masterplanImage", type: "upload", relationTo: "assets" },
        {
          name: "masterplanParams",
          type: "group",
          admin: { condition: (data) => !!data?.masterplanImage },
          fields: [
            { name: "widthMeters", type: "number", defaultValue: 600 },
            { name: "heightMeters", type: "number", defaultValue: 600 },
            { name: "rotationDeg", type: "number", defaultValue: 0 },
            { name: "offsetE", type: "number", defaultValue: 0 },
            { name: "offsetN", type: "number", defaultValue: 0 },
          ],
        },

        // Media
        { name: "heroVideo", type: "upload", relationTo: "assets" },
        {
          name: "gallery",
          type: "array",
          fields: [
            { name: "image", type: "upload", relationTo: "assets", required: true },
            { name: "caption", type: "text" },
          ],
        },

        // Construction-progress timeline (before/after story on the /portfolio view).
        {
          name: "timeline",
          type: "array",
          admin: { description: "Construction progress entries, oldest first. Date format YYYY-MM, or 'planned'." },
          fields: [
            { name: "date", type: "text", required: true },
            { name: "label", type: "text", required: true },
            { name: "image", type: "upload", relationTo: "assets", required: true },
          ],
        },

        // Surveyed site outline, when real data exists — [[lng,lat], …].
        { name: "boundaryPolygon", type: "json", admin: { description: "JSON array of [lng, lat] pairs. Leave empty if unsurveyed." } },

        // ---- CRM connection (per project — this is the multi-tenant switch) ----
        {
          name: "crm",
          type: "group",
          admin: { description: "Where this project's live inventory comes from. 'Demo data' needs no setup." },
          fields: [
            {
              name: "provider",
              type: "select",
              defaultValue: "mock",
              options: [
                { label: "Demo data (no CRM)", value: "mock" },
                { label: "Salesforce", value: "salesforce" },
                { label: "SAP (not yet available)", value: "sap" },
              ],
            },
            {
              name: "salesforce",
              type: "group",
              admin: { condition: (data) => data?.crm?.provider === "salesforce" },
              fields: [
                { name: "instanceUrl", type: "text", admin: { description: "My Domain URL, e.g. https://org.my.salesforce.com" } },
                { name: "clientId", type: "text", admin: { description: "Connected App consumer key" } },
                // Demo-grade secret handling: stored in the CMS database, visible only to
                // logged-in admins, never returned by the public catalog API (the adapter
                // strips it). Production hardening (secrets manager + reference here) is
                // called out in the ORA proposal.
                { name: "clientSecret", type: "text", admin: { description: "Connected App consumer secret" } },
                { name: "externalProjectId", type: "text", admin: { description: "Value of Project_Id__c in this org's Unit__c records. Defaults to the project slug." } },
                { name: "currency", type: "text", defaultValue: "EGP", admin: { description: "ISO code for Price__c display (EGP, AED, USD…)" } },
              ],
            },
          ],
        },
      ],
    },
  ],
});

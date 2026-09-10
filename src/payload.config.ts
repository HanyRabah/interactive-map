import path from "path";
import { fileURLToPath } from "url";
import { buildConfig } from "payload";
import { vercelPostgresAdapter } from "@payloadcms/db-vercel-postgres";
import { vercelBlobStorage } from "@payloadcms/storage-vercel-blob";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Payload CMS — the admin surface for the project catalog. Two collections:
//
//   assets    every uploaded file (GLB models, masterplan graphics, videos, photos).
//             Stored in Vercel Blob (see the plugin below) and served straight from its
//             CDN — the browser fetches GLBs and the masterplan graphic by URL, so they
//             must not route through a serverless function.
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
  // Neon Postgres. The pooled connection string is required on serverless: Payload opens a
  // connection per request, and Vercel runs each concurrent request in its own instance, so
  // the direct (non-pooling) endpoint exhausts Postgres connections under any real traffic.
  db: vercelPostgresAdapter({
    pool: { connectionString: process.env.POSTGRES_URL },
  }),
  editor: lexicalEditor(),
  // No `sharp`: it only powers image resizing/thumbnails, and the assets collection
  // deliberately has no imageSizes — the map consumes originals. Handing it to Payload
  // pulled a native libvips binary into every server render, which failed to load on
  // Vercel's linux-x64 runtime (npm resolves sharp's platform packages from the host that
  // wrote the lockfile) and 500'd the whole site.
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
        // No staticDir: the Vercel Blob plugin below owns storage. Vercel's filesystem is
        // ephemeral, so anything written to disk at runtime vanishes on the next deploy.
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
      // One document per PRODUCT (a villa/condo type), not per unit. Content only: the
      // render, the size, the bedroom line, and the polygon it occupies on the masterplan.
      // Inventory — which units exist, their numbers, their status — stays in the CRM, so
      // marketing can edit a photo without Salesforce access and sales can mark a unit sold
      // without a deploy.
      //
      // `code` is the join key: it must equal Villa_Type__c on that org's Unit__c records.
      slug: "villaTypes",
      labels: { singular: "Villa type", plural: "Villa types" },
      admin: {
        useAsTitle: "name",
        group: "Catalog",
        defaultColumns: ["name", "area", "areaSqm", "project"],
        listSearchableFields: ["name", "code", "area"],
      },
      fields: [
        { name: "project", type: "relationship", relationTo: "projects", required: true },
        {
          name: "code",
          type: "text",
          required: true,
          unique: true,
          admin: { description: "Join key — must match Villa_Type__c on this org's Unit__c records exactly, e.g. isle-vil-twin-palm-condo-180." },
        },
        {
          name: "area",
          type: "text",
          required: true,
          admin: { description: "The masterplan area this product sits in, e.g. Sea Vil. Must match Cluster__c in the CRM." },
        },
        // Deliberately NOT unique: LMD really does sell two different "Twin Palm Condo"
        // products (180 and 235 sqm) and two "Town Casa". The size is what tells them apart
        // on their own site, so the hover card shows name + size together and `code` carries
        // the uniqueness.
        { name: "name", type: "text", required: true, admin: { description: "As shown to buyers. Need not be unique — the size disambiguates." } },
        {
          type: "row",
          fields: [
            { name: "areaSqm", type: "number", required: true, admin: { description: "Total space in m²." } },
            { name: "bedroomsText", type: "text", required: true, admin: { description: "Verbatim, e.g. 3 + Nanny's + Driver's Bedrooms." } },
          ],
        },
        { name: "image", type: "upload", relationTo: "assets", admin: { description: "The render shown on the hover card." } },
        { name: "description", type: "textarea" },
        {
          name: "polygon",
          type: "json",
          admin: { description: "JSON array of [lng, lat] pairs outlining this product's plots on the masterplan. Drawn in-app with ?tools=1 rather than typed." },
        },
      ],
    },
    {
      slug: "projects",
      admin: { useAsTitle: "name", group: "Catalog", defaultColumns: ["name", "client", "country", "published", "order"], listSearchableFields: ["name", "slug", "developer"] },
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
        // ---- Visibility + ordering: what the nav dropdown and the globe pins actually show ----
        // Deliberately NOT `required` and with no stored default, so the 14 projects that
        // predate these fields keep working: the catalog treats null as "published" and
        // sorts null order last, which means adding these columns changed nothing until an
        // admin actually sets one.
        {
          name: "published",
          type: "checkbox",
          defaultValue: true,
          admin: {
            position: "sidebar",
            description: "Unchecked: the project stays editable here but disappears from the nav menu and the globe. Use it to stage a half-filled project.",
          },
        },
        {
          name: "order",
          type: "number",
          admin: {
            position: "sidebar",
            description: "Lower numbers come first in the nav menu (1, 2, 3…). Leave empty and the project sorts alphabetically, after everything that has a number.",
          },
        },

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

        // ---- What the site rail links out to ----
        // Each is optional and each hides its own rail entry when empty: a dead control in
        // front of a client is worse than one fewer control.
        {
          name: "virtualTourUrl",
          type: "text",
          admin: { description: "Full URL of the 360° tour. Opens in a new tab." },
        },
        {
          name: "galleryUrl",
          type: "text",
          admin: { description: "Full URL of the photo gallery (Pic-Time, etc). Opens in a new tab." },
        },
        {
          name: "film",
          type: "upload",
          relationTo: "assets",
          admin: {
            description:
              "The project film, played in an overlay. Upload rather than linking Drive/YouTube: this serves from the CDN with our own player, no third-party branding, no view throttling. Files over ~90MB cannot pass through this uploader — put those in Blob directly and use Film URL below.",
          },
        },
        {
          name: "filmUrl",
          type: "text",
          admin: {
            description:
              "Direct CDN URL, for a film too large to upload here (Vercel caps a request body at 100MB, and a 2-minute 1080p master runs past that). Wins over the upload above when both are set. Must be a real video file the browser can stream, not a Drive or YouTube page.",
          },
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

        // ---- Points of interest: what's near the site, and how far ----
        // The hero stage lists these and draws a real driving route to whichever one the
        // visitor picks. Coordinates are the destination the route ends at, so they should
        // be the entrance/terminal, not the centre of a large landmark.
        {
          name: "pointsOfInterest",
          type: "array",
          labels: { singular: "Point of interest", plural: "Points of interest" },
          admin: { description: "Nearby landmarks — airports, towns, marinas. Listed on the site overview with live driving distance and time." },
          fields: [
            { name: "name", type: "text", required: true, admin: { description: "As a buyer would say it, e.g. 'El Alamein International Airport'." } },
            {
              name: "category",
              type: "select",
              required: true,
              defaultValue: "landmark",
              admin: { description: "Picks the icon." },
              options: [
                { label: "Airport", value: "airport" },
                { label: "City / town", value: "city" },
                { label: "Marina", value: "marina" },
                { label: "Beach", value: "beach" },
                { label: "Golf", value: "golf" },
                { label: "Hospital", value: "hospital" },
                { label: "School / university", value: "school" },
                { label: "Shopping", value: "shopping" },
                { label: "Landmark", value: "landmark" },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "lng", type: "number", required: true },
                { name: "lat", type: "number", required: true },
              ],
            },
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
  plugins: [
    // Uploads go to the public Blob store, so asset docs carry an absolute CDN URL and the
    // map loads models/imagery directly. A private store would force every 28-84MB GLB
    // through a serverless function on each request.
    vercelBlobStorage({
      enabled: true,
      collections: {
        // disablePayloadAccessControl makes asset.url the absolute Blob CDN URL. Without it
        // Payload hands back /payload-api/assets/file/<name> and proxies every request
        // through a serverless function — a 28MB GLB per visitor, per load. These files are
        // public marketing assets, so there is no access control worth paying that for.
        assets: { disablePayloadAccessControl: true },
      },
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }),
  ],
});

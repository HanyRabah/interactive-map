import { getPayload } from "payload";
import config from "@payload-config";

// Server-side reader for the CMS villaTypes collection — the product catalogue behind the
// masterplan's interactive zones. Deliberately NOT part of CatalogProvider: villa types only
// ever come from the CMS (there is no in-repo fallback list and no Edge Config variant), so
// putting them behind that interface would mean two implementations that can never exist.
//
// Content only. Availability is the CRM's answer and is joined in the API route, which is
// what lets a photo change without touching Salesforce and a unit sell without a deploy.

export type VillaType = {
  /** Join key — equals Unit__c.Villa_Type__c in the project's CRM. */
  code: string;
  /** Masterplan area, e.g. "Sea Vil" — equals Unit__c.Cluster__c. */
  area: string;
  /** As buyers see it. NOT unique: LMD sells two "Town Casa" at different sizes. */
  name: string;
  areaSqm: number;
  bedroomsText: string;
  imageUrl?: string;
  description?: string;
  /** Outline on the masterplan, [[lng, lat], …]. Absent until someone draws it. */
  polygon?: [number, number][];
};

type AssetDoc = { url?: string | null; filename?: string | null } | number | null | undefined;

type VillaTypeDoc = {
  code: string;
  area: string;
  name: string;
  areaSqm: number;
  bedroomsText: string;
  image?: AssetDoc;
  description?: string | null;
  polygon?: unknown;
  project?: { slug?: string | null } | number | null;
};

function imageUrl(asset: AssetDoc): string | undefined {
  if (asset && typeof asset === "object") {
    if (asset.url) return asset.url;
    if (asset.filename) return `/uploads/${asset.filename}`;
  }
  return undefined;
}

/** Only a closed ring of [lng, lat] pairs is usable as a map polygon; anything else is
 *  treated as "not drawn yet" rather than crashing the layer that renders it. */
function toPolygon(value: unknown): [number, number][] | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const ring = value.filter(
    (p): p is [number, number] =>
      Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number"
  );
  return ring.length >= 3 ? ring : undefined;
}

export async function listVillaTypes(projectSlug: string): Promise<VillaType[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "villaTypes",
    depth: 1, // resolve the image relation to its Blob URL
    limit: 500,
    overrideAccess: true,
    sort: ["area", "-areaSqm"], // largest product first within its area, as LMD lists them
  });
  return (result.docs as unknown as VillaTypeDoc[])
    .filter((d) => {
      const p = d.project;
      return p && typeof p === "object" ? p.slug === projectSlug : true;
    })
    .map((d) => ({
      code: d.code,
      area: d.area,
      name: d.name,
      areaSqm: d.areaSqm,
      bedroomsText: d.bedroomsText,
      imageUrl: imageUrl(d.image),
      description: d.description ?? undefined,
      polygon: toPolygon(d.polygon),
    }));
}

/** Saves a drawn outline onto one villa type. Used only by the in-app drawing tool. */
export async function saveVillaTypePolygon(code: string, polygon: [number, number][]): Promise<boolean> {
  const payload = await getPayload({ config });
  const found = await payload.find({
    collection: "villaTypes",
    where: { code: { equals: code } },
    limit: 1,
    overrideAccess: true,
  });
  const doc = found.docs[0];
  if (!doc) return false;
  await payload.update({
    collection: "villaTypes",
    id: doc.id,
    data: { polygon },
    overrideAccess: true,
  });
  return true;
}

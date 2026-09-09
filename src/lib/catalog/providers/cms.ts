import { getPayload } from "payload";
import config from "@payload-config";
import type { Project, ProjectCrmConfig } from "@/data/projects";
import type { CatalogClient, CatalogProvider } from "../provider";

// Reads the catalog from Payload (the /admin panel). Merges OVER the in-repo PROJECTS
// array: a CMS document whose slug matches an in-repo project replaces it; new slugs are
// appended. That keeps the demo projects (Zoya, BEC) alive while the CMS is still empty,
// and lets the admin override or extend them without touching code — the whole point.
//
// CRM credentials entered in the admin panel ride along on the Project as `crm`, which is
// SERVER-ONLY routing config for src/lib/crm — the public /api/projects routes must (and
// do) strip it before responding. Asset URLs come straight from Vercel Blob's CDN.

type AssetDoc = { url?: string | null; filename?: string | null } | number | null | undefined;

type ClientRel = { slug?: string | null } | number | null | undefined;

type ProjectDoc = {
  slug: string;
  name: string;
  developer: string;
  client?: ClientRel;
  country: string;
  countryCode: string;
  lng?: number | null;
  lat?: number | null;
  precision?: "exact" | "district" | "city" | null;
  model?: AssetDoc;
  modelCalibration?: { scale?: number | null; rotationDeg?: number | null; offsetE?: number | null; offsetN?: number | null; offsetUp?: number | null } | null;
  lagoonModel?: AssetDoc;
  lagoonCalibration?: { scale?: number | null; rotationDeg?: number | null; offsetE?: number | null; offsetN?: number | null; offsetUp?: number | null } | null;
  masterplanImage?: AssetDoc;
  masterplanParams?: { widthMeters?: number | null; heightMeters?: number | null; rotationDeg?: number | null; offsetE?: number | null; offsetN?: number | null } | null;
  boundaryPolygon?: unknown;
  crm?: {
    provider?: "mock" | "salesforce" | "sap" | null;
    salesforce?: {
      instanceUrl?: string | null;
      clientId?: string | null;
      clientSecret?: string | null;
      externalProjectId?: string | null;
      currency?: string | null;
    } | null;
  } | null;
};

// Payload hands back an absolute Blob CDN URL on `url` once the storage plugin is active.
// The /uploads/<filename> fallback covers a local-disk setup (no BLOB_READ_WRITE_TOKEN).
function assetUrl(asset: AssetDoc): string | undefined {
  if (asset && typeof asset === "object") {
    if (asset.url) return asset.url;
    if (asset.filename) return `/uploads/${asset.filename}`;
  }
  return undefined;
}

function toCrmConfig(doc: ProjectDoc): ProjectCrmConfig | undefined {
  const crm = doc.crm;
  if (!crm?.provider || crm.provider === "mock") return { provider: "mock" };
  if (crm.provider === "salesforce") {
    const sf = crm.salesforce;
    if (!sf?.instanceUrl || !sf.clientId || !sf.clientSecret) return { provider: "mock" }; // incomplete config → safe fallback
    return {
      provider: "salesforce",
      instanceUrl: sf.instanceUrl,
      clientId: sf.clientId,
      clientSecret: sf.clientSecret,
      externalProjectId: sf.externalProjectId || doc.slug,
      currency: sf.currency || undefined,
    };
  }
  return { provider: "sap" };
}

function clientSlugOf(doc: ProjectDoc): string | undefined {
  if (doc.client && typeof doc.client === "object" && doc.client.slug) return doc.client.slug;
  return undefined;
}

function toProject(doc: ProjectDoc): Project {
  const modelUrl = assetUrl(doc.model);
  const lagoonUrl = assetUrl(doc.lagoonModel);
  const masterplanUrl = assetUrl(doc.masterplanImage);
  const cal = doc.modelCalibration;
  const lagoonCal = doc.lagoonCalibration;
  const params = doc.masterplanParams;
  return {
    id: doc.slug,
    name: doc.name,
    developer: doc.developer,
    clientSlug: clientSlugOf(doc),
    country: doc.country,
    countryCode: doc.countryCode,
    lng: doc.lng ?? undefined,
    lat: doc.lat ?? undefined,
    precision: doc.precision ?? undefined,
    model: modelUrl ? { url: modelUrl } : undefined,
    modelCalibration: modelUrl
      ? {
          scale: cal?.scale ?? 1,
          rotationDeg: cal?.rotationDeg ?? 0,
          offsetE: cal?.offsetE ?? 0,
          offsetN: cal?.offsetN ?? 0,
          offsetUp: cal?.offsetUp ?? 0,
        }
      : undefined,
    lagoonModel: lagoonUrl ? { url: lagoonUrl } : undefined,
    lagoonCalibration: lagoonUrl
      ? {
          scale: lagoonCal?.scale ?? 1,
          rotationDeg: lagoonCal?.rotationDeg ?? 0,
          offsetE: lagoonCal?.offsetE ?? 0,
          offsetN: lagoonCal?.offsetN ?? 0,
          offsetUp: lagoonCal?.offsetUp ?? 0,
        }
      : undefined,
    masterplanImage: masterplanUrl
      ? {
          url: masterplanUrl,
          params: {
            widthMeters: params?.widthMeters ?? 600,
            heightMeters: params?.heightMeters ?? 600,
            rotationDeg: params?.rotationDeg ?? 0,
            offsetE: params?.offsetE ?? 0,
            offsetN: params?.offsetN ?? 0,
          },
        }
      : undefined,
    boundaryPolygon: Array.isArray(doc.boundaryPolygon) ? (doc.boundaryPolygon as [number, number][]) : undefined,
    crm: toCrmConfig(doc),
  };
}

export class CmsCatalogProvider implements CatalogProvider {
  readonly id = "cms";

  private async fetchCmsProjects(): Promise<Project[]> {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "projects",
      depth: 1, // resolve upload relations to their docs (for filenames)
      limit: 200,
      overrideAccess: true,
    });
    return (result.docs as unknown as ProjectDoc[]).map(toProject);
  }

  async listProjects(): Promise<Project[]> {
    const { CodeCatalogProvider } = await import("./code");
    const codeProjects = await new CodeCatalogProvider().listProjects();
    const cmsProjects = await this.fetchCmsProjects();
    const bySlug = new Map<string, Project>(codeProjects.map((p) => [p.id, p]));
    for (const p of cmsProjects) bySlug.set(p.id, p); // CMS wins on slug collision
    return Array.from(bySlug.values());
  }

  async getProject(id: string): Promise<Project | null> {
    const all = await this.listProjects();
    return all.find((p) => p.id === id) ?? null;
  }

  async getClient(slug: string): Promise<CatalogClient | null> {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "clients",
      where: { slug: { equals: slug } },
      depth: 1,
      limit: 1,
      overrideAccess: true,
    });
    const doc = result.docs[0] as unknown as { slug: string; name: string; logo?: AssetDoc } | undefined;
    if (!doc) return null;
    return { slug: doc.slug, name: doc.name, logoUrl: assetUrl(doc.logo) };
  }
}

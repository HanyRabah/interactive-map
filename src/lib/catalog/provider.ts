import type { Project } from "@/data/projects";

// Catalog = the project content side (metadata, 3D/masterplan/media asset URLs) — a
// deliberately separate contract from InventoryProvider (units/leads/shortlists in the
// CRM). Different lifecycle (changes rarely vs hourly), different owners (marketing/3D
// team vs sales), and usually a different backend (CMS + object storage vs Salesforce/
// SAP). Large binaries never flow through here — a Project only carries URLs into blob
// storage/public assets; whatever backend an adapter talks to, files stay on a CDN.
export interface CatalogProvider {
  /** Human-readable id ("code", "edge-config", "cms") — surfaced in logs/health checks. */
  readonly id: string;

  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;

  /** Tenant lookup for /[client] branding — optional; adapters without a client store omit it. */
  getClient?(slug: string): Promise<CatalogClient | null>;
}

export type CatalogClient = {
  slug: string;
  name: string;
  logoUrl?: string;
};

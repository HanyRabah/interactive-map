import { catalog } from "@/lib/catalog";
import type { ClientBrand } from "@/components/ZoyaShowcase";

// Builds the branding + roster for one client's pathed experience, entirely from the
// catalog — the CMS is the source of truth for every client including LMD (the old
// hand-curated in-repo roster is gone from the flow; the admin panel owns the list now).
// Coordinate-less projects (area not public yet) get no lngLat: they list in the dropdown
// as honest coming-soon entries without a pin. `href` marks "a real interactive journey
// exists" — true once the project carries a model or masterplan image.
export async function buildClientBrand(slug: string): Promise<ClientBrand | null> {
  const clientInfo = (await catalog.getClient?.(slug)) ?? null;
  const projects = (await catalog.listProjects()).filter((p) => p.clientSlug === slug);
  if (!clientInfo && projects.length === 0) return null;

  return {
    slug,
    name: clientInfo?.name ?? projects[0]?.developer ?? slug.toUpperCase(),
    // LMD's wordmark ships in-repo; any client can override by uploading a logo in /admin.
    logoUrl: clientInfo?.logoUrl ?? (slug === "lmd" ? "/brand/lmd-logo-white.png" : undefined),
    roster: projects.map((p) => ({
      id: p.id,
      name: p.name,
      country: p.country,
      lngLat: p.lng != null && p.lat != null ? ([p.lng, p.lat] as [number, number]) : undefined,
      precision: p.precision ?? "exact",
      href: p.model || p.masterplanImage ? "/" : undefined,
    })),
  };
}

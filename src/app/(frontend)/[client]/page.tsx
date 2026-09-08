import { notFound } from "next/navigation";
import ZoyaShowcase, { type ClientBrand } from "@/components/ZoyaShowcase";
import { catalog } from "@/lib/catalog";
import { LMD_PROJECTS } from "@/data/lmdProjects";

export const dynamic = "force-dynamic";

// Pathed client experience: /lmd, /ora, … Each client sees only its own roster, branded
// with its own wordmark. Unknown slugs 404 (this is a single dynamic segment at the root,
// so it must reject noise like stale bookmarks — static routes such as /portfolio and
// /admin always win over it).
//
// LMD keeps its hand-curated roster (real coming-soon entries with researched
// coordinates, honest precision levels); other clients get a roster derived from their
// catalog projects. When a CMS client record exists, its name/logo brand the page.
export default async function ClientPage({ params }: { params: Promise<{ client: string }> }) {
  const { client } = await params;
  const slug = client.toLowerCase();

  const clientInfo = (await catalog.getClient?.(slug)) ?? null;
  const projects = (await catalog.listProjects()).filter((p) => p.clientSlug === slug);
  if (!clientInfo && projects.length === 0) notFound();

  const brand: ClientBrand =
    slug === "lmd"
      ? { slug, name: clientInfo?.name ?? "LMD", logoUrl: clientInfo?.logoUrl ?? "/brand/lmd-logo-white.png", roster: LMD_PROJECTS }
      : {
          slug,
          name: clientInfo?.name ?? projects[0]?.developer ?? slug.toUpperCase(),
          logoUrl: clientInfo?.logoUrl,
          roster: projects.map((p) => ({
            id: p.id,
            name: p.name,
            country: p.country,
            lngLat: [p.lng, p.lat] as [number, number],
            precision: "exact" as const,
            // href marks "real interactive experience exists" — true once the project has
            // an actual model or masterplan; stubs read as honest coming-soon entries.
            href: p.model || p.masterplanImage ? "/" : undefined,
          })),
        };

  return <ZoyaShowcase brand={brand} />;
}

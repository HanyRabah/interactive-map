import type { Metadata } from "next";
import ZoyaShowcase from "@/components/ZoyaShowcase";
import { buildClientBrand } from "@/lib/clientBrand";

export const dynamic = "force-dynamic";

// Mirrors /[client]'s per-brand title — otherwise the bare domain just inherits the root
// layout's hardcoded "Zoya, Ghazala Bay" default forever, even once LMD's own catalog
// entry exists. Falls back to that same root default when there's no LMD client yet.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await buildClientBrand("lmd");
  if (!brand) return {};
  return {
    title: `${brand.name} — DP Interactive`,
    description: `An interactive showcase of ${brand.name}'s projects, by DP Productions`,
  };
}

// The bare domain is LMD's experience (today's flagship client) — same catalog-driven
// brand as /lmd, so the admin panel controls this roster too. Falls back to the
// component's built-in LMD default if the catalog has no LMD client yet (fresh DB).
export default async function Home() {
  const brand = await buildClientBrand("lmd");
  return brand ? <ZoyaShowcase brand={brand} /> : <ZoyaShowcase />;
}

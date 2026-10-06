import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ZoyaShowcase from "@/components/ZoyaShowcase";
import { buildClientBrand } from "@/lib/clientBrand";

export const dynamic = "force-dynamic";

// Browser-tab title per client — otherwise every /[client] route inherits the root
// layout's hardcoded "Zoya, Ghazala Bay" title regardless of which developer it is.
export async function generateMetadata({ params }: { params: Promise<{ client: string }> }): Promise<Metadata> {
  const { client } = await params;
  const brand = await buildClientBrand(client.toLowerCase());
  if (!brand) return {};
  return {
    title: `${brand.name} — DP Interactive`,
    description: `An interactive showcase of ${brand.name}'s projects, by DP Productions`,
  };
}

// Pathed client experience: /lmd, /ora, … Each client sees only its own roster, branded
// with its own wordmark, all driven by the catalog (the /admin panel). Unknown slugs 404
// (this is a single dynamic segment at the root, so it must reject noise like stale
// bookmarks — static routes such as /portfolio and /admin always win over it).
export default async function ClientPage({ params }: { params: Promise<{ client: string }> }) {
  const { client } = await params;
  const brand = await buildClientBrand(client.toLowerCase());
  if (!brand) notFound();
  return <ZoyaShowcase brand={brand} />;
}

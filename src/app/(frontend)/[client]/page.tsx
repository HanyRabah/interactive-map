import { notFound } from "next/navigation";
import ZoyaShowcase from "@/components/ZoyaShowcase";
import { buildClientBrand } from "@/lib/clientBrand";

export const dynamic = "force-dynamic";

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

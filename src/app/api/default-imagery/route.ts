import { readFlag, writeFlag } from "@/lib/edgeConfigFlag";

export const dynamic = "force-dynamic";

// Distinct from journey-imagery (mapbox|google, journey-stages-only, ToS-risky): this is
// the properly-licensed Esri World Imagery source, shown everywhere (including the intro
// globe), not gated to any stage, because there's no reason to limit its blast radius.
export type DefaultImagerySource = "mapbox" | "esri";

const FLAG_KEY = "defaultImagerySource";

export async function GET() {
  const source = await readFlag<DefaultImagerySource>(FLAG_KEY, "mapbox");
  return Response.json({ source }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { source, secret } = (await request.json().catch(() => ({}))) as {
    source?: string;
    secret?: string;
  };
  if (source !== "mapbox" && source !== "esri") {
    return Response.json({ error: "source must be 'mapbox' or 'esri'" }, { status: 400 });
  }

  const result = await writeFlag(FLAG_KEY, source, secret);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ source });
}

import { readFlag, writeFlag } from "@/lib/edgeConfigFlag";

export const dynamic = "force-dynamic";

export type JourneyImagerySource = "mapbox" | "google";

const FLAG_KEY = "journeyImagerySource";

export async function GET() {
  const source = await readFlag<JourneyImagerySource>(FLAG_KEY, "mapbox");
  return Response.json({ source }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { source, secret } = (await request.json().catch(() => ({}))) as {
    source?: string;
    secret?: string;
  };
  if (source !== "mapbox" && source !== "google") {
    return Response.json({ error: "source must be 'mapbox' or 'google'" }, { status: 400 });
  }

  const result = await writeFlag(FLAG_KEY, source, secret);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ source });
}

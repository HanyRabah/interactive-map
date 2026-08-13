import { get } from "@vercel/edge-config";

// Shared read/write for the small set of global, persisted (Edge Config) feature flags —
// used by both /api/journey-imagery and /api/default-imagery so the auth/write plumbing
// exists once. Each route still owns its own key and value union.
export async function readFlag<T extends string>(key: string, fallback: T): Promise<T> {
  const value = await get<T>(key).catch(() => undefined);
  return value ?? fallback;
}

export async function writeFlag(
  key: string,
  value: string,
  secret: string | undefined
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!process.env.TOOLS_ADMIN_SECRET || secret !== process.env.TOOLS_ADMIN_SECRET) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (!process.env.VERCEL_API_TOKEN || !process.env.EDGE_CONFIG_ID) {
    return { ok: false, status: 500, error: "server missing VERCEL_API_TOKEN/EDGE_CONFIG_ID" };
  }

  const res = await fetch(
    `https://api.vercel.com/v1/edge-config/${process.env.EDGE_CONFIG_ID}/items?teamId=${process.env.VERCEL_TEAM_ID ?? ""}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: [{ operation: "upsert", key, value }] }),
    }
  );

  if (!res.ok) return { ok: false, status: 502, error: `Vercel API error: ${res.status} ${await res.text()}` };
  return { ok: true };
}

import { catalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

// GET /api/projects[?summary=1]
//   summary=1 strips the heavy fields (timeline/media data URIs, boundary polygons) down
//   to what a project picker or pin layer needs; default returns full records.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projects = await catalog.listProjects();

  if (url.searchParams.get("summary")) {
    const summaries = projects.map((p) => ({
      id: p.id,
      name: p.name,
      developer: p.developer,
      country: p.country,
      countryCode: p.countryCode,
      lng: p.lng,
      lat: p.lat,
      has3DModel: !!p.model,
      hasMasterplanImage: !!p.masterplanImage,
      hasMedia: !!p.media,
    }));
    return Response.json({ projects: summaries }, { headers: { "Cache-Control": "no-store" } });
  }

  // `crm` is server-only routing config and can carry credentials — never ship it.
  const publicProjects = projects.map((project) => {
    const copy = { ...project };
    delete copy.crm;
    return copy;
  });
  return Response.json({ projects: publicProjects }, { headers: { "Cache-Control": "no-store" } });
}

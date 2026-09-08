import { catalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

// GET /api/projects/<projectId>
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = await catalog.getProject(id);
  if (!project) return Response.json({ error: "project not found" }, { status: 404 });
  // `crm` is server-only routing config and can carry credentials — never ship it.
  const publicProject = { ...project };
  delete publicProject.crm;
  return Response.json({ project: publicProject }, { headers: { "Cache-Control": "no-store" } });
}

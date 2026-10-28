import { handleCommunitySitesRequest } from "@/modules/community-sites/infrastructure/community-sites-http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handleCommunitySitesRequest(request, "admin", (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return handleCommunitySitesRequest(request, "admin", (await context.params).id); }

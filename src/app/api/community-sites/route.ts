import { handleCommunitySitesRequest } from "@/modules/community-sites/infrastructure/community-sites-http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleCommunitySitesRequest(request, "owner"); }
export async function POST(request: Request) { return handleCommunitySitesRequest(request, "owner"); }

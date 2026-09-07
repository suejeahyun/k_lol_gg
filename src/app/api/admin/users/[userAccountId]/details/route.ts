import { GET as getCanonicalAccountDetail } from "../route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ userAccountId: string }> },
) {
  return getCanonicalAccountDetail(request, context);
}

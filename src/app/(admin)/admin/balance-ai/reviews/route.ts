import { buildAdminMmrReviewsDestination } from "@/modules/mmr";

export function GET(request: Request) {
  const url = new URL(request.url);
  const params = Object.fromEntries([...url.searchParams.keys()].map((key) => [key, url.searchParams.getAll(key)]));
  return new Response(null, { status: 308, headers: { Location: buildAdminMmrReviewsDestination(params) } });
}

export const HEAD = GET;

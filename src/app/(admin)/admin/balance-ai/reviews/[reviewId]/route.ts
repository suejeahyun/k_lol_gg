import { buildAdminMmrReviewsDestination } from "@/modules/mmr";

export async function GET(request: Request, context: { params: Promise<{ reviewId: string }> }) {
  const url = new URL(request.url);
  const params = Object.fromEntries([...url.searchParams.keys()].map((key) => [key, url.searchParams.getAll(key)]));
  return new Response(null, {
    status: 308,
    headers: { Location: buildAdminMmrReviewsDestination(params, (await context.params).reviewId) },
  });
}

export const HEAD = GET;

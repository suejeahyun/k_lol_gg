export function GET(request: Request) {
  if (new URL(request.url).searchParams.size > 0) return new Response(null, { status: 400 });
  return new Response(null, { status: 308, headers: { Location: "/admin/balance-ai?action=recalculate" } });
}

export const HEAD = GET;

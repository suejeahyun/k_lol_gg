import { buildAdminMmrPlayersDestination } from "@/modules/mmr";

function redirect(searchParams: Record<string, string | string[] | undefined>) {
  return new Response(null, { status: 308, headers: { Location: buildAdminMmrPlayersDestination(searchParams) } });
}

export function GET(request: Request) {
  const url = new URL(request.url);
  return redirect(Object.fromEntries([...url.searchParams.keys()].map((key) => [key, url.searchParams.getAll(key)])));
}

export const HEAD = GET;

import { permanentRedirect } from "next/navigation";

import { buildLegacyPlayersDestination } from "@/modules/navigation/application/legacy-player-redirects";

export default async function LegacyPlayersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(buildLegacyPlayersDestination(await searchParams));
}

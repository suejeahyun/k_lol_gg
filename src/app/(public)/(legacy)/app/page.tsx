import { permanentRedirect } from "next/navigation";

import { buildLegacyHomeDestination } from "@/modules/navigation/application/legacy-player-redirects";

export default async function LegacyAppHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(buildLegacyHomeDestination(await searchParams));
}

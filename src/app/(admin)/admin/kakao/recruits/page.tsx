import { notFound, permanentRedirect } from "next/navigation";

import { parseKakaoAdminTabQuery } from "@/modules/recruiting/kakao-admin/tab-query";

export const dynamic = "force-dynamic";
export default async function LegacyKakaoRecruitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tab = parseKakaoAdminTabQuery(await searchParams);
  if (!tab) notFound();
  permanentRedirect(`/admin/kakao?tab=${tab}`);
}

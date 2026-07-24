import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { partyRecruitJson } from "../_shared";

export async function POST() {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  return partyRecruitJson(
    {
      reply: [
        "[K-LOL.GG 모집번호 초기화 사용 안 함]",
        "",
        "모집번호 초기화 기능은 사용하지 않습니다.",
        "진행 중인 파티는 모집번호+ㅉ으로 마무리해주세요.",
      ].join("\n"),
    },
    410,
  );
}

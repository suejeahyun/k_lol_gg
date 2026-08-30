import { NextRequest } from "next/server";
import { requireSiteFeature } from "@/lib/site/feature-guard";
import { readJsonBody, rejectIfInvalidScrimSecret, rejectScrimPolicy, scrimRecruitJson } from "../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  const body = await readJsonBody(req);
  const rejected = rejectIfInvalidScrimSecret(req, body.secret);
  if (rejected) return rejected;
  const policyRejected = await rejectScrimPolicy(body, "RECRUIT_FINISH", { requireIdentity: true });
  if (policyRejected) return policyRejected;

  return scrimRecruitJson(
    {
      reply: "[K-LOL.GG 스크림 확정 명령 사용 안 함]\n최신 스크림 양식을 다시 보내주세요.",
    },
    410,
  );
}

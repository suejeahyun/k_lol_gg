import { kakaoImageSessionUnavailableResponse, prepareKakaoSignedJson } from "@/modules/recruiting/kakao-assistant/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Fail closed until a durable, owner-bound Kakao upload session is available. */
export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request);
  if (!prepared.ok) return prepared.response;
  return kakaoImageSessionUnavailableResponse(prepared.traceId);
}

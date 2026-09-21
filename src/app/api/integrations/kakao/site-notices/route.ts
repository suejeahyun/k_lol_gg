import { getDatabase } from "@/platform/db/client";
import { handleSiteNoticeRequest } from "@/modules/seasons/kakao-site-notices/http";
import { PostgresSiteNoticeRepository } from "@/modules/seasons/kakao-site-notices/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleSiteNoticeRequest(request, (envelope, config, keyId, digest, now) =>
    new PostgresSiteNoticeRepository(getDatabase()).execute(envelope, config, keyId, digest, now));
}

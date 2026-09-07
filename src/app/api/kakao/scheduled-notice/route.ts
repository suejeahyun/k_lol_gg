import { POST as handler } from "../../integrations/kakao/scheduled-notice/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = handler;

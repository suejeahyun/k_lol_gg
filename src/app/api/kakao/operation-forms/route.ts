// Compatibility handler: signed POSTs are executed directly instead of redirected.
import { POST as submitOperationForm } from "../../integrations/kakao/operation-forms/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = submitOperationForm;

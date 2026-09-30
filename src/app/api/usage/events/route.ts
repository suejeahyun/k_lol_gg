import { cookies } from "next/headers";
import { getCurrentSession, ACCOUNT_SESSION_COOKIE_NAME, ADMIN_SESSION_COOKIE_NAME } from "@/modules/auth/infrastructure/runtime-session";
import { hasSameOrigin } from "@/platform/http/same-origin";
import { readJsonBody } from "@/platform/http";
import { excludedUsageAgent, parseUsageEvent, usageEnabled } from "@/modules/usage/domain/usage";
import { createUsageVisitor, readUsageVisitor, USAGE_COOKIE } from "@/modules/usage/infrastructure/visitor-cookie";
import { excludedUsageUsers, usageRepository } from "@/modules/usage/infrastructure/runtime-usage";
export const runtime = "nodejs";
const response = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!usageEnabled(process.env)) return response();
  if (!hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN) || request.headers.get("sec-fetch-site") === "cross-site") return response(403);
  if (request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1" || excludedUsageAgent(request.headers.get("user-agent") ?? "")) return response();
  const body = await readJsonBody(request, { maximumBytes: 1024 });
  if (!body.ok) return response(body.error === "BODY_TOO_LARGE" ? 413 : 400);
  const event = parseUsageEvent(body.value);
  if (!event) return response(400);
  try {
    const jar = await cookies();
    if (jar.has(ADMIN_SESSION_COOKIE_NAME)) return response();
    const session = await getCurrentSession("ACCOUNT");
    // Invalid/stale authentication must not silently turn staff or fixture traffic into guests.
    if (jar.has(ACCOUNT_SESSION_COOKIE_NAME) && !session) return response();
    if (session && (session.role !== "USER" || session.source !== "database" || session.accountStatus !== "APPROVED" || excludedUsageUsers().includes(session.userId))) return response();
    const secret = process.env.USAGE_ANALYTICS_SECRET!;
    const existing = readUsageVisitor(jar.get(USAGE_COOKIE)?.value, secret);
    const created = existing ? null : createUsageVisitor(secret);
    const result = await usageRepository().record(event, existing ?? created!.id, session?.userId ?? null);
    if (created) jar.set(USAGE_COOKIE, created.value, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: 90 * 86400 });
    return response(result === "limited" ? 429 : 204);
  } catch {
    // Analytics outages never interrupt user actions and never expose database details.
    return response(503);
  }
}

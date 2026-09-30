import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import { kstDate, usageEnabled, usageRange } from "@/modules/usage/domain/usage";
import { excludedUsageUsers, usageRepository } from "@/modules/usage/infrastructure/runtime-usage";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const decision = await authorizeApiRole("ADMIN");
  if (!decision.allowed) return new Response(null, { status: decision.reason === "UNAUTHENTICATED" ? 401 : 403, headers: { "Cache-Control": "no-store" } });
  const query = new URL(request.url).searchParams;
  let range;
  try { range = usageRange(query.get("from") ?? undefined, query.get("to") ?? undefined); }
  catch { return new Response(null, { status: 400 }); }
  try {
    const report = await usageRepository().report(range, excludedUsageUsers());
    const first = report.coverage.firstEventAt ? kstDate(new Date(report.coverage.firstEventAt)) : null;
    const rows = [["날짜(KST)", "기록상태", "고유브라우저", "회원", "비회원브라우저", "방문", "조회", "현재수집상태"],
      ...report.daily.map((d) => {
        const missing = !first || d.date < first;
        return [d.date, missing ? "미수집" : d.date === first || d.date === kstDate(new Date()) ? "부분일" : "수집기록", ...[d.browsers, d.members, d.guests, d.visits, d.views].map((n) => missing ? "" : n), usageEnabled(process.env) ? "활성" : "중단"];
      })];
    return new Response("\uFEFF" + rows.map((r) => r.join(",")).join("\r\n"), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="klol-usage-${range.from}-${range.to}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}

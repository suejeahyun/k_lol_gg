import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getSiteSettings, isSiteFeatureEnabled } from "@/lib/site/settings";
import {
  isAdminOnlyQuestion,
  runSiteAiAssistant,
  type SiteAiChatMessage,
  type SiteAiScope,
} from "@/lib/ai/site-assistant";

export const dynamic = "force-dynamic";

const scopes: SiteAiScope[] = [
  "general",
  "admin",
  "player",
  "match",
  "balance",
  "destruction",
  "recruit",
];

function isScope(value: unknown): value is SiteAiScope {
  return typeof value === "string" && scopes.includes(value as SiteAiScope);
}

function normalizeHistory(value: unknown): SiteAiChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
        return null;
      }
      return {
        role,
        content: content.slice(0, 2000),
      };
    })
    .filter(Boolean)
    .slice(-6) as SiteAiChatMessage[];
}

function normalizePage(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as { pathname?: unknown; search?: unknown; title?: unknown };
  const pathname = typeof raw.pathname === "string" ? raw.pathname.slice(0, 300) : "";
  if (!pathname.startsWith("/")) return undefined;

  return {
    pathname,
    search: typeof raw.search === "string" ? raw.search.slice(0, 300) : "",
    title: typeof raw.title === "string" ? raw.title.slice(0, 120) : "",
  };
}

function isAdminRole(role: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function normalizeScopeForRole(scope: unknown, role: string): SiteAiScope {
  const requested = isScope(scope) ? scope : "general";
  if (isAdminRole(role)) return requested;
  if (requested === "admin" || requested === "recruit") return "general";
  return requested;
}

export async function POST(request: NextRequest) {
  const settings = await getSiteSettings();

  if (!isSiteFeatureEnabled(settings, "aiAssistant")) {
    return NextResponse.json(
      {
        ok: false,
        code: "FEATURE_LOCKED",
        message: "AI 운영 비서 기능은 현재 이 사이트에서 비활성화되어 있습니다.",
      },
      { status: 403 },
    );
  }

  const user = await getCurrentUser();
  if (!user || user.status !== "APPROVED") {
    return NextResponse.json(
      {
        ok: false,
        code: "UNAUTHORIZED",
        message: "로그인 후 사용할 수 있습니다.",
      },
      { status: 401 },
    );
  }

  const rateLimited = await rejectIfRateLimited(request, {
    action: "AI_CHAT",
    key: String(user.userAccountId),
    limit: user.role === "SUPER_ADMIN" || user.role === "ADMIN" ? 60 : 20,
    windowSeconds: 60 * 60,
  });
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_MESSAGE",
        message: "질문을 입력해주세요.",
      },
      { status: 400 },
    );
  }

  if (message.length > 2000) {
    return NextResponse.json(
      {
        ok: false,
        code: "MESSAGE_TOO_LONG",
        message: "질문은 2,000자 이하로 입력해주세요.",
      },
      { status: 400 },
    );
  }

  const scope = normalizeScopeForRole(body?.scope, user.role);

  if (!isAdminRole(user.role) && isAdminOnlyQuestion(message)) {
    return NextResponse.json({
      ok: true,
      answer:
        "권한 안내: 이 질문은 관리자 운영 정보에 해당해서 일반 유저에게는 제공할 수 없습니다.\n\n공개 랭킹, 내 플레이어 기록, 최근 내전, 멸망전 공개 진행 상태 기준으로는 도와드릴 수 있습니다.",
      mode: "fallback",
      model: "policy",
      context: null,
      requestId: null,
    });
  }

  const result = await runSiteAiAssistant({
    message,
    history: normalizeHistory(body?.history),
    scope,
    page: normalizePage(body?.page),
    user: {
      userAccountId: user.userAccountId,
      userId: user.userId,
      role: user.role,
      playerId: user.playerId,
    },
  });

  return NextResponse.json(result);
}

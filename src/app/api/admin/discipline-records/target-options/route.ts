import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { requireDisciplineApiSession } from "@/modules/discipline/infrastructure/discipline-http";
import { parseAdminTargetOptionQuery } from "@/modules/players/application/parse-admin-target-option-query";
import { PLAYER_HTTP_PROBLEMS } from "@/modules/players/application/player-http-problems";
import { getRuntimeAdminPlayerRepository } from "@/modules/players/infrastructure/runtime-admin-player-data";
import { noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TargetOption = Readonly<{
  value: string;
  label: string;
  status: "ACTIVE" | "INACTIVE";
  metadata: Readonly<{
    kind: "player" | "account";
    playerId: string | null;
    accountId: string | null;
    targetName: string;
    nickname: string | null;
    tagLine: string | null;
  }>;
}>;

export async function GET(request: Request) {
  const authorization = await requireDisciplineApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  const query = parseAdminTargetOptionQuery(request.url);
  if (!query) return problemResponse(PLAYER_HTTP_PROBLEMS.invalidPlayerQuery, { traceId });
  const playerRepository = getRuntimeAdminPlayerRepository();
  const accountRepository = getRuntimeAccountRepository();
  if (!playerRepository || !accountRepository) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });

  try {
    const viewerRole = authorization.session.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN";
    const [playerPage, accountPage, includedPlayer, includedAccount] = await Promise.all([
      playerRepository.list({ query: query.query, status: "ALL", page: 1, pageSize: 12 }),
      accountRepository.listAdmin({ query: query.query, status: "ALL", role: "ALL", deleted: "ACTIVE", page: 1, pageSize: 12 }, viewerRole),
      query.include?.kind === "player" ? playerRepository.findById(query.include.id) : Promise.resolve(null),
      query.include?.kind === "account" ? accountRepository.findAdmin(query.include.id, viewerRole) : Promise.resolve(null),
    ]);
    const options = new Map<string, TargetOption>();
    for (const player of [...playerPage.items, ...(includedPlayer ? [includedPlayer] : [])]) {
      options.set(`player:${player.id}`, {
        value: `player:${player.id}`,
        label: `${player.memberName} · ${player.riotId}${player.status === "INACTIVE" ? " · 비활성" : ""}`,
        status: "ACTIVE",
        metadata: {
          kind: "player",
          playerId: player.id,
          accountId: player.account?.id ?? null,
          targetName: player.memberName,
          nickname: player.nickname,
          tagLine: player.tagLine,
        },
      });
    }
    for (const account of [...accountPage.items, ...(includedAccount ? [includedAccount] : [])]) {
      const player = account.player;
      const key = player ? `player:${player.id}` : `account:${account.id}`;
      if (options.has(key)) continue;
      options.set(key, {
        value: key,
        label: player ? `${player.memberName} · ${player.riotId}` : `${account.loginId} · 연결 플레이어 없음`,
        status: "ACTIVE",
        metadata: {
          kind: player ? "player" : "account",
          playerId: player?.id ?? null,
          accountId: account.id,
          targetName: player?.memberName ?? account.loginId,
          nickname: player?.nickname ?? null,
          tagLine: player?.tagLine ?? null,
        },
      });
    }
    return noStoreJsonResponse({ items: [...options.values()].slice(0, 20) }, { traceId });
  } catch {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  }
}

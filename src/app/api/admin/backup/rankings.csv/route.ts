import { NextRequest } from "next/server";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";
import { createCsvResponse } from "@/lib/csv";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";

type RankingPlayer = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  participationCount: number;
  wins: number;
  losses: number;
  winRate: number;
  mvpCount: number;
};

type RankingResponse = {
  rankings?: RankingPlayer[];
};

export async function GET(req: NextRequest) {
  const admin = await requireSuperAdminRequest();
  if (!admin) {
    return Response.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

  const origin = req.nextUrl.origin;
  const seasonId = req.nextUrl.searchParams.get("seasonId");
  const res = await fetch(`${origin}/api/rankings${seasonId ? `?seasonId=${seasonId}` : ""}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    return Response.json(
      { message: "랭킹 데이터를 불러오지 못해 백업을 생성하지 않았습니다." },
      { status: 502 },
    );
  }
  const data = (await res.json().catch(() => null)) as RankingResponse | null;
  if (!data || !Array.isArray(data.rankings)) {
    return Response.json(
      { message: "랭킹 응답 형식이 올바르지 않아 백업을 생성하지 않았습니다." },
      { status: 502 },
    );
  }

  await writeAdminLog({
    action: "BACKUP_CSV_DOWNLOAD",
    message: "관리자 CSV 백업 다운로드: rankings.csv",
    actorId: admin.user.id,
    actorType: admin.user.role,
    actorUserId: admin.user.userId,
    targetType: "BackupCsv",
    afterJson: { file: "rankings.csv" },
    ...getRequestAuditFields(req),
  });

  return createCsvResponse(
    `rankings-${new Date().toISOString().slice(0, 10)}.csv`,
    ["playerId", "name", "riotId", "totalGames", "participationCount", "wins", "losses", "winRate", "mvpCount"],
    data.rankings.map((player) => [
      player.playerId,
      player.name,
      `${player.nickname}#${player.tag}`,
      player.totalGames,
      player.participationCount,
      player.wins,
      player.losses,
      player.winRate,
      player.mvpCount,
    ]),
  );
}

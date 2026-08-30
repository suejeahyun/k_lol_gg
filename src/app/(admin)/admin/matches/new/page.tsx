export const dynamic = "force-dynamic";

import Link from "next/link";
import MatchForm from "@/features/match/MatchForm";
import { getKstDateKey, toKstDateTimeLocalInputValue } from "@/lib/date/kst";
import { prisma } from "@/lib/prisma/client";

const TEAMS = ["BLUE", "RED"] as const;
const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

type Team = (typeof TEAMS)[number];
type Position = (typeof POSITIONS)[number];

type DraftPlayer = {
  playerId: number;
  team: string;
  position: string;
  player: {
    name: string;
    nickname: string;
    tag: string;
  };
};

type AutofillGame = {
  gameNumber: number;
  winnerTeam: Team;
  participants: Array<{
    playerId: number;
    playerInput: string;
    championId: number;
    championInput: string;
    team: Team;
    position: Position;
    kills: number;
    deaths: number;
    assists: number;
  }>;
};

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  return `${value}${value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th"}`;
}

function isTeam(value: string): value is Team {
  return TEAMS.includes(value as Team);
}

function isPosition(value: string): value is Position {
  return POSITIONS.includes(value as Position);
}

function buildAutofillGames(params: {
  submissionSeasonId: number | null;
  draftSeasonId: number | null;
  expectedGameCount: number;
  draftPlayers: DraftPlayer[];
}): { games: AutofillGame[]; message: string } {
  const {
    submissionSeasonId,
    draftSeasonId,
    expectedGameCount,
    draftPlayers,
  } = params;

  if (submissionSeasonId === null || draftSeasonId !== submissionSeasonId) {
    return {
      games: [],
      message: "접수 시즌과 팀 밸런스 시즌이 일치하지 않아 수동 입력 상태로 열었습니다.",
    };
  }

  if (draftPlayers.length !== 10) {
    return {
      games: [],
      message: `연결된 팀 밸런스 참가자가 ${draftPlayers.length}명이라 수동 입력 상태로 열었습니다.`,
    };
  }

  if (new Set(draftPlayers.map((entry) => entry.playerId)).size !== 10) {
    return {
      games: [],
      message: "연결된 팀 밸런스에 중복 참가자가 있어 수동 입력 상태로 열었습니다.",
    };
  }

  const hasInvalidSlot = draftPlayers.some(
    (entry) => !isTeam(entry.team) || !isPosition(entry.position)
  );
  const slotKeys = new Set(
    draftPlayers.map((entry) => `${entry.team}:${entry.position}`)
  );
  const hasEverySlot = TEAMS.every((team) =>
    POSITIONS.every((position) => slotKeys.has(`${team}:${position}`))
  );

  if (hasInvalidSlot || slotKeys.size !== 10 || !hasEverySlot) {
    return {
      games: [],
      message: "연결된 팀 밸런스의 팀 또는 포지션 구성이 올바르지 않아 수동 입력 상태로 열었습니다.",
    };
  }

  const teamOrder = new Map<Team, number>(TEAMS.map((team, index) => [team, index]));
  const positionOrder = new Map<Position, number>(
    POSITIONS.map((position, index) => [position, index])
  );
  const participants = draftPlayers
    .filter(
      (entry): entry is DraftPlayer & { team: Team; position: Position } =>
        isTeam(entry.team) && isPosition(entry.position)
    )
    .sort(
      (left, right) =>
        (teamOrder.get(left.team) ?? 99) - (teamOrder.get(right.team) ?? 99) ||
        (positionOrder.get(left.position) ?? 99) -
          (positionOrder.get(right.position) ?? 99)
    )
    .map((entry) => ({
      playerId: entry.playerId,
      playerInput: `${entry.player.name}(${entry.player.nickname}#${entry.player.tag})`,
      championId: 0,
      championInput: "",
      team: entry.team,
      position: entry.position,
      kills: 0,
      deaths: 0,
      assists: 0,
    }));

  return {
    games: Array.from({ length: Math.max(0, expectedGameCount) }, (_, index) => ({
      gameNumber: index + 1,
      winnerTeam: "BLUE" as const,
      participants: participants.map((participant) => ({ ...participant })),
    })),
    message: `팀 밸런스 참가자 10명을 ${expectedGameCount}개 세트에 자동으로 채웠습니다.`,
  };
}

function readMetadataText(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate.trim() : "";
}

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ submissionId?: string }>;
}) {
  const submissionId = Number((await searchParams).submissionId);
  const [seasons, players, champions, submission] = await Promise.all([
    prisma.season.findMany({ orderBy: { id: "desc" } }),
    prisma.player.findMany({ orderBy: { id: "asc" } }),
    prisma.champion.findMany({ orderBy: { id: "asc" } }),
    Number.isInteger(submissionId) && submissionId > 0
      ? prisma.inhouseResultSubmission.findUnique({
          where: { id: submissionId },
          include: {
            season: { select: { id: true, name: true } },
            teamBalanceDraft: {
              select: {
                id: true,
                title: true,
                seasonId: true,
                players: {
                  select: {
                    playerId: true,
                    team: true,
                    position: true,
                    player: {
                      select: {
                        name: true,
                        nickname: true,
                        tag: true,
                      },
                    },
                  },
                },
              },
            },
            images: {
              orderBy: { gameNumber: "asc" },
              select: {
                id: true,
                privateAssetId: true,
                gameNumber: true,
                ocrStatus: true,
                ocrError: true,
              },
            },
          },
        })
      : null,
  ]);

  const currentSeason =
    seasons.find((season: (typeof seasons)[number]) => season.isActive) ??
    seasons[0];
  const dateText = submission ? getKstDateKey(submission.matchDate) : "";
  const autofill = submission?.teamBalanceDraft
    ? buildAutofillGames({
        submissionSeasonId: submission.seasonId,
        draftSeasonId: submission.teamBalanceDraft.seasonId,
        expectedGameCount: submission.expectedGameCount,
        draftPlayers: submission.teamBalanceDraft.players,
      })
    : {
        games: [],
        message: submission
          ? "연결된 팀 밸런스가 없어 수동 입력 상태로 열었습니다."
          : "",
      };
  const note = submission
    ? readMetadataText(submission.parsedData, "note") || "없음"
    : "";
  const sourceLabel = submission?.roomName === "WEB" ? "사이트" : "카카오톡봇";

  return (
    <>
      {submission ? (
        <section className="admin-card" style={{ marginBottom: 20 }}>
          <h2>내전 결과 접수 {submission.publicCode}</h2>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "10px 18px",
              margin: "12px 0",
            }}
          >
            <div>
              <dt>접수 경로</dt>
              <dd>{sourceLabel}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>{submission.status}</dd>
            </div>
            <div>
              <dt>진행자</dt>
              <dd>{submission.organizer}</dd>
            </div>
            <div>
              <dt>진행일</dt>
              <dd>{dateText}</dd>
            </div>
            <div>
              <dt>회차·세트</dt>
              <dd>
                {submission.seriesNumber}회차 · {submission.expectedGameCount}세트
              </dd>
            </div>
            <div>
              <dt>시즌</dt>
              <dd>{submission.season?.name ?? "미지정"}</dd>
            </div>
            <div>
              <dt>팀 밸런스</dt>
              <dd>
                {submission.teamBalanceDraft
                  ? `${submission.teamBalanceDraft.title} (#${submission.teamBalanceDraft.id})`
                  : "없음"}
              </dd>
            </div>
            <div>
              <dt>특이사항</dt>
              <dd>{note}</dd>
            </div>
            {submission.roomName && submission.roomName !== "WEB" ? (
              <div>
                <dt>접수 방·발신자</dt>
                <dd>
                  {submission.roomName}
                  {submission.sender ? ` · ${submission.sender}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>

          <p
            role="status"
            style={{
              margin: "12px 0",
              color: autofill.games.length > 0 ? "#15803d" : "#b45309",
              fontWeight: 700,
            }}
          >
            {autofill.message}
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {submission.images.map((image) => (
              <Link
                key={image.id}
                target="_blank"
                className="admin-button admin-button--ghost"
                href={`/api/admin/private-assets/${image.privateAssetId}`}
              >
                {image.gameNumber}세트 사진 · {image.ocrStatus}
                {image.ocrError ? " (확인 필요)" : ""}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <MatchForm
        mode="create"
        submitUrl="/api/matches"
        seasons={seasons.map((season: (typeof seasons)[number]) => ({
          id: season.id,
          name: season.name,
        }))}
        players={players.map((player: (typeof players)[number]) => ({
          id: player.id,
          name: player.name,
          nickname: player.nickname,
          tag: player.tag,
        }))}
        champions={champions.map((champion: (typeof champions)[number]) => ({
          id: champion.id,
          name: champion.name,
        }))}
        submissionImages={submission?.images.map((image) => ({
          gameNumber: image.gameNumber,
          privateAssetId: image.privateAssetId,
        }))}
        initialData={{
          submissionId: submission?.id ?? null,
          initialGameCount: submission?.expectedGameCount ?? 0,
          seasonId: submission?.seasonId ?? currentSeason?.id ?? 1,
          title: submission
            ? `${dateText} ${ordinal(submission.seriesNumber)}`
            : "",
          matchDate: submission
            ? toKstDateTimeLocalInputValue(submission.matchDate)
            : toKstDateTimeLocalInputValue(),
          teamBalanceDraftId: submission?.teamBalanceDraftId ?? null,
          games: autofill.games,
        }}
      />
    </>
  );
}

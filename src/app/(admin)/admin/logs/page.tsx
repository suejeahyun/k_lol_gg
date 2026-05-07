export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Prisma } from "@prisma/client";
import Pagination from "@/components/Pagination";
import { prisma } from "@/lib/prisma/client";

type AdminLog = {
  id: number;
  action: string;
  message: string;
  createdAt: string;
};

type LogsResponse = {
  logs: AdminLog[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

type LogSearchParams = {
  page?: string;
  q?: string;
  group?: string;
  from?: string;
  to?: string;
};

const LOG_GROUPS = [
  ["", "전체"],
  ["ADMIN", "관리자"],
  ["USER", "회원"],
  ["PLAYER", "플레이어"],
  ["CHAMPION", "챔피언"],
  ["SEASON", "시즌/통계"],
  ["MATCH", "내전"],
  ["NOTICE", "공지"],
  ["GALLERY", "우승 이미지"],
  ["PARTICIPATION", "참가 신청"],
  ["BALANCE", "팀 밸런스"],
  ["RIOT", "Riot API"],
] as const;

const ACTION_GROUP_PREFIX: Record<string, string[]> = {
  ADMIN: ["ADMIN_"],
  USER: ["USER_", "MY_PLAYER_"],
  PLAYER: ["PLAYER_"],
  CHAMPION: ["CHAMPION_"],
  SEASON: ["SEASON_", "STATS_"],
  MATCH: ["MATCH_"],
  NOTICE: ["NOTICE_", "EVENT_NOTICE_"],
  GALLERY: ["GALLERY_"],
  PARTICIPATION: [
    "SEASON_PARTICIPATION_",
    "EVENT_PARTICIPATION_",
    "DESTRUCTION_PARTICIPATION_",
    "EVENT_PARTICIPANT_",
    "DESTRUCTION_PARTICIPANT_",
  ],
  BALANCE: ["TEAM_BALANCE_", "EVENT_TEAMS_"],
  RIOT: ["RIOT_"],
};

function parseDate(value: string | undefined, endOfDay = false) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);

  return date;
}

function buildWhere(searchParams: LogSearchParams): Prisma.AdminLogWhereInput {
  const q = String(searchParams.q ?? "").trim();
  const group = String(searchParams.group ?? "").trim();
  const from = parseDate(searchParams.from);
  const to = parseDate(searchParams.to, true);
  const prefixes = ACTION_GROUP_PREFIX[group] ?? [];

  const and: Prisma.AdminLogWhereInput[] = [];

  if (q) {
    and.push({
      OR: [
        { action: { contains: q, mode: "insensitive" } },
        { message: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (prefixes.length > 0) {
    and.push({
      OR: prefixes.map((prefix) => ({
        action: { startsWith: prefix, mode: "insensitive" },
      })),
    });
  }

  if (from || to) {
    and.push({
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function buildQuery(searchParams: LogSearchParams) {
  const params = new URLSearchParams();
  params.set("page", searchParams.page ?? "1");
  params.set("pageSize", "50");

  if (searchParams.q?.trim()) params.set("q", searchParams.q.trim());
  if (searchParams.group?.trim()) params.set("group", searchParams.group.trim());
  if (searchParams.from?.trim()) params.set("from", searchParams.from.trim());
  if (searchParams.to?.trim()) params.set("to", searchParams.to.trim());

  return params;
}

async function getLogs(searchParams: LogSearchParams): Promise<LogsResponse> {
  const page = Number(searchParams.page ?? "1");
  const pageSize = 50;
  const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
  const where = buildWhere(searchParams);

  const totalCount = await prisma.adminLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(safePage, totalPages);
  const skip = (currentPage - 1) * pageSize;

  const logs = await prisma.adminLog.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take: pageSize,
    select: {
      id: true,
      action: true,
      message: true,
      createdAt: true,
    },
  });

  return {
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      message: log.message,
      createdAt: log.createdAt.toISOString(),
    })),
    pagination: {
      page: currentPage,
      pageSize,
      totalCount,
      totalPages,
    },
  };
}

type PageProps = {
  searchParams: Promise<LogSearchParams>;
};

export default async function AdminLogsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const q = resolvedSearchParams.q ?? "";
  const group = resolvedSearchParams.group ?? "";
  const from = resolvedSearchParams.from ?? "";
  const to = resolvedSearchParams.to ?? "";

  let data: LogsResponse = {
    logs: [],
    pagination: {
      page: 1,
      pageSize: 50,
      totalCount: 0,
      totalPages: 1,
    },
  };
  let errorMessage: string | null = null;

  try {
    data = await getLogs(resolvedSearchParams);
  } catch (error) {
    console.error("[ADMIN_LOGS_PAGE_ERROR]", error);
    errorMessage =
      "로그 목록을 불러오지 못했습니다. Vercel DATABASE_URL과 AdminLog(action, message, createdAt) 컬럼 상태를 확인하세요.";
  }

  const paginationQuery = {
    q: q || undefined,
    group: group || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const csvParams = buildQuery({ ...resolvedSearchParams, page: "1" });
  csvParams.set("download", "csv");

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="admin-page__kicker">OPERATION LOG</p>
          <h1>관리자 로그</h1>
          <p className="admin-page__description">
            생성, 수정, 삭제, 승인, 활성화, 참가 신청 등 주요 변경 이력을
            조건별로 추적합니다.
          </p>
        </div>
        <a className="admin-button admin-button--ghost" href={`/api/logs?${csvParams.toString()}`}>
          CSV 다운로드
        </a>
      </div>

      <form className="admin-filter-bar admin-filter-bar--grid" action="/admin/logs">
        <input
          name="q"
          defaultValue={q}
          placeholder="액션 또는 메시지 검색"
          className="admin-input"
        />

        <select name="group" defaultValue={group} className="admin-input">
          {LOG_GROUPS.map(([value, label]) => (
            <option key={value || "ALL"} value={value}>
              {label}
            </option>
          ))}
        </select>

        <input name="from" defaultValue={from} type="date" className="admin-input" />
        <input name="to" defaultValue={to} type="date" className="admin-input" />

        <button className="admin-button" type="submit">
          조회
        </button>
      </form>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>로그 목록</h2>
            <p className="admin-muted">
              총 {data.pagination.totalCount.toLocaleString("ko-KR")}개 · 현재{" "}
              {data.pagination.page} / {data.pagination.totalPages}페이지
            </p>
          </div>
        </div>

        {errorMessage ? (
          <div className="admin-empty">
            <strong>로그 조회 실패</strong>
            <p>{errorMessage}</p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>액션</th>
                    <th>내용</th>
                    <th>시간</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.length === 0 ? (
                    <tr>
                      <td colSpan={4}>조건에 맞는 관리자 로그가 없습니다.</td>
                    </tr>
                  ) : (
                    data.logs.map((log) => (
                      <tr key={log.id}>
                        <td>{log.id}</td>
                        <td>
                          <span className="admin-log-action-pill">{log.action}</span>
                        </td>
                        <td>{log.message}</td>
                        <td>
                          {new Intl.DateTimeFormat("ko-KR", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(log.createdAt))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              basePath="/admin/logs"
              query={paginationQuery}
            />
          </>
        )}
      </section>
    </main>
  );
}

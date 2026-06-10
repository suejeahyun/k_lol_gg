export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Prisma } from "@prisma/client";
import Pagination from "@/components/Pagination";
import AdminRecruitAutoResetSettings from "./AdminRecruitAutoResetSettings";
import AdminRecruitNumberResetButton from "./AdminRecruitNumberResetButton";
import AdminRecruitResetAllButton from "./AdminRecruitResetAllButton";
import { getRecruitAutoResetSettings } from "@/lib/kakao/recruit-auto-reset";
import { prisma } from "@/lib/prisma/client";
import {
  buildGameInfoText,
  getActiveMemberCount,
  getRecruitStatusLabel,
  getRecruitTypeLabel,
} from "@/lib/kakao/party-recruit";

type PageSearchParams = {
  page?: string;
  logPage?: string;
  q?: string;
  date?: string;
};

type PageProps = {
  searchParams: Promise<PageSearchParams>;
};

const PAGE_SIZE = 20;
const LOG_PAGE_SIZE = 20;


function buildAdminRecruitHref(params: {
  page?: number;
  logPage?: number;
  q?: string;
  date?: string;
}) {
  const query = new URLSearchParams();

  if (params.page && params.page > 1) query.set("page", String(params.page));
  if (params.logPage && params.logPage > 1) query.set("logPage", String(params.logPage));
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.date?.trim()) query.set("date", params.date.trim());

  const queryString = query.toString();
  return queryString ? `/admin/recruits?${queryString}` : "/admin/recruits";
}

function InlinePager({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <nav className="admin-inline-pagination" aria-label="구인 관리 페이지네이션">
      <a className={`chip-button ${currentPage <= 1 ? "is-disabled" : ""}`} href={currentPage <= 1 ? "#" : buildHref(currentPage - 1)}>
        이전
      </a>
      {start > 1 ? <span className="admin-inline-pagination__ellipsis">...</span> : null}
      {pages.map((page) => (
        <a key={page} className={`chip-button ${page === currentPage ? "is-active" : ""}`} href={buildHref(page)}>
          {page}
        </a>
      ))}
      {end < totalPages ? <span className="admin-inline-pagination__ellipsis">...</span> : null}
      <a className={`chip-button ${currentPage >= totalPages ? "is-disabled" : ""}`} href={currentPage >= totalPages ? "#" : buildHref(currentPage + 1)}>
        다음
      </a>
    </nav>
  );
}

function formatKstDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildPartyWhere(searchParams: PageSearchParams): Prisma.RecruitPartyWhereInput {
  const q = String(searchParams.q ?? "").trim();
  const date = String(searchParams.date ?? "").trim();
  const and: Prisma.RecruitPartyWhereInput[] = [{ status: "IN_PROGRESS" }];

  if (date) {
    and.push({ recruitDate: date });
  }

  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { recruitCode: { contains: q, mode: "insensitive" } },
        { roomName: { contains: q, mode: "insensitive" } },
        { hostName: { contains: q, mode: "insensitive" } },
        { members: { some: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  return { AND: and };
}

function buildLogWhere(searchParams: PageSearchParams): Prisma.RecruitPartyLogWhereInput {
  const q = String(searchParams.q ?? "").trim();
  const date = String(searchParams.date ?? "").trim();
  const and: Prisma.RecruitPartyLogWhereInput[] = [];

  if (date) {
    and.push({ recruitDate: date });
  }

  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { roomName: { contains: q, mode: "insensitive" } },
        { sender: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

export default async function AdminRecruitsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams.page ?? "1");
  const logPage = Number(resolvedSearchParams.logPage ?? "1");
  const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
  const safeLogPage = Number.isNaN(logPage) || logPage < 1 ? 1 : logPage;
  const q = resolvedSearchParams.q ?? "";
  const date = resolvedSearchParams.date ?? "";
  const where = buildPartyWhere(resolvedSearchParams);
  const logWhere = buildLogWhere(resolvedSearchParams);

  const [totalCount, activeCount, fullCount, logTotalCount, parties, recentLogs, autoResetSettings] = await Promise.all([
    prisma.recruitParty.count({ where }),
    prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } }),
    prisma.recruitParty.count({
      where: {
        status: "IN_PROGRESS",
        members: { some: { name: { not: "" } } },
      },
    }),
    prisma.recruitPartyLog.count({ where: logWhere }),
    prisma.recruitParty.findMany({
      where,
      include: {
        members: {
          orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.recruitPartyLog.findMany({
      where: logWhere,
      orderBy: [{ createdAt: "desc" }],
      skip: (safeLogPage - 1) * LOG_PAGE_SIZE,
      take: LOG_PAGE_SIZE,
    }),
    getRecruitAutoResetSettings(),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const logTotalPages = Math.max(1, Math.ceil(logTotalCount / LOG_PAGE_SIZE));
  const paginationQuery = {
    q: q || undefined,
    date: date || undefined,
    logPage: safeLogPage > 1 ? String(safeLogPage) : undefined,
  };

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="admin-page__kicker">KAKAO RECRUIT</p>
          <h1>카카오 구인구직 관리</h1>
        </div>
        <a className="admin-button admin-button--ghost" href="/recruit" target="_blank" rel="noreferrer">
          유저 현황 보기
        </a>
      </div>

      <section className="card-grid">
        <div className="stat-card">
          <span className="stat-card__label">전체 진행 중</span>
          <strong className="stat-card__value">{activeCount.toLocaleString("ko-KR")}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">현재 조회 결과</span>
          <strong className="stat-card__value">{totalCount.toLocaleString("ko-KR")}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">참가자 입력 있음</span>
          <strong className="stat-card__value">{fullCount.toLocaleString("ko-KR")}</strong>
        </div>
      </section>

      <form className="admin-filter-bar admin-filter-bar--grid" action="/admin/recruits">
        <input name="q" defaultValue={q} placeholder="제목, 방, 생성자, 참가자 검색" className="admin-input" />
        <input name="date" defaultValue={date} type="date" className="admin-input" />
        <button className="admin-button" type="submit">조회</button>
        <a className="admin-button admin-button--ghost" href="/admin/recruits">검색조건 초기화</a>
      </form>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>진행 중 구인글</h2>
            <p className="admin-muted">
              총 {totalCount.toLocaleString("ko-KR")}개 · 번호 중복은 날짜/회차로 구분합니다. 자동 초기화는 진행 중 구인글이 0개일 때만 동작합니다.
            </p>
          </div>
          <div className="admin-recruit-actions">
            <AdminRecruitAutoResetSettings
              initialEnabled={autoResetSettings.enabled}
              initialIdleHours={autoResetSettings.idleHours}
            />
            <AdminRecruitNumberResetButton />
            <AdminRecruitResetAllButton />
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>날짜/회차</th>
                <th>번호</th>
                <th>관리번호</th>
                <th>유형</th>
                <th>제목</th>
                <th>인원</th>
                <th>게임정보</th>
                <th>방/생성자</th>
                <th>수정일</th>
              </tr>
            </thead>
            <tbody>
              {parties.length === 0 ? (
                <tr>
                  <td colSpan={9}>조건에 맞는 진행 중 구인글이 없습니다.</td>
                </tr>
              ) : (
                parties.map((party) => {
                  const activeMembers = getActiveMemberCount(party.members);
                  const statusLabel = getRecruitStatusLabel(party);
                  const gameInfo = buildGameInfoText(party) || "-";
                  return (
                    <tr key={party.id}>
                      <td>{party.recruitDate} / {party.resetSeq}</td>
                      <td>#{party.recruitNo}</td>
                      <td>{party.recruitCode || `${party.recruitDate}-${party.maxMembers}-${party.recruitNo}`}</td>
                      <td>{getRecruitTypeLabel(party.type)}</td>
                      <td>
                        <strong>{party.title}</strong>
                        <div className="admin-muted">{statusLabel}</div>
                      </td>
                      <td>{activeMembers}/{party.maxMembers}</td>
                      <td>{gameInfo}</td>
                      <td>
                        <div>{party.roomName || "-"}</div>
                        <div className="admin-muted">{party.hostName || "-"}</div>
                      </td>
                      <td>{formatKstDateTime(party.updatedAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={Math.min(safePage, totalPages)}
          totalPages={totalPages}
          basePath="/admin/recruits"
          query={paginationQuery}
        />
      </section>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>최근 구인구직 기록</h2>
            <p className="admin-muted">초기화, 마감, 자동 처리 기록을 페이지 단위로 확인합니다. 총 {logTotalCount.toLocaleString("ko-KR")}개</p>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>시간</th>
                <th>날짜/회차</th>
                <th>번호</th>
                <th>제목</th>
                <th>인원</th>
                <th>방/처리자</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={6}>구인구직 기록이 없습니다.</td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatKstDateTime(log.createdAt)}</td>
                    <td>{log.recruitDate || "-"} / {log.resetSeq}</td>
                    <td>{log.recruitNo > 0 ? `#${log.recruitNo}` : "-"}</td>
                    <td>{log.title}</td>
                    <td>{log.memberCount}/{log.maxMembers}</td>
                    <td>
                      <div>{log.roomName || "-"}</div>
                      <div className="admin-muted">{log.sender || "-"}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <InlinePager
          currentPage={Math.min(safeLogPage, logTotalPages)}
          totalPages={logTotalPages}
          buildHref={(targetPage) =>
            buildAdminRecruitHref({
              page: safePage,
              logPage: targetPage,
              q,
              date,
            })
          }
        />
      </section>
    </main>
  );
}

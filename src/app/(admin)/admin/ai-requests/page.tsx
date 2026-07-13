export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import styles from "../logs/page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams?: Promise<SearchParams> };

function getString(params: SearchParams, key: string, fallback = "") {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function getNumber(params: SearchParams, key: string, fallback: number, min: number, max: number) {
  const parsed = Number(getString(params, key, String(fallback)));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function buildHref(params: SearchParams, patch: Record<string, string | number | null>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) next.set(key, value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  const query = next.toString();
  return `/admin/ai-requests${query ? `?${query}` : ""}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function compact(value: unknown, max = 120, fallback = "-") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function jsonObject(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function nestedObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getResultMode(value: Prisma.JsonValue | null) {
  const result = jsonObject(value);
  const mode = result.mode;
  return mode === "openai" || mode === "fallback" ? mode : "unknown";
}

function getResultModel(value: Prisma.JsonValue | null) {
  const result = jsonObject(value);
  const model = result.model;
  return typeof model === "string" && model.trim() ? model.trim() : "-";
}

function getPagePath(value: Prisma.JsonValue | null) {
  const parsed = jsonObject(value);
  const page = nestedObject(parsed.page);
  const pathname = page.pathname;
  return typeof pathname === "string" ? pathname : "-";
}

function getContextPage(value: Prisma.JsonValue | null) {
  const parsed = jsonObject(value);
  const page = nestedObject(parsed.page);
  const summary = page.summary;
  return typeof summary === "string" ? summary : "";
}

function statusLabel(status: string) {
  if (status === "CONFIRMED") return "완료";
  if (status === "FAILED") return "실패";
  if (status === "REJECTED") return "거절";
  return "대기";
}

function modeLabel(mode: string) {
  if (mode === "openai") return "정밀 응답";
  if (mode === "fallback") return "기본 응답";
  return "-";
}

export default async function AdminAiRequestsPage(props: PageProps) {
  const admin = await requireAdminRequest();
  if (!admin) redirect("/admin/login");

  const params = (await props.searchParams) ?? {};
  const q = getString(params, "q").trim();
  const status = getString(params, "status").trim();
  const mode = getString(params, "mode").trim();
  const days = getNumber(params, "days", 30, 1, 3650);
  const page = getNumber(params, "page", 1, 1, 99999);
  const pageSize = getNumber(params, "pageSize", 30, 10, 100);
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - days);

  const and: Prisma.OperationAiRequestWhereInput[] = [
    { taskType: "SITE_AI_CHAT" },
    { createdAt: { gte: from } },
  ];

  if (q) {
    and.push({
      OR: [
        { prompt: { contains: q, mode: "insensitive" } },
        { rawText: { contains: q, mode: "insensitive" } },
        { errorMessage: { contains: q, mode: "insensitive" } },
        { createdByUserId: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (status && ["PENDING", "CONFIRMED", "REJECTED", "FAILED"].includes(status)) {
    and.push({ status: status as Prisma.EnumOperationAiRequestStatusFilter["equals"] });
  }

  const where: Prisma.OperationAiRequestWhereInput = { AND: and };

  const [requests, total, recentForStats] = await Promise.all([
    prisma.operationAiRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.operationAiRequest.count({ where }),
    prisma.operationAiRequest.findMany({
      where: { taskType: "SITE_AI_CHAT", createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { status: true, resultJson: true, createdByUserId: true, createdAt: true },
    }),
  ]);

  const filteredRequests = mode
    ? requests.filter((request) => getResultMode(request.resultJson) === mode)
    : requests;
  const openAiCount = recentForStats.filter((request) => getResultMode(request.resultJson) === "openai").length;
  const fallbackCount = recentForStats.filter((request) => getResultMode(request.resultJson) === "fallback").length;
  const failedCount = recentForStats.filter((request) => request.status === "FAILED").length;
  const uniqueUserCount = new Set(recentForStats.map((request) => request.createdByUserId).filter(Boolean)).size;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>AI OPERATIONS</p>
          <h1 className={styles.title}>AI 운영 비서 로그</h1>
          <p className={styles.desc}>사이트 내부 AI 질문, 응답 모드, 실패 원인, 현재 페이지 컨텍스트를 추적합니다.</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondaryButton} href="/admin/site-settings">AI 기능 설정</Link>
        </div>
      </div>

      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}><span>검색 결과</span><strong>{total.toLocaleString()}건</strong><em>최근 {days}일 기준</em></div>
        <div className={styles.kpiCard}><span>정밀 응답</span><strong>{openAiCount.toLocaleString()}건</strong><em>확장 분석 응답</em></div>
        <div className={styles.kpiCard}><span>기본 응답</span><strong>{fallbackCount.toLocaleString()}건</strong><em>사이트 데이터 요약</em></div>
        <div className={styles.kpiCard}><span>점검/사용자</span><strong>{failedCount.toLocaleString()} / {uniqueUserCount.toLocaleString()}</strong><em>점검 건수 · 요청자</em></div>
      </section>

      <form className={styles.filterCard} method="get">
        <div className={styles.filterGrid}>
          <label>검색<input name="q" defaultValue={q} placeholder="질문, 요청자, 오류" /></label>
          <label>상태<select name="status" defaultValue={status}><option value="">전체</option><option value="CONFIRMED">완료</option><option value="FAILED">실패</option><option value="PENDING">대기</option><option value="REJECTED">거절</option></select></label>
          <label>응답 모드<select name="mode" defaultValue={mode}><option value="">전체</option><option value="openai">정밀 응답</option><option value="fallback">기본 응답</option></select></label>
          <label>기간<select name="days" defaultValue={String(days)}><option value="1">최근 1일</option><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option><option value="365">최근 1년</option></select></label>
          <label>페이지<select name="pageSize" defaultValue={String(pageSize)}><option value="10">10개</option><option value="30">30개</option><option value="50">50개</option><option value="100">100개</option></select></label>
          <button className={styles.primaryButton} type="submit">조회</button>
        </div>
      </form>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <h2>요청 목록</h2>
            <p>응답 모드 필터는 현재 페이지 결과에서 적용됩니다. 전체 통계는 선택 기간 기준입니다.</p>
          </div>
          <span className={styles.tableMeta}>{page.toLocaleString()} / {pageCount.toLocaleString()} 페이지</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup>
              <col style={{ width: "118px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "100px" }} />
              <col style={{ width: "130px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "190px" }} />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>시간</th>
                <th>상태</th>
                <th>모드</th>
                <th>모델</th>
                <th>요청자</th>
                <th>페이지</th>
                <th>질문</th>
                <th>페이지 컨텍스트/오류</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr><td colSpan={8}><div className={styles.empty}>표시할 AI 요청 로그가 없습니다.</div></td></tr>
              ) : filteredRequests.map((request) => {
                const resultMode = getResultMode(request.resultJson);
                const resultModel = getResultModel(request.resultJson);
                const pagePath = getPagePath(request.parsedJson);
                const contextPage = getContextPage(request.parsedJson);
                return (
                  <tr key={request.id}>
                    <td className={styles.timeCell} data-label="시간">{formatDate(request.createdAt)}</td>
                    <td data-label="상태"><span className={styles.badge}>{statusLabel(request.status)}</span></td>
                    <td data-label="모드"><span className={styles.badge}>{modeLabel(resultMode)}</span></td>
                    <td data-label="모델"><span className={styles.badge}>{compact(resultModel, 28)}</span></td>
                    <td data-label="요청자">{compact(request.createdByUserId)}</td>
                    <td data-label="페이지">{pagePath !== "-" ? <Link href={pagePath}>{compact(pagePath, 46)}</Link> : "-"}</td>
                    <td className={styles.message} data-label="질문">{compact(request.prompt, 220)}</td>
                    <td className={styles.message} data-label="페이지 컨텍스트/오류">
                      {request.errorMessage ? compact(request.errorMessage, 220) : compact(contextPage, 220)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <Link className={styles.pageButton} href={buildHref(params, { page: Math.max(1, page - 1) })}>이전</Link>
          <span className={styles.pageInfo}>{page.toLocaleString()} / {pageCount.toLocaleString()}</span>
          <Link className={styles.pageButton} href={buildHref(params, { page: Math.min(pageCount, page + 1) })}>다음</Link>
        </div>
      </section>
    </main>
  );
}

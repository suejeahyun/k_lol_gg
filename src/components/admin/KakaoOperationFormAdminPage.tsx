import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import {
  extractKakaoLeaveScopeFromText,
  kakaoOperationFormLabels,
  type KakaoOperationFormType,
} from "@/lib/kakao/operation-forms";
import KakaoOperationFormActions from "@/components/admin/KakaoOperationFormActions";

type SearchParams = Promise<{
  status?: string;
}>;

type Props = {
  type: KakaoOperationFormType;
  searchParams?: SearchParams;
};

type Row = {
  id: number;
  status: string;
  rawText: string;
  createdAt: Date;
  summary: string;
  subSummary: string;
  detail: string;
};

type PageConfig = {
  title: string;
  summaryLabel: string;
  subSummaryLabel: string;
  detailLabel: string;
};

const pageConfigs: Record<KakaoOperationFormType, PageConfig> = {
  leaves: {
    title: "외출 신청",
    summaryLabel: "이름 및 닉네임",
    subSummaryLabel: "외출 기간",
    detailLabel: "사유 / 범위",
  },
  meetups: {
    title: "오프라인 모임",
    summaryLabel: "주최자",
    subSummaryLabel: "일자 / 장소",
    detailLabel: "참여자 명단",
  },
  suggestions: {
    title: "건의",
    summaryLabel: "본인 정보",
    subSummaryLabel: "건의 사유",
    detailLabel: "건의 내용",
  },
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);

  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour24 = Number(get("hour")) % 24;
  const minute = get("minute");
  const marker = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return `${year}. ${month}. ${day}. ${marker} ${pad2(hour12)}:${minute}`;
}

async function getRows(type: KakaoOperationFormType): Promise<Row[]> {
  const visibleWhere = { status: { not: "CANCELLED" } };

  if (type === "suggestions") {
    const items = await prisma.kakaoSuggestionRequest.findMany({ where: visibleWhere, orderBy: { createdAt: "desc" }, take: 200 });
    return items.map((item) => ({
      id: item.id,
      status: item.status,
      rawText: item.rawText,
      createdAt: item.createdAt,
      summary: item.requesterInfo,
      subSummary: item.reason,
      detail: item.content,
    }));
  }

  if (type === "meetups") {
    const items = await prisma.kakaoMeetupRecord.findMany({ where: visibleWhere, orderBy: { createdAt: "desc" }, take: 200 });
    return items.map((item) => ({
      id: item.id,
      status: item.status,
      rawText: item.rawText,
      createdAt: item.createdAt,
      summary: item.hostInfo,
      subSummary: `${item.eventDateText} · ${item.place}`,
      detail: item.participants,
    }));
  }

  const items = await prisma.kakaoLeaveRequest.findMany({ where: visibleWhere, orderBy: { createdAt: "desc" }, take: 200 });
  return items.map((item) => {
    const parsedScope = extractKakaoLeaveScopeFromText(item.rawText);
    const displayScope = item.scope && item.scope !== "미입력" ? item.scope : parsedScope || item.scope || "미입력";

    return {
      id: item.id,
      status: item.status,
      rawText: item.rawText,
      createdAt: item.createdAt,
      summary: item.requesterInfo,
      subSummary: item.leavePeriod,
      detail: `${item.reason}${displayScope ? ` · ${displayScope}` : ""}`,
    };
  });
}

function ShortText({ value, lines = 2 }: { value: string; lines?: number }) {
  return (
    <span
      title={value}
      style={{
        display: "-webkit-box",
        WebkitLineClamp: lines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        lineHeight: 1.45,
        wordBreak: "break-word",
        color: "#f8fafc",
      }}
    >
      {value || "-"}
    </span>
  );
}

export default async function KakaoOperationFormAdminPage({ type }: Props) {
  const rows = await getRows(type);
  const config = pageConfigs[type] || {
    title: kakaoOperationFormLabels[type],
    summaryLabel: "요약",
    subSummaryLabel: "상세",
    detailLabel: "내용",
  };

  return (
    <main className="admin-page" style={{ width: "100%" }}>
      <div style={{ width: "min(100%, 1500px)", maxWidth: "calc(100vw - 40px)", margin: "0 auto" }}>
        <div className="admin-page__header" style={{ marginBottom: 22 }}>
          <div>
            <p className="page-eyebrow">KAKAO OPERATION FORMS</p>
            <h1>{config.title}</h1>
            <p className="admin-muted" style={{ marginTop: 8 }}>
              정보 확인 및 보관용 목록입니다. 답변/자동 완료/자동 초대 처리는 하지 않습니다.
            </p>
          </div>
          <Link className="admin-button admin-button--ghost" href="/admin/operation-forms">
            운영 신청 홈
          </Link>
        </div>

        <section className="admin-card" style={{ padding: 22, overflow: "hidden" }}>
          <div
            className="admin-card__header"
            style={{
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2>접수 목록</h2>
              <p>최근 200건 기준 · 현재 표시 {rows.length}건</p>
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: "1px solid rgba(34, 211, 238, 0.18)",
                background: "rgba(15, 23, 42, 0.7)",
                color: "#dbeafe",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              총 {rows.length}건
            </div>
          </div>

          <div className="admin-table-wrap" style={{ overflowX: "visible", width: "100%" }}>
            <table
              className="admin-table"
              style={{
                width: "100%",
                minWidth: 0,
                tableLayout: "fixed",
                borderCollapse: "separate",
                borderSpacing: 0,
              }}
            >
              <colgroup>
                <col style={{ width: 64 }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "28%" }} />
                <col style={{ width: 132 }} />
                <col style={{ width: 112 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{config.summaryLabel}</th>
                  <th>{config.subSummaryLabel}</th>
                  <th>{config.detailLabel}</th>
                  <th>등록 일시</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 28, textAlign: "center" }}>
                      등록된 항목이 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="ID" style={{ padding: "14px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>
                        #{row.id}
                      </td>
                      <td data-label={config.summaryLabel} style={{ padding: "14px 8px", verticalAlign: "top" }}>
                        <ShortText value={row.summary} />
                      </td>
                      <td data-label={config.subSummaryLabel} style={{ padding: "14px 8px", verticalAlign: "top" }}>
                        <ShortText value={row.subSummary} />
                      </td>
                      <td data-label={config.detailLabel} style={{ padding: "14px 8px", verticalAlign: "top" }}>
                        <ShortText value={row.detail} lines={2} />
                      </td>
                      <td data-label="등록 일시" style={{ padding: "14px 8px", fontSize: "0.82rem", lineHeight: 1.45, wordBreak: "keep-all" }}>
                        {formatDate(row.createdAt)}
                      </td>
                      <td data-label="관리" style={{ padding: "12px 6px", verticalAlign: "top", overflow: "visible" }}>
                        <KakaoOperationFormActions formType={type} id={row.id} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

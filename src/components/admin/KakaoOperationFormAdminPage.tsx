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
  memo: string | null;
  rawText: string;
  createdAt: Date;
  cells: string[];
};

type PageConfig = {
  title: string;
  headers: string[];
  emptyColSpan: number;
  columnWidths: string[];
};

const pageConfigs: Record<KakaoOperationFormType, PageConfig> = {
  leaves: {
    title: "외출 신청",
    headers: ["ID", "이름 및 닉네임", "외출기간", "외출사유", "외출범위", "등록 일시", "메모", "관리", "원문보기"],
    emptyColSpan: 9,
    columnWidths: ["6%", "13%", "12%", "15%", "15%", "15%", "8%", "8%", "8%"],
  },
  meetups: {
    title: "오프라인 모임",
    headers: ["ID", "주최자 이름 및 닉네임", "일자", "장소", "참여자 명단", "등록 일시", "메모", "관리", "원문보기"],
    emptyColSpan: 9,
    columnWidths: ["6%", "15%", "9%", "11%", "18%", "15%", "8%", "8%", "10%"],
  },
  suggestions: {
    title: "건의",
    headers: ["ID", "본인 이름 및 닉네임", "건의 사유", "건의 내용", "등록 일시", "메모", "관리", "원문보기"],
    emptyColSpan: 8,
    columnWidths: ["6%", "15%", "20%", "23%", "15%", "7%", "7%", "7%"],
  },
  friends: {
    title: "디스코드 초대",
    headers: ["ID", "지인 이름", "지인 닉네임", "이용기간", "디스코드 닉네임 변경", "등록 일시", "메모", "관리", "원문보기"],
    emptyColSpan: 9,
    columnWidths: ["6%", "11%", "11%", "11%", "22%", "15%", "8%", "8%", "8%"],
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
  if (type === "friends") {
    const items = await prisma.kakaoFriendApplication.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return items.map((item) => ({
      id: item.id,
      memo: item.memo,
      rawText: item.rawText,
      createdAt: item.createdAt,
      cells: [
        item.friendName,
        item.friendNickname,
        item.gameName ? `${item.usageType} · ${item.gameName}` : item.usageType,
        item.discordNicknameChange || "-",
      ],
    }));
  }

  if (type === "suggestions") {
    const items = await prisma.kakaoSuggestionRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return items.map((item) => ({
      id: item.id,
      memo: item.memo,
      rawText: item.rawText,
      createdAt: item.createdAt,
      cells: [item.requesterInfo, item.reason, item.content],
    }));
  }

  if (type === "meetups") {
    const items = await prisma.kakaoMeetupRecord.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return items.map((item) => ({
      id: item.id,
      memo: item.memo,
      rawText: item.rawText,
      createdAt: item.createdAt,
      cells: [item.hostInfo, item.eventDateText, item.place, item.participants],
    }));
  }

  const items = await prisma.kakaoLeaveRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return items.map((item) => {
    const parsedScope = extractKakaoLeaveScopeFromText(item.rawText);
    const displayScope = item.scope && item.scope !== "미입력" ? item.scope : parsedScope || item.scope || "미입력";

    return {
      id: item.id,
      memo: item.memo,
      rawText: item.rawText,
      createdAt: item.createdAt,
      cells: [item.requesterInfo, item.leavePeriod, item.reason, displayScope],
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
    headers: ["ID", "내용", "등록 일시", "메모", "관리", "원문보기"],
    emptyColSpan: 6,
    columnWidths: ["8%", "40%", "18%", "12%", "10%", "12%"],
  };

  return (
    <main className="admin-page" style={{ width: "100%" }}>
      <div style={{ width: "min(100%, 1720px)", maxWidth: "calc(100vw - 40px)", margin: "0 auto" }}>
        <div className="admin-page__header" style={{ marginBottom: 22 }}>
          <div>
            <p className="page-eyebrow">KAKAO OPERATION FORMS</p>
            <h1>{config.title}</h1>
          </div>
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
                {config.columnWidths.map((width, index) => (
                  <col key={`${config.title}-${index}`} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {config.headers.map((header) => (
                    <th
                      key={header}
                      style={{
                        whiteSpace: "nowrap",
                        textAlign: "left",
                        fontSize: "0.82rem",
                        padding: "12px 10px",
                        color: "#93c5fd",
                        background: "rgba(7, 18, 38, 0.92)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={config.emptyColSpan} style={{ padding: 28, textAlign: "center" }}>
                      등록된 항목이 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="ID" style={{ padding: "14px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>
                        #{row.id}
                      </td>
                      {row.cells.map((cell, index) => (
                        <td
                          key={`${row.id}-${index}`}
                          data-label={config.headers[index + 1]}
                          style={{ padding: "14px 10px", verticalAlign: "top" }}
                        >
                          <ShortText value={cell} lines={index === row.cells.length - 1 && type !== "suggestions" ? 2 : 2} />
                        </td>
                      ))}
                      <td
                        data-label="등록 일시"
                        style={{
                          padding: "14px 10px",
                          whiteSpace: "normal",
                          verticalAlign: "top",
                          fontSize: "0.86rem",
                          lineHeight: 1.45,
                        }}
                      >
                        {formatDate(row.createdAt)}
                      </td>
                      <td data-label="메모" style={{ padding: "14px 10px", verticalAlign: "top" }}>
                        <ShortText value={row.memo || "-"} lines={1} />
                      </td>
                      <td data-label="관리" style={{ padding: "12px 8px", verticalAlign: "top" }}>
                        <KakaoOperationFormActions formType={type} id={row.id} memo={row.memo} />
                      </td>
                      <td data-label="원문보기" style={{ padding: "12px 8px", verticalAlign: "top" }}>
                        <details>
                          <summary
                            style={{
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              fontWeight: 700,
                              color: "#7dd3fc",
                              fontSize: "0.86rem",
                            }}
                          >
                            원문
                          </summary>
                          <pre
                            style={{
                              whiteSpace: "pre-wrap",
                              minWidth: 220,
                              margin: "10px 0 0",
                              padding: 12,
                              borderRadius: 12,
                              background: "rgba(2, 6, 23, 0.7)",
                              border: "1px solid rgba(148, 163, 184, 0.2)",
                              lineHeight: 1.6,
                              color: "#e2e8f0",
                              position: "relative",
                              zIndex: 5,
                            }}
                          >
                            {row.rawText}
                          </pre>
                        </details>
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

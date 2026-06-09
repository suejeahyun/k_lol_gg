import { prisma } from "@/lib/prisma/client";
import { kakaoOperationFormLabels, type KakaoOperationFormType } from "@/lib/kakao/operation-forms";
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
  description: string;
  headers: string[];
  emptyColSpan: number;
};

const pageConfigs: Record<KakaoOperationFormType, PageConfig> = {
  leaves: {
    title: "외출 신청",
    description: "외출기간, 외출사유, 외출범위를 확인합니다.",
    headers: ["ID", "이름 및 닉네임", "외출기간", "외출사유", "외출범위", "정보", "메모", "관리", "원문보기"],
    emptyColSpan: 9,
  },
  meetups: {
    title: "오프라인 모임",
    description: "주최자, 일자, 장소, 참여자 명단을 확인합니다.",
    headers: ["ID", "주최자 이름 및 닉네임", "일자", "장소", "참여자 명단", "정보", "메모", "관리", "원문보기"],
    emptyColSpan: 9,
  },
  suggestions: {
    title: "건의",
    description: "작성자, 건의 사유, 건의 내용을 확인합니다.",
    headers: ["ID", "본인 이름 및 닉네임", "건의 사유", "건의 내용", "정보", "메모", "관리", "원문보기"],
    emptyColSpan: 8,
  },
  friends: {
    title: "디스코드 초대",
    description: "지인 이름, 지인 닉네임, 이용기간, 디스코드 닉네임 변경명을 확인합니다.",
    headers: ["ID", "지인 이름", "지인 닉네임", "이용기간", "디스코드 닉네임 변경", "정보", "메모", "관리", "원문보기"],
    emptyColSpan: 9,
  },
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
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
  return items.map((item) => ({
    id: item.id,
    memo: item.memo,
    rawText: item.rawText,
    createdAt: item.createdAt,
    cells: [item.requesterInfo, item.leavePeriod, item.reason, item.scope],
  }));
}

function ShortText({ value }: { value: string }) {
  return (
    <span
      style={{
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        lineHeight: 1.55,
        maxWidth: 320,
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
    description: "카카오톡 봇이 인식해 저장한 운영 양식을 확인합니다.",
    headers: ["ID", "내용", "정보", "메모", "관리", "원문보기"],
    emptyColSpan: 6,
  };

  return (
    <main className="admin-page" style={{ width: "100%" }}>
      <div style={{ width: "100%", maxWidth: 1360, margin: "0 auto" }}>
        <div className="admin-page__header" style={{ marginBottom: 20 }}>
          <div>
            <p className="page-eyebrow">KAKAO OPERATION FORMS</p>
            <h1>{config.title}</h1>
            <p className="admin-page__description">{config.description}</p>
          </div>
        </div>

        {type === "leaves" ? (
          <section
            className="admin-card"
            style={{
              marginBottom: 16,
              padding: 18,
              border: "1px solid rgba(34, 211, 238, 0.22)",
              background: "rgba(8, 13, 28, 0.78)",
            }}
          >
            <strong>외출 신청 원칙</strong>
            <p style={{ margin: "8px 0 0", color: "rgba(226, 232, 240, 0.78)" }}>
              특별한 사유 없이는 구인방, 디스코드 외출은 승인하지 않는 것을 기본 원칙으로 합니다.
            </p>
          </section>
        ) : null}

        <section className="admin-card" style={{ padding: 20, overflow: "hidden" }}>
          <div className="admin-card__header" style={{ marginBottom: 16 }}>
            <div>
              <h2>접수 목록</h2>
              <p>최근 200건 기준 · 현재 표시 {rows.length}건</p>
            </div>
          </div>

          <div className="admin-table-wrap" style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ minWidth: type === "suggestions" ? 1040 : 1180 }}>
              <thead>
                <tr>
                  {config.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={config.emptyColSpan}>등록된 항목이 없습니다.</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="ID">#{row.id}</td>
                      {row.cells.map((cell, index) => (
                        <td key={`${row.id}-${index}`} data-label={config.headers[index + 1]}>
                          <ShortText value={cell} />
                        </td>
                      ))}
                      <td data-label="정보">등록 {formatDate(row.createdAt)}</td>
                      <td data-label="메모">
                        <ShortText value={row.memo || "-"} />
                      </td>
                      <td data-label="관리">
                        <KakaoOperationFormActions formType={type} id={row.id} memo={row.memo} />
                      </td>
                      <td data-label="원문보기">
                        <details>
                          <summary style={{ cursor: "pointer", whiteSpace: "nowrap" }}>보기</summary>
                          <pre
                            style={{
                              whiteSpace: "pre-wrap",
                              minWidth: 260,
                              maxWidth: 420,
                              margin: "10px 0 0",
                              padding: 12,
                              borderRadius: 12,
                              background: "rgba(2, 6, 23, 0.7)",
                              border: "1px solid rgba(148, 163, 184, 0.2)",
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

import { prisma } from "@/lib/prisma/client";
import {
  kakaoOperationFormLabels,
  kakaoOperationFormStatusLabels,
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
  memo: string | null;
  rawText: string;
  roomName: string | null;
  sender: string | null;
  createdAt: Date;
  updatedAt: Date;
  columns: { label: string; value: string | null }[];
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

async function getRows(type: KakaoOperationFormType, status?: string): Promise<Row[]> {
  const where = status ? { status } : undefined;

  if (type === "friends") {
    const items = await prisma.kakaoFriendApplication.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    return items.map((item) => ({
      id: item.id,
      status: item.status,
      memo: item.memo,
      rawText: item.rawText,
      roomName: item.roomName,
      sender: item.sender,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      columns: [
        { label: "지인 이름", value: item.friendName },
        { label: "지인 닉네임", value: item.friendNickname },
        { label: "이용기간", value: item.gameName ? `${item.usageType} · ${item.gameName}` : item.usageType },
        { label: "디코 닉변", value: item.discordNicknameChange },
      ],
    }));
  }

  if (type === "suggestions") {
    const items = await prisma.kakaoSuggestionRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    return items.map((item) => ({
      id: item.id,
      status: item.status,
      memo: item.memo,
      rawText: item.rawText,
      roomName: item.roomName,
      sender: item.sender,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      columns: [
        { label: "작성자", value: item.requesterInfo },
        { label: "사유", value: item.reason },
        { label: "내용", value: item.content },
      ],
    }));
  }

  if (type === "meetups") {
    const items = await prisma.kakaoMeetupRecord.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    return items.map((item) => ({
      id: item.id,
      status: item.status,
      memo: item.memo,
      rawText: item.rawText,
      roomName: item.roomName,
      sender: item.sender,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      columns: [
        { label: "주최자", value: item.hostInfo },
        { label: "일자", value: item.eventDateText },
        { label: "장소", value: item.place },
        { label: "참여자", value: item.participants },
      ],
    }));
  }

  const items = await prisma.kakaoLeaveRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    memo: item.memo,
    rawText: item.rawText,
    roomName: item.roomName,
    sender: item.sender,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    columns: [
      { label: "신청자", value: item.requesterInfo },
      { label: "외출기간", value: item.leavePeriod },
      { label: "외출사유", value: item.reason },
      { label: "외출범위", value: item.scope },
    ],
  }));
}

export default async function KakaoOperationFormAdminPage({ type, searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const status = params.status?.trim() || undefined;
  const rows = await getRows(type, status);
  const title = kakaoOperationFormLabels[type];

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="page-eyebrow">KAKAO OPERATION FORMS</p>
          <h1>{title}</h1>
          <p className="admin-page__description">카카오톡 봇이 인식해 저장한 운영 양식을 확인하고 상태, 메모, 삭제를 관리합니다.</p>
        </div>
      </div>

      {type === "leaves" ? (
        <section className="admin-card" style={{ marginBottom: 16 }}>
          <strong>외출 신청 원칙</strong>
          <p style={{ margin: "8px 0 0" }}>특별한 사유 없이는 구인방, 디스코드 외출은 승인하지 않는 것을 기본 원칙으로 합니다.</p>
        </section>
      ) : null}

      <section className="admin-card">
        <div className="admin-card__header">
          <div>
            <h2>접수 목록</h2>
            <p>최근 200건 기준 · 현재 표시 {rows.length}건</p>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>상태</th>
                <th>내용</th>
                <th>원문</th>
                <th>접수 정보</th>
                <th>메모</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>등록된 항목이 없습니다.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="ID">#{row.id}</td>
                    <td data-label="상태">{kakaoOperationFormStatusLabels[row.status] || row.status}</td>
                    <td data-label="내용">
                      <div style={{ display: "grid", gap: 6 }}>
                        {row.columns.map((column) => (
                          <div key={column.label}>
                            <strong>{column.label}</strong>: {column.value || "-"}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td data-label="원문">
                      <details>
                        <summary>원문 보기</summary>
                        <pre style={{ whiteSpace: "pre-wrap", maxWidth: 360 }}>{row.rawText}</pre>
                      </details>
                    </td>
                    <td data-label="접수 정보">
                      <div>등록: {formatDate(row.createdAt)}</div>
                      <div>방: {row.roomName || "-"}</div>
                      <div>작성자: {row.sender || "-"}</div>
                    </td>
                    <td data-label="메모">{row.memo || "-"}</td>
                    <td data-label="관리">
                      <KakaoOperationFormActions formType={type} id={row.id} status={row.status} memo={row.memo} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

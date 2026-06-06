import { CommunityPostType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type HeadlineBoard = {
  type: CommunityPostType;
  label: string;
  description: string;
};

const boards: HeadlineBoard[] = [
  { type: "HIGHLIGHT", label: "하이라이트", description: "명장면, 한타, 솔로킬 등 영상 게시판 말머리" },
  { type: "SUGGESTION", label: "건의사항", description: "오류, 기능추가, 모바일 등 운영 개선 분류" },
  { type: "MATCH_REVIEW", label: "매치 리뷰", description: "경기후기, 밴픽, MVP 등 내전 리뷰 분류" },
  { type: "FREE", label: "자유게시판", description: "잡담, 질문, 정보, 유머 등 자유 게시판 분류" },
];

const defaultHeadlines: Record<CommunityPostType, string[]> = {
  HIGHLIGHT: ["슈퍼플레이", "한타", "솔로킬", "바론·용", "역전", "웃긴장면", "실수", "제보"],
  SUGGESTION: ["오류", "개선요청", "기능추가", "디자인", "모바일", "카카오봇", "구인구직", "완료요청"],
  MATCH_REVIEW: ["경기후기", "밴픽", "MVP", "한타", "라인전", "운영", "피드백", "리뷰"],
  FREE: ["잡담", "질문", "정보", "후기", "모집", "자랑", "유머", "기타"],
  NOTICE_COMMENT: ["확인", "질문", "의견"],
};

function toCommunityPostType(value: FormDataEntryValue | null) {
  const type = String(value ?? "") as CommunityPostType;
  return boards.some((board) => board.type === type) ? type : null;
}

async function refreshHeadlines() {
  revalidatePath("/admin/community/headlines");
  revalidatePath("/community");
  revalidatePath("/community/highlights");
  revalidatePath("/community/suggestions");
  revalidatePath("/community/match-reviews");
  revalidatePath("/community/free");
}

async function createHeadline(formData: FormData) {
  "use server";
  await requireAdmin();

  const type = toCommunityPostType(formData.get("type"));
  const label = String(formData.get("label") ?? "").trim().slice(0, 24);
  const sortOrder = Number(formData.get("sortOrder") ?? 0);

  if (!type || !label) redirect("/admin/community/headlines?error=invalid");

  await prisma.communityHeadline.upsert({
    where: { type_label: { type, label } },
    create: {
      type,
      label,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      isActive: true,
    },
    update: {
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      isActive: true,
    },
  });

  await refreshHeadlines();
}

async function updateHeadline(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = Number(formData.get("id"));
  const label = String(formData.get("label") ?? "").trim().slice(0, 24);
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  const isActive = formData.get("isActive") === "on";

  if (!Number.isInteger(id) || id <= 0 || !label) redirect("/admin/community/headlines?error=invalid");

  await prisma.communityHeadline.update({
    where: { id },
    data: {
      label,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      isActive,
    },
  });

  await refreshHeadlines();
}

async function hideHeadline(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) redirect("/admin/community/headlines?error=invalid");

  await prisma.communityHeadline.update({
    where: { id },
    data: { isActive: false },
  });

  await refreshHeadlines();
}

async function restoreDefaults(formData: FormData) {
  "use server";
  await requireAdmin();

  const type = toCommunityPostType(formData.get("type"));
  if (!type) redirect("/admin/community/headlines?error=invalid");

  const defaults = defaultHeadlines[type] ?? [];
  await Promise.all(
    defaults.map((label, index) =>
      prisma.communityHeadline.upsert({
        where: { type_label: { type, label } },
        create: { type, label, sortOrder: (index + 1) * 10, isActive: true },
        update: { sortOrder: (index + 1) * 10, isActive: true },
      }),
    ),
  );

  await refreshHeadlines();
}

export default async function AdminCommunityHeadlinesPage() {
  await requireAdmin();

  const headlines = await prisma.communityHeadline.findMany({
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });

  const grouped = new Map<CommunityPostType, typeof headlines>();
  for (const board of boards) grouped.set(board.type, []);
  for (const item of headlines) {
    if (!grouped.has(item.type)) grouped.set(item.type, []);
    grouped.get(item.type)!.push(item);
  }

  return (
    <main className="admin-page community-headline-admin">
      <section className="admin-dashboard-header">
        <p className="admin-dashboard-subtitle">COMMUNITY HEADLINES</p>
        <h1>커뮤니티 말머리 관리</h1>
        <p>게시판별 말머리를 추가, 수정, 숨김 처리합니다. 자유게시판 기본 말머리에는 유머가 포함됩니다.</p>
      </section>

      <section className="community-headline-admin__create">
        <h2>말머리 추가</h2>
        <form action={createHeadline} className="community-headline-admin__form">
          <select name="type" aria-label="게시판 선택" required>
            {boards.map((board) => (
              <option key={board.type} value={board.type}>{board.label}</option>
            ))}
          </select>
          <input name="label" maxLength={24} placeholder="말머리명 예: 유머" required />
          <input name="sortOrder" type="number" defaultValue={100} aria-label="정렬 순서" />
          <button className="button button--primary" type="submit">추가</button>
        </form>
      </section>

      <div className="community-headline-admin__grid">
        {boards.map((board) => {
          const items = grouped.get(board.type) ?? [];
          return (
            <section className="community-headline-admin__card" key={board.type}>
              <div className="community-headline-admin__card-head">
                <div>
                  <h2>{board.label}</h2>
                  <p>{board.description}</p>
                </div>
                <form action={restoreDefaults}>
                  <input type="hidden" name="type" value={board.type} />
                  <button className="button button--ghost" type="submit">기본값 복구</button>
                </form>
              </div>

              <div className="community-headline-admin__list">
                {items.length === 0 ? (
                  <p className="community-headline-admin__empty">등록된 말머리가 없습니다.</p>
                ) : (
                  items.map((item) => (
                    <form action={updateHeadline} className={`community-headline-admin__row${item.isActive ? "" : " is-disabled"}`} key={item.id}>
                      <input type="hidden" name="id" value={item.id} />
                      <input name="label" maxLength={24} defaultValue={item.label} aria-label="말머리명" />
                      <input name="sortOrder" type="number" defaultValue={item.sortOrder} aria-label="정렬" />
                      <label className="community-headline-admin__check">
                        <input name="isActive" type="checkbox" defaultChecked={item.isActive} />
                        사용
                      </label>
                      <button className="button button--ghost" type="submit">저장</button>
                      <button className="button button--danger" formAction={hideHeadline} type="submit">숨김</button>
                    </form>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

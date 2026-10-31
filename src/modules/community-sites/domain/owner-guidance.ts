import type { CommunitySite, CommunitySiteStatus } from "./community-site";

const nextSteps: Record<CommunitySiteStatus, { title: string; description: string }> = {
  SUBMITTED: { title: "신청 내용을 검토하고 있어요", description: "보완 요청이나 심사 결과가 이 화면에 표시됩니다. 승인 전에는 아래 설정을 수정하고 초안을 저장할 수 있습니다." },
  CHANGES_REQUESTED: { title: "심사 안내를 확인하고 보완해 주세요", description: "안내에 맞게 설정을 수정해 초안을 저장한 뒤, 다시 심사 요청을 눌러 주세요." },
  REJECTED: { title: "반려 사유를 확인해 주세요", description: "심사 안내를 반영해 초안을 저장하고 다시 신청할 수 있습니다. 설명이 더 필요하면 GG HUB 운영팀에 문의해 주세요." },
  CANCELLED: { title: "신청이 취소됐어요", description: "다시 시작하려면 설정을 확인하고 초안을 저장한 뒤 심사를 요청해 주세요." },
  APPROVED: { title: "승인된 사이트의 개설을 준비하고 있어요", description: "개설이 끝나면 사이트 주소와 소유자 확인 단계가 표시됩니다. 같은 사이트를 다시 신청할 필요가 없습니다." },
  PROVISIONING: { title: "사이트를 개설하고 있어요", description: "이 화면을 닫아도 작업은 계속됩니다. 나중에 내 사이트에서 진행 상태를 확인할 수 있습니다." },
  AWAITING_OWNER: { title: "공개 전에 내 사이트를 확인해 주세요", description: "사이트에서 GG HUB 계정으로 로그인하고 관리자 접근과 화면을 확인해 주세요. 확인이 끝나면 아래 운영 시작 버튼으로 공개를 요청하세요." },
  ACTIVATING: { title: "공개 요청의 적용 결과를 확인하고 있어요", description: "공개 처리가 끝나면 운영 중으로 표시됩니다. 확인이 지연되면 같은 사이트에서 상태를 새로고침해 주세요." },
  ACTIVE: { title: "회원이 참여할 준비를 해보세요", description: "커뮤니티 소개와 가입 정책을 확인하고 회원을 초대하세요. 설정 변경은 초안 저장 후 게시해야 사이트에 반영됩니다." },
  FAILED: { title: "개설 작업을 운영팀이 확인해야 해요", description: "새 신청을 만들지 말고 이 신청으로 문의해 주세요. 운영팀이 기존 작업을 확인한 뒤 재개할 수 있습니다." },
};

export function communitySiteOwnerGuidance(site: CommunitySite) {
  if (site.latestJob?.status === "FAILED" && site.status === "ACTIVE") return {
    title: "최근 설정 반영을 확인해 주세요",
    description: "일부 변경이 이미 적용됐을 수 있습니다. 사이트 상태를 확인하고 저장한 설정을 다시 게시하거나 운영팀에 문의해 주세요. 새 사이트를 만들 필요는 없습니다.",
  };
  if (site.latestJob?.status === "FAILED" && site.status === "ACTIVATING") return {
    title: "공개 요청을 운영팀이 확인해야 해요",
    description: "일부 공개 처리가 이미 적용됐을 수 있습니다. 현재 사이트와 상태를 확인하고 이 신청으로 문의해 주세요.",
  };
  return nextSteps[site.status];
}

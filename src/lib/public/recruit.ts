const TEXT_LIMITS = {
  title: 160,
  startTimeText: 80,
  tierText: 120,
  preferredLineText: 120,
  playStyle: 500,
  note: 1000,
} as const;

export type PublicRecruitMemberDto = {
  displayName: string;
  position: string | null;
  slotNo: number | null;
  isSubstitute: boolean;
};

export type PublicRecruitDto = {
  publicRef: string;
  recruitNo: number;
  recruitDate: string;
  resetSeq: number;
  type: string;
  status: "IN_PROGRESS" | "FINISHED" | "CANCELED" | "RESET";
  title: string;
  startTimeText: string | null;
  scheduledStartAt: string | null;
  tierText: string | null;
  preferredLineText: string | null;
  playStyle: string | null;
  note: string | null;
  maxMembers: number;
  updatedAt: string;
  members: PublicRecruitMemberDto[];
};

type PublicRecruitSource = {
  recruitNo: number;
  recruitDate: string;
  resetSeq: number;
  type: string;
  status: string;
  title: string;
  startTimeText?: string | null;
  scheduledStartAt?: Date | string | null;
  tierText?: string | null;
  preferredLineText?: string | null;
  playStyle?: string | null;
  note?: string | null;
  maxMembers: number;
  updatedAt: Date | string;
  members: Array<{
    position?: string | null;
    slotNo?: number | null;
    isSubstitute?: boolean;
  }>;
};

function sanitizeText(value: string | null | undefined, limit: number) {
  const cleaned = value?.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, limit) : null;
}

export function toPublicRecruitDto(source: PublicRecruitSource): PublicRecruitDto {
  const status = ["IN_PROGRESS", "FINISHED", "CANCELED", "RESET"].includes(source.status)
    ? (source.status as PublicRecruitDto["status"])
    : "IN_PROGRESS";
  return {
    publicRef: `${source.recruitDate}-${source.resetSeq}-${source.recruitNo}`,
    recruitNo: source.recruitNo,
    recruitDate: source.recruitDate,
    resetSeq: source.resetSeq,
    type: source.type,
    status,
    title: sanitizeText(source.title, TEXT_LIMITS.title) ?? "구인",
    startTimeText: sanitizeText(source.startTimeText, TEXT_LIMITS.startTimeText),
    scheduledStartAt: source.scheduledStartAt
      ? new Date(source.scheduledStartAt).toISOString()
      : null,
    tierText: sanitizeText(source.tierText, TEXT_LIMITS.tierText),
    preferredLineText: sanitizeText(
      source.preferredLineText,
      TEXT_LIMITS.preferredLineText,
    ),
    playStyle: sanitizeText(source.playStyle, TEXT_LIMITS.playStyle),
    note: sanitizeText(source.note, TEXT_LIMITS.note),
    maxMembers: source.maxMembers,
    updatedAt: new Date(source.updatedAt).toISOString(),
    members: source.members.map((member, index) => ({
      displayName: member.isSubstitute
        ? `예비 참가자 ${index + 1}`
        : `참가자 ${member.slotNo ?? index + 1}`,
      position: sanitizeText(member.position, 16),
      slotNo: Number.isInteger(member.slotNo) ? member.slotNo ?? null : null,
      isSubstitute: Boolean(member.isSubstitute),
    })),
  };
}

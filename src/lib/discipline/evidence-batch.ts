type EvidenceTimestamp = {
  submittedAt: Date;
};

/**
 * 반려 시 reviewedAt이 직전 제출 묶음의 경계가 됩니다.
 * 이후에 제출된 사진만 현재 재제출 묶음으로 계산합니다.
 */
export function isCurrentDisciplineEvidence(
  evidence: EvidenceTimestamp,
  reviewedAt: Date | null,
) {
  return !reviewedAt || evidence.submittedAt.getTime() > reviewedAt.getTime();
}

export function currentDisciplineEvidence<T extends EvidenceTimestamp>(
  evidence: T[],
  reviewedAt: Date | null,
) {
  return evidence.filter((item) => isCurrentDisciplineEvidence(item, reviewedAt));
}

export function currentDisciplineEvidenceCount(
  evidence: EvidenceTimestamp[],
  reviewedAt: Date | null,
) {
  return currentDisciplineEvidence(evidence, reviewedAt).length;
}

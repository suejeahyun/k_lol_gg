"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DisciplineTaskHandoff from "@/components/admin/DisciplineTaskHandoff";

type Target = {
  userAccountId: number | null;
  playerId: number | null;
  userId: string;
  name: string;
  nickname: string | null;
  tag: string | null;
  label: string;
};

type TaskHandoff = {
  publicCode: string;
  targetName: string;
  requiredGameCount?: number;
  targetLinked: boolean;
};

type Completion = {
  targetName: string;
  typeLabel: string;
  warningWithoutCode?: boolean;
};

type CreateResponse = {
  message?: string;
  resolutionTask?: {
    publicCode?: string;
    requiredGameCount?: number;
  } | null;
};

const steps = [
  { number: 1, title: "대상 선택", description: "누구에게 등록할지 선택" },
  { number: 2, title: "조치 내용", description: "종류와 사유 입력" },
  { number: 3, title: "확인·발급", description: "내용 확인 후 바로 등록" },
] as const;

const sourceOptions = [
  { value: "MANUAL", label: "운영자 판단", description: "별도 유형에 해당하지 않는 운영 조치" },
  { value: "LATE", label: "구인·내전 지각", description: "예정 시간보다 늦게 참여" },
  { value: "NO_SHOW", label: "노쇼", description: "사전 연락 없이 불참" },
  { value: "CHAT_ABUSE", label: "전챗·감정표현", description: "전체 채팅이나 감정표현으로 진행 방해" },
  { value: "TOXICITY", label: "욕설·남탓·훈수", description: "비매너 발언이나 과도한 지적" },
  { value: "LINE_FORM", label: "라인·신청 양식", description: "라인 기재 또는 신청 양식 문제" },
  { value: "KICK", label: "강퇴 처리", description: "운영 기준에 따른 강퇴 기록" },
  { value: "BAN", label: "벤 처리", description: "운영 기준에 따른 벤 기록" },
  { value: "OTHER", label: "기타", description: "직접 사유를 작성" },
] as const;

const reasonSuggestions: Record<string, string[]> = {
  MANUAL: ["운영 정책 위반으로 조치", "반복된 운영 안내 미준수"],
  LATE: ["예정된 시작 시간에 지각", "내전 시작 전까지 미입장"],
  NO_SHOW: ["사전 연락 없이 불참", "참가 확정 후 무단 불참"],
  CHAT_ABUSE: ["전체 채팅으로 상대방을 자극", "과도한 감정표현으로 경기 진행 방해"],
  TOXICITY: ["욕설 및 비하 발언", "반복적인 남탓과 과도한 훈수"],
  LINE_FORM: ["신청한 라인과 다르게 참여", "참가 신청 양식 미준수"],
  KICK: ["운영 기준 위반에 따른 강퇴"],
  BAN: ["운영 기준 위반에 따른 벤"],
  OTHER: [],
};

function getTargetKey(target: Target) {
  return `${target.userAccountId || ""}:${target.playerId || ""}`;
}

function getTargetIdentity(target: Target) {
  const gameName = target.nickname ? `${target.nickname}${target.tag ? `#${target.tag}` : ""}` : "게임 닉네임 없음";
  return { title: target.name, detail: `${gameName} · 계정 ${target.userId}` };
}

function getTypeLabel(type: string, warningCategory: string) {
  if (type === "WARNING") return warningCategory === "INHOUSE" ? "내전 경고 · 15판" : "일반 경고 · 10판";
  if (type === "BAN") return "벤·강퇴 기록";
  return "주의";
}

export default function DisciplineRecordCreateClient({ targets }: { targets: Target[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState("");
  const [targetMode, setTargetMode] = useState<"REGISTERED" | "DIRECT">("REGISTERED");
  const [targetKey, setTargetKey] = useState("");
  const [directName, setDirectName] = useState("");
  const [directNickname, setDirectNickname] = useState("");
  const [directTag, setDirectTag] = useState("");
  const [type, setType] = useState("WARNING");
  const [warningCategory, setWarningCategory] = useState("GENERAL");
  const [source, setSource] = useState("MANUAL");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [taskHandoff, setTaskHandoff] = useState<TaskHandoff | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);

  const filteredTargets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? targets.filter((item) => item.label.toLowerCase().includes(q)) : targets;
    return matches.slice(0, 12);
  }, [query, targets]);

  const selectedTarget = targets.find((item) => getTargetKey(item) === targetKey) || null;
  const selectedSource = sourceOptions.find((item) => item.value === source) || sourceOptions[0];
  const selectedTargetName = targetMode === "REGISTERED" ? selectedTarget?.name || "" : directName.trim();
  const selectedTargetDetail = targetMode === "REGISTERED"
    ? selectedTarget ? getTargetIdentity(selectedTarget).detail : ""
    : [directNickname.trim(), directTag.trim()].filter(Boolean).join("#") || "사이트 미등록 대상";
  const typeLabel = getTypeLabel(type, warningCategory);
  const requiredGameCount = type === "WARNING" ? (warningCategory === "INHOUSE" ? 15 : 10) : null;

  function selectTargetMode(mode: "REGISTERED" | "DIRECT") {
    setTargetMode(mode);
    setErrorMessage("");
  }

  function selectPolicy(nextType: "CAUTION" | "WARNING" | "BAN", category = "GENERAL") {
    setType(nextType);
    setWarningCategory(category);
    setErrorMessage("");
  }

  function validationMessage(targetStep: number) {
    if (targetStep === 1) {
      if (targetMode === "REGISTERED" && !selectedTarget) return "검색 결과에서 등록 대상을 한 명 선택해주세요.";
      if (targetMode === "DIRECT" && !directName.trim()) return "직접 등록할 대상의 이름을 입력해주세요.";
    }
    if (targetStep === 2 && !reason.trim()) return "조치 사유를 입력하거나 예시 문구를 선택해주세요.";
    return "";
  }

  function moveNext() {
    const message = validationMessage(step);
    if (message) {
      setErrorMessage(message);
      return;
    }
    setErrorMessage("");
    setStep((current) => Math.min(3, current + 1));
  }

  function moveBack() {
    setErrorMessage("");
    setStep((current) => Math.max(1, current - 1));
  }

  function moveToPreviousStep(nextStep: number) {
    if (nextStep >= step) return;
    setErrorMessage("");
    setStep(nextStep);
  }

  function resetWizard() {
    setStep(1);
    setQuery("");
    setTargetMode("REGISTERED");
    setTargetKey("");
    setDirectName("");
    setDirectNickname("");
    setDirectTag("");
    setType("WARNING");
    setWarningCategory("GENERAL");
    setSource("MANUAL");
    setReason("");
    setNote("");
    setErrorMessage("");
    setTaskHandoff(null);
    setCompletion(null);
  }

  async function submit() {
    const stepOneMessage = validationMessage(1);
    const stepTwoMessage = validationMessage(2);
    if (stepOneMessage || stepTwoMessage) {
      setErrorMessage(stepOneMessage || stepTwoMessage);
      setStep(stepOneMessage ? 1 : 2);
      return;
    }

    setErrorMessage("");
    setBusy(true);
    try {
      const payload = targetMode === "REGISTERED" ? {
        userAccountId: selectedTarget?.userAccountId || null,
        playerId: selectedTarget?.playerId || null,
        targetName: selectedTarget?.name || "대상 미상",
        targetNickname: selectedTarget?.nickname || null,
        targetTag: selectedTarget?.tag || null,
      } : {
        userAccountId: null,
        playerId: null,
        targetName: directName.trim(),
        targetNickname: directNickname.trim() || null,
        targetTag: directTag.trim() || null,
      };

      const res = await fetch("/api/admin/discipline-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, type, warningCategory, source, reason: reason.trim(), note: note.trim() }),
      });
      const data = await res.json().catch(() => ({})) as CreateResponse;
      if (!res.ok) throw new Error(data?.message || "등록하지 못했습니다. 잠시 후 다시 시도해주세요.");

      if (type === "WARNING" && data.resolutionTask?.publicCode) {
        setTaskHandoff({
          publicCode: data.resolutionTask.publicCode,
          targetName: payload.targetName,
          requiredGameCount: data.resolutionTask.requiredGameCount,
          targetLinked: Boolean(payload.userAccountId || payload.playerId),
        });
        setCompletion({ targetName: payload.targetName, typeLabel });
        return;
      }

      setCompletion({ targetName: payload.targetName, typeLabel, warningWithoutCode: type === "WARNING" });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "등록하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (completion) {
    return (
      <div className="discipline-complete-stack">
        <section className="admin-card discipline-success-card" aria-labelledby="discipline-success-title">
          <div className="discipline-success-icon" aria-hidden="true">✓</div>
          <div>
            <p className="discipline-success-kicker">등록 완료</p>
            <h2 id="discipline-success-title">{completion.targetName} · {completion.typeLabel}</h2>
            <p>징계 기록이 저장되었습니다. 아래 안내를 대상자에게 전달하거나 다음 기록을 등록하세요.</p>
          </div>
        </section>
        {taskHandoff ? <DisciplineTaskHandoff {...taskHandoff} /> : null}
        {completion.warningWithoutCode ? (
          <div className="discipline-inline-notice discipline-inline-notice--warning" role="status">
            경고 기록은 저장됐지만 사진 제출 과제를 확인하지 못했습니다. 징계 목록에서 생성 상태를 확인해주세요.
          </div>
        ) : null}
        <div className="discipline-complete-actions">
          <button type="button" className="admin-button" onClick={resetWizard}>다른 기록 등록</button>
          <button type="button" className="admin-button admin-button--secondary" onClick={() => router.push("/admin/discipline")}>징계 목록 보기</button>
        </div>
      </div>
    );
  }

  return (
    <section className="admin-card discipline-form-card" aria-labelledby="discipline-create-title">
      <div className="discipline-form-intro">
        <div><p className="discipline-form-kicker">3단계 빠른 등록</p><h2 id="discipline-create-title">주의·경고·벤 등록</h2></div>
        <span className="discipline-step-count">{step}/3</span>
      </div>

      <ol className="discipline-stepper" aria-label="등록 진행 단계">
        {steps.map((item) => {
          const state = item.number === step ? "current" : item.number < step ? "complete" : "upcoming";
          return (
            <li key={item.number} className={`discipline-step discipline-step--${state}`} aria-current={item.number === step ? "step" : undefined}>
              <button type="button" disabled={item.number >= step} onClick={() => moveToPreviousStep(item.number)}>
                <span className="discipline-step__number" aria-hidden="true">{item.number < step ? "✓" : item.number}</span>
                <span><strong>{item.title}</strong><small>{item.description}</small></span>
              </button>
            </li>
          );
        })}
      </ol>

      {errorMessage ? <div className="discipline-inline-notice discipline-inline-notice--error" role="alert">{errorMessage}</div> : null}

      {step === 1 ? (
        <div className="discipline-step-panel" role="region" aria-labelledby="discipline-step-one-title">
          <div className="discipline-panel-heading"><p>1단계</p><h3 id="discipline-step-one-title">등록 대상을 선택하세요</h3><span>사이트 회원은 검색으로 연결하고, 미가입자는 이름으로 바로 기록할 수 있습니다.</span></div>
          <div className="discipline-choice-grid discipline-choice-grid--two" role="group" aria-label="대상 등록 방식">
            <button type="button" className={`discipline-choice-card ${targetMode === "REGISTERED" ? "is-selected" : ""}`} aria-pressed={targetMode === "REGISTERED"} onClick={() => selectTargetMode("REGISTERED")}>
              <strong>사이트 회원 검색</strong><span>계정과 자동 연결되어 내정보에서 확인 가능</span><em>추천</em>
            </button>
            <button type="button" className={`discipline-choice-card ${targetMode === "DIRECT" ? "is-selected" : ""}`} aria-pressed={targetMode === "DIRECT"} onClick={() => selectTargetMode("DIRECT")}>
              <strong>미가입자 직접 입력</strong><span>이름만 알아도 운영 기록을 바로 생성</span>
            </button>
          </div>

          {targetMode === "REGISTERED" ? (
            <div className="discipline-target-search">
              <label className="discipline-field"><span>이름·게임 닉네임·사이트 아이디 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 서재현, 닉네임#태그, 사이트 아이디" autoComplete="off" /></label>
              <div className="discipline-search-results" role="group" aria-label="대상 검색 결과">
                {filteredTargets.length ? filteredTargets.map((target) => {
                  const key = getTargetKey(target);
                  const identity = getTargetIdentity(target);
                  return (
                    <button type="button" key={key} className={targetKey === key ? "is-selected" : ""} aria-pressed={targetKey === key} onClick={() => { setTargetKey(key); setErrorMessage(""); }}>
                      <span className="discipline-person-avatar" aria-hidden="true">{identity.title.slice(0, 1)}</span>
                      <span><strong>{identity.title}</strong><small>{identity.detail}</small></span>
                      <em>{targetKey === key ? "선택됨" : "선택"}</em>
                    </button>
                  );
                }) : <div className="discipline-empty-result"><strong>검색 결과가 없습니다.</strong><span>철자를 확인하거나 ‘미가입자 직접 입력’을 사용하세요.</span></div>}
              </div>
              {!query.trim() && targets.length > filteredTargets.length ? <p className="discipline-field-hint">최근 가입자 {filteredTargets.length}명만 표시 중입니다. 위 검색창에 이름을 입력하면 전체 회원에서 찾습니다.</p> : null}
            </div>
          ) : (
            <div className="discipline-form-grid discipline-form-grid--direct">
              <label className="discipline-field"><span>이름 <b>필수</b></span><input value={directName} onChange={(event) => setDirectName(event.target.value)} placeholder="예: 정민" /></label>
              <label className="discipline-field"><span>게임 닉네임</span><input value={directNickname} onChange={(event) => setDirectNickname(event.target.value)} placeholder="예: 원죄 (선택)" /></label>
              <label className="discipline-field"><span>태그</span><input value={directTag} onChange={(event) => setDirectTag(event.target.value)} placeholder="예: KR1 (선택)" /></label>
              <div className="discipline-inline-notice">계정 연결 없이 운영 기록만 생성됩니다. 나중에 관리자 목록에서 대상을 확인할 수 있습니다.</div>
            </div>
          )}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="discipline-step-panel" role="region" aria-labelledby="discipline-step-two-title">
          <div className="discipline-panel-heading"><p>2단계</p><h3 id="discipline-step-two-title">조치 종류와 사유를 입력하세요</h3><span>경고를 선택하면 대상자의 내정보에 사진 제출 과제가 자동으로 표시됩니다.</span></div>
          <div className="discipline-choice-grid discipline-choice-grid--policy" role="group" aria-label="조치 종류">
            <button type="button" className={`discipline-policy-card ${type === "CAUTION" ? "is-selected" : ""}`} aria-pressed={type === "CAUTION"} onClick={() => selectPolicy("CAUTION")}><strong>주의</strong><span>가벼운 위반 기록</span><small>3회 누적 시 경고 전환</small></button>
            <button type="button" className={`discipline-policy-card ${type === "WARNING" && warningCategory === "GENERAL" ? "is-selected" : ""}`} aria-pressed={type === "WARNING" && warningCategory === "GENERAL"} onClick={() => selectPolicy("WARNING", "GENERAL")}><strong>일반 경고 · 10판</strong><span>일반 운영 위반</span><small>30일 내 사진 10장</small></button>
            <button type="button" className={`discipline-policy-card ${type === "WARNING" && warningCategory === "INHOUSE" ? "is-selected" : ""}`} aria-pressed={type === "WARNING" && warningCategory === "INHOUSE"} onClick={() => selectPolicy("WARNING", "INHOUSE")}><strong>내전 경고 · 15판</strong><span>내전 관련 위반</span><small>30일 내 사진 15장</small></button>
            <button type="button" className={`discipline-policy-card discipline-policy-card--danger ${type === "BAN" ? "is-selected" : ""}`} aria-pressed={type === "BAN"} onClick={() => selectPolicy("BAN")}><strong>벤·강퇴</strong><span>이용 제한 기록</span><small>사진 과제 없음</small></button>
          </div>

          <div className="discipline-form-grid">
            <label className="discipline-field"><span>사유 유형</span><select value={source} onChange={(event) => { setSource(event.target.value); setErrorMessage(""); }}>{sourceOptions.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.description}</option>)}</select></label>
            <div className="discipline-field discipline-field--wide">
              <span>빠른 사유 선택 <small>선택 후 수정할 수 있습니다</small></span>
              {reasonSuggestions[source]?.length ? <div className="discipline-reason-chips">{reasonSuggestions[source].map((suggestion) => <button type="button" key={suggestion} onClick={() => { setReason(suggestion); setErrorMessage(""); }}>{suggestion}</button>)}</div> : <p className="discipline-field-hint">아래에 구체적인 사유를 직접 작성해주세요.</p>}
            </div>
            <label className="discipline-field discipline-field--wide"><span>대상자에게 안내할 사유 <b>필수</b></span><textarea value={reason} maxLength={500} onChange={(event) => { setReason(event.target.value); setErrorMessage(""); }} placeholder="언제, 어떤 행동이 운영 기준을 위반했는지 짧고 명확하게 작성하세요." /><small>{reason.trim().length}/500자 · 개인정보나 불필요한 감정 표현은 적지 마세요.</small></label>
            <details className="discipline-note-details discipline-field--wide"><summary>운영진 내부 메모 추가 <span>선택</span></summary><label className="discipline-field"><span>대상자에게 전달하지 않을 참고 내용</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="관련 대화 시각, 함께 확인한 운영자 등" /></label></details>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="discipline-step-panel" role="region" aria-labelledby="discipline-step-three-title">
          <div className="discipline-panel-heading"><p>3단계</p><h3 id="discipline-step-three-title">등록 전 마지막으로 확인하세요</h3><span>잘못된 대상이나 종류를 선택하지 않았는지 확인한 뒤 등록합니다.</span></div>
          <dl className="discipline-review-list">
            <div><dt>대상</dt><dd><strong>{selectedTargetName}</strong><span>{selectedTargetDetail}</span></dd><button type="button" onClick={() => setStep(1)}>수정</button></div>
            <div><dt>조치</dt><dd><strong>{typeLabel}</strong><span>{requiredGameCount ? `30일 내 사진 ${requiredGameCount}장 제출` : "사진 인증 과제 없음"}</span></dd><button type="button" onClick={() => setStep(2)}>수정</button></div>
            <div><dt>사유</dt><dd><strong>{selectedSource.label}</strong><span className="discipline-review-reason">{reason.trim()}</span></dd><button type="button" onClick={() => setStep(2)}>수정</button></div>
            {note.trim() ? <div><dt>내부 메모</dt><dd><span className="discipline-review-reason">{note.trim()}</span></dd><button type="button" onClick={() => setStep(2)}>수정</button></div> : null}
          </dl>
          {type === "WARNING" ? <div className="discipline-inline-notice discipline-inline-notice--info">등록 즉시 대상자의 <strong>내정보에 사진 제출 과제</strong>가 표시됩니다. 별도 번호를 전달할 필요가 없으며, 사진 제출 완료 후에도 최종 차감은 관리자 승인이 필요합니다.</div> : null}
        </div>
      ) : null}

      <div className="discipline-wizard-actions">
        <div>{step > 1 ? <button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={moveBack}>이전</button> : null}<button type="button" className="admin-button admin-button--ghost" disabled={busy} onClick={() => router.push("/admin/discipline")}>취소</button></div>
        {step < 3 ? <button type="button" className="admin-button" onClick={moveNext}>{step === 1 ? "대상 선택 완료" : "내용 확인하기"}</button> : <button type="button" className="admin-button discipline-submit-button" disabled={busy} onClick={() => void submit()}>{busy ? "안전하게 등록 중…" : `${typeLabel} 등록하기`}</button>}
      </div>
    </section>
  );
}

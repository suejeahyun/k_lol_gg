export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import DisciplineRecordCreateClient from "@/components/admin/DisciplineRecordCreateClient";

export default async function AdminDisciplineNewPage() {
  const users = await prisma.userAccount.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { player: true },
  });

  const targets = users.map((user) => ({
    userAccountId: user.id,
    playerId: user.player?.id || null,
    userId: user.userId,
    name: user.player?.name || user.userId,
    nickname: user.player?.nickname || null,
    tag: user.player?.tag || null,
    label: `${user.player?.name || user.userId}${user.player ? ` · ${user.player.nickname}#${user.player.tag}` : ""} · ${user.userId}`,
  }));

  return (
    <main className="admin-page discipline-page">
      <DisciplineCreateStyles />
      <div className="admin-page__header" style={{ marginBottom: 24 }}>
        <div>
          <p className="page-eyebrow">DISCIPLINE GUIDE</p>
          <h1>운영 조치 등록 도우미</h1>
        </div>
        <Link className="admin-button admin-button--ghost" href="/admin/discipline">목록</Link>
      </div>
      <p className="admin-muted discipline-page-lead">처음 등록하는 운영자도 화면 안내에 따라 대상, 조치 내용, 최종 확인 순서로 안전하게 처리할 수 있습니다.</p>
      <DisciplineRecordCreateClient targets={targets} />
    </main>
  );
}

function DisciplineCreateStyles() {
  return <style>{`
    .discipline-page { width: min(1120px, calc(100vw - 56px)); margin: 0 auto; padding-bottom: 64px; }
    .discipline-page-lead { margin: -10px 0 18px; line-height: 1.65; }
    .discipline-form-card { border: 1px solid rgba(82, 164, 255, .24); background: linear-gradient(180deg, rgba(10, 28, 55, .92), rgba(5, 15, 34, .82)); border-radius: 24px; box-shadow: 0 18px 48px rgba(0,0,0,.24); padding: 28px; overflow: hidden; }
    .discipline-form-card button, .discipline-form-card input, .discipline-form-card select, .discipline-form-card textarea { font: inherit; }
    .discipline-form-intro { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .discipline-form-intro h2 { margin: 2px 0 0; letter-spacing: -.03em; font-size: clamp(22px, 3vw, 30px); }
    .discipline-form-kicker, .discipline-success-kicker { margin: 0; color: #71c9ff; font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .discipline-step-count { display: grid; place-items: center; min-width: 54px; height: 40px; border: 1px solid rgba(100,186,255,.3); border-radius: 999px; color: #ccecff; background: rgba(31,118,196,.14); font-weight: 900; }
    .discipline-stepper { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; list-style: none; margin: 24px 0 30px; padding: 0; }
    .discipline-step { position: relative; min-width: 0; }
    .discipline-step:not(:last-child)::after { content: ""; position: absolute; z-index: 0; top: 20px; left: calc(100% - 9px); width: 28px; height: 2px; background: rgba(126,178,226,.18); }
    .discipline-step button { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 64px; border: 1px solid rgba(102,162,218,.18); border-radius: 15px; padding: 10px 12px; text-align: left; color: rgba(218,237,255,.55); background: rgba(3,12,27,.42); }
    .discipline-step button:disabled { cursor: default; opacity: 1; }
    .discipline-step button:not(:disabled) { cursor: pointer; }
    .discipline-step--current button { color: #f4fbff; border-color: rgba(79,180,255,.7); background: linear-gradient(135deg, rgba(26,116,192,.32), rgba(30,74,144,.18)); box-shadow: 0 0 0 3px rgba(60,166,255,.07); }
    .discipline-step--complete button { color: #bfe9ff; border-color: rgba(63,202,158,.3); }
    .discipline-step__number { flex: 0 0 auto; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: rgba(109,159,205,.14); color: inherit; font-size: 13px; font-weight: 900; }
    .discipline-step--current .discipline-step__number { background: #2b9df0; color: #fff; }
    .discipline-step--complete .discipline-step__number { background: rgba(48,190,143,.22); color: #70e4b9; }
    .discipline-step button > span:last-child { min-width: 0; display: grid; gap: 3px; }
    .discipline-step strong { font-size: 13px; white-space: nowrap; }
    .discipline-step small { overflow: hidden; font-size: 11px; font-weight: 600; opacity: .7; text-overflow: ellipsis; white-space: nowrap; }
    .discipline-step-panel { animation: discipline-panel-enter .22s ease-out; }
    @keyframes discipline-panel-enter { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    .discipline-panel-heading { margin-bottom: 18px; }
    .discipline-panel-heading p { margin: 0 0 5px; color: #64c5ff; font-size: 12px; font-weight: 900; }
    .discipline-panel-heading h3 { margin: 0; color: #f7fbff; font-size: clamp(19px, 2.5vw, 24px); letter-spacing: -.025em; }
    .discipline-panel-heading > span { display: block; margin-top: 7px; color: rgba(205,226,247,.72); line-height: 1.55; font-size: 13px; }
    .discipline-choice-grid { display: grid; gap: 12px; margin-bottom: 20px; }
    .discipline-choice-grid--two { grid-template-columns: repeat(2, 1fr); }
    .discipline-choice-grid--policy { grid-template-columns: repeat(4, 1fr); }
    .discipline-choice-card, .discipline-policy-card { position: relative; display: grid; gap: 7px; min-height: 112px; border: 1px solid rgba(103,161,215,.22); border-radius: 17px; padding: 17px; text-align: left; color: #e8f6ff; background: rgba(4,15,32,.68); cursor: pointer; transition: border-color .15s, transform .15s, background .15s; }
    .discipline-choice-card:hover, .discipline-policy-card:hover { transform: translateY(-1px); border-color: rgba(91,183,255,.55); }
    .discipline-choice-card.is-selected, .discipline-policy-card.is-selected { border-color: #45b5ff; background: linear-gradient(145deg, rgba(31,135,216,.32), rgba(4,24,49,.8)); box-shadow: inset 0 0 0 1px rgba(70,182,255,.22), 0 8px 24px rgba(0,82,155,.14); }
    .discipline-choice-card strong, .discipline-policy-card strong { padding-right: 34px; font-size: 15px; }
    .discipline-choice-card span, .discipline-policy-card span { color: rgba(211,232,250,.72); font-size: 12px; line-height: 1.45; }
    .discipline-choice-card em { position: absolute; top: 14px; right: 14px; border-radius: 999px; padding: 4px 8px; color: #83d3ff; background: rgba(53,161,231,.14); font-size: 10px; font-style: normal; font-weight: 900; }
    .discipline-policy-card small { align-self: end; color: #70d0ff; font-size: 11px; font-weight: 900; }
    .discipline-policy-card--danger.is-selected { border-color: #ff7a97; background: linear-gradient(145deg, rgba(176,47,81,.28), rgba(44,9,25,.72)); }
    .discipline-target-search { display: grid; gap: 12px; }
    .discipline-search-results { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; max-height: 336px; overflow-y: auto; padding-right: 3px; }
    .discipline-search-results > button { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 11px; min-height: 72px; border: 1px solid rgba(100,157,210,.18); border-radius: 14px; padding: 11px 12px; text-align: left; color: #e8f6ff; background: rgba(3,13,28,.58); cursor: pointer; }
    .discipline-search-results > button:hover, .discipline-search-results > button.is-selected { border-color: rgba(67,183,255,.72); background: rgba(19,100,170,.24); }
    .discipline-search-results > button > span:nth-child(2) { min-width: 0; display: grid; gap: 4px; }
    .discipline-search-results strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
    .discipline-search-results small { overflow: hidden; color: rgba(203,226,246,.62); text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
    .discipline-search-results em { color: #75ceff; font-size: 11px; font-style: normal; font-weight: 900; }
    .discipline-person-avatar { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; color: #83d7ff; background: rgba(51,154,223,.18); font-size: 14px; font-weight: 900; }
    .discipline-empty-result { grid-column: 1 / -1; display: grid; gap: 5px; place-items: center; min-height: 118px; border: 1px dashed rgba(104,164,219,.26); border-radius: 14px; color: rgba(211,232,250,.66); text-align: center; }
    .discipline-empty-result strong { color: #e5f4ff; }
    .discipline-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .discipline-form-grid--direct { margin-top: 2px; }
    .discipline-form-grid--direct .discipline-inline-notice { align-self: end; }
    .discipline-field { display: grid; align-content: start; gap: 8px; min-width: 0; color: #c5eaff; font-size: 13px; font-weight: 800; }
    .discipline-field > span { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
    .discipline-field b { color: #ffb2c3; font-size: 10px; }
    .discipline-field > span small, .discipline-field > small { color: rgba(203,225,244,.55); font-size: 11px; font-weight: 600; }
    .discipline-field input, .discipline-field select, .discipline-field textarea { width: 100%; min-height: 48px; border: 1px solid rgba(96,166,255,.30); border-radius: 13px; outline: none; padding: 11px 13px; color: #f3fbff; background: rgba(2,10,24,.88); transition: border-color .15s, box-shadow .15s; }
    .discipline-field input:focus, .discipline-field select:focus, .discipline-field textarea:focus { border-color: #4ebcff; box-shadow: 0 0 0 3px rgba(61,174,246,.14); }
    .discipline-field textarea { min-height: 104px; resize: vertical; line-height: 1.55; }
    .discipline-field--wide { grid-column: 1 / -1; }
    .discipline-field-hint { margin: 0; color: rgba(204,226,245,.58); font-size: 11px; line-height: 1.55; }
    .discipline-reason-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .discipline-reason-chips button { border: 1px solid rgba(87,173,238,.3); border-radius: 999px; padding: 8px 11px; color: #beeaff; background: rgba(25,108,169,.14); cursor: pointer; font-size: 12px; font-weight: 700; }
    .discipline-reason-chips button:hover { border-color: #53bbfb; background: rgba(31,137,211,.25); }
    .discipline-note-details { border: 1px solid rgba(95,159,218,.18); border-radius: 14px; padding: 12px 14px; background: rgba(2,12,27,.4); }
    .discipline-note-details summary { color: #bfe7ff; cursor: pointer; font-size: 13px; font-weight: 800; }
    .discipline-note-details summary span { margin-left: 5px; color: rgba(200,224,244,.48); font-size: 10px; }
    .discipline-note-details[open] summary { margin-bottom: 13px; }
    .discipline-inline-notice { border: 1px solid rgba(96,166,255,.22); border-radius: 13px; padding: 13px 14px; color: rgba(217,235,252,.78); background: rgba(4,14,32,.66); line-height: 1.55; font-size: 12px; }
    .discipline-inline-notice--error { margin: -12px 0 20px; border-color: rgba(255,91,121,.45); color: #ffd8e0; background: rgba(117,17,43,.22); font-weight: 800; }
    .discipline-inline-notice--info { margin-top: 16px; border-color: rgba(50,184,241,.38); color: #ceefff; background: rgba(20,101,154,.19); }
    .discipline-inline-notice--warning { border-color: rgba(255,190,67,.4); color: #ffe5aa; background: rgba(120,77,4,.2); }
    .discipline-review-list { display: grid; gap: 9px; margin: 0; }
    .discipline-review-list > div { display: grid; grid-template-columns: 76px minmax(0, 1fr) auto; align-items: start; gap: 14px; border: 1px solid rgba(96,160,218,.18); border-radius: 15px; padding: 15px; background: rgba(3,13,29,.54); }
    .discipline-review-list dt { color: rgba(192,220,243,.62); font-size: 12px; font-weight: 800; }
    .discipline-review-list dd { display: grid; gap: 5px; min-width: 0; margin: 0; color: #f2f9ff; }
    .discipline-review-list dd strong { font-size: 14px; }
    .discipline-review-list dd span { color: rgba(207,229,248,.68); font-size: 12px; line-height: 1.45; }
    .discipline-review-reason { white-space: pre-wrap; overflow-wrap: anywhere; }
    .discipline-review-list button { border: 0; padding: 2px 4px; color: #70caff; background: transparent; cursor: pointer; font-size: 12px; font-weight: 900; }
    .discipline-wizard-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(104,160,211,.16); }
    .discipline-wizard-actions > div { display: flex; flex-wrap: wrap; gap: 8px; }
    .discipline-submit-button { min-width: 190px; }
    .discipline-complete-stack { display: grid; gap: 16px; }
    .discipline-success-card { display: flex; align-items: center; gap: 16px; border: 1px solid rgba(58,210,157,.34); border-radius: 22px; padding: 22px; background: linear-gradient(135deg, rgba(17,116,85,.28), rgba(5,24,36,.78)); }
    .discipline-success-card h2 { margin: 3px 0 6px; color: #f1fff9; font-size: 20px; }
    .discipline-success-card p:last-child { margin: 0; color: rgba(213,241,231,.72); font-size: 13px; line-height: 1.5; }
    .discipline-success-icon { display: grid; flex: 0 0 auto; place-items: center; width: 50px; height: 50px; border-radius: 50%; color: #dffff3; background: rgba(40,201,144,.27); font-size: 24px; font-weight: 900; }
    .discipline-complete-actions { display: flex; flex-wrap: wrap; gap: 9px; }
    @media (max-width: 900px) { .discipline-choice-grid--policy { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 700px) {
      .discipline-page { width: min(100%, calc(100vw - 20px)); }
      .discipline-form-card { padding: 18px 14px; border-radius: 19px; }
      .discipline-stepper { gap: 5px; margin-top: 18px; }
      .discipline-step:not(:last-child)::after { display: none; }
      .discipline-step button { justify-content: center; min-height: 52px; padding: 8px 5px; }
      .discipline-step button > span:last-child { display: none; }
      .discipline-step__number { width: 32px; height: 32px; }
      .discipline-choice-grid--two, .discipline-form-grid, .discipline-search-results { grid-template-columns: 1fr; }
      .discipline-review-list > div { grid-template-columns: 58px minmax(0, 1fr) auto; gap: 9px; padding: 13px 11px; }
      .discipline-wizard-actions { align-items: stretch; flex-direction: column-reverse; }
      .discipline-wizard-actions > div, .discipline-wizard-actions > button { width: 100%; }
      .discipline-wizard-actions > div .admin-button { flex: 1; }
      .discipline-submit-button { min-width: 0; }
    }
    @media (max-width: 460px) { .discipline-choice-grid--policy { grid-template-columns: 1fr; } .discipline-policy-card { min-height: 94px; } }
  `}</style>;
}

export default function DiscordOpsStyles() {
  return (
    <style>{`
      .discord-ops-page {
        width: min(1480px, calc(100vw - 56px));
        max-width: none;
        margin: 0 auto;
        padding-bottom: 64px;
      }
      .discord-ops-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 18px;
      }
      .discord-ops-header .admin-page__description {
        max-width: 980px;
        line-height: 1.65;
        color: #a8b3c7;
      }
      .discord-ops-notice {
        margin: 12px 0 18px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(56, 189, 248, .24);
        background: rgba(8, 47, 73, .22);
        color: #bfdbfe;
        font-size: 13px;
        line-height: 1.65;
      }
      .discord-ops-tabs {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 10px;
        margin: 16px 0 22px;
      }
      .discord-ops-tab {
        display: grid;
        gap: 5px;
        padding: 14px 13px;
        border-radius: 16px;
        border: 1px solid rgba(148, 163, 184, .18);
        background: rgba(15, 23, 42, .52);
        color: inherit;
        text-decoration: none;
        min-width: 0;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
      }
      .discord-ops-tab strong {
        color: #e5e7eb;
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .discord-ops-tab span {
        color: #93a4bd;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .discord-ops-tab:hover,
      .discord-ops-tab.is-active {
        border-color: rgba(59, 130, 246, .7);
        background: linear-gradient(135deg, rgba(37, 99, 235, .23), rgba(8, 145, 178, .12));
      }
      .discord-scenario-list {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 8px;
      }
      .discord-scenario-chip {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, .20);
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 800;
        background: rgba(15, 23, 42, .62);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .discord-ops-nav-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin: 20px 0;
      }
      .discord-ops-nav-card {
        display: grid;
        gap: 9px;
        min-height: 108px;
        padding: 18px;
        border: 1px solid rgba(148, 163, 184, .20);
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(15, 23, 42, .78), rgba(30, 41, 59, .44));
        text-decoration: none;
        color: inherit;
        box-shadow: 0 14px 34px rgba(2, 6, 23, .22);
      }
      .discord-ops-nav-card:hover {
        border-color: rgba(96, 165, 250, .55);
        transform: translateY(-1px);
      }
      .discord-ops-nav-card strong { color: #f8fafc; font-size: 16px; }
      .discord-ops-nav-card span { color: #a8b3c7; font-size: 13px; line-height: 1.55; }
      .discord-ops-stat-grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 12px;
        margin: 20px 0;
      }
      .discord-ops-stat {
        display: grid;
        gap: 7px;
        min-width: 0;
        padding: 16px;
        border-radius: 17px;
        border: 1px solid rgba(148, 163, 184, .18);
        background: rgba(15, 23, 42, .62);
      }
      .discord-ops-stat span { color: #a8b3c7; font-size: 12px; font-weight: 900; }
      .discord-ops-stat strong { color: #f8fafc; font-size: clamp(20px, 2vw, 26px); line-height: 1.05; letter-spacing: -.02em; }
      .discord-ops-stat em { color: #718096; font-size: 12px; font-style: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .discord-ops-two-col { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; margin-top: 18px; }
      .discord-ops-panel { overflow: hidden; }
      .discord-ops-panel .admin-section-head { gap: 10px; }
      .discord-ops-kv { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .discord-ops-kv div { display: grid; gap: 5px; padding: 12px; border-radius: 14px; background: rgba(15, 23, 42, .52); border: 1px solid rgba(148, 163, 184, .14); min-width: 0; }
      .discord-ops-kv span { color: #94a3b8; font-size: 12px; font-weight: 900; }
      .discord-ops-kv strong { color: #e5e7eb; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .discord-ops-list { display: grid; gap: 10px; }
      .discord-ops-list-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: rgba(15, 23, 42, .48); border: 1px solid rgba(148, 163, 184, .13); }
      .discord-ops-list-row strong { min-width: 0; color: #e5e7eb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
      .discord-ops-list-row span { color: #93c5fd; font-size: 12px; font-weight: 900; white-space: nowrap; }
      .discord-table-scroll { width: 100%; overflow-x: auto; border-radius: 16px; }
      .discord-compact-table { table-layout: fixed; width: 100%; min-width: 920px; }
      .discord-compact-table th, .discord-compact-table td { vertical-align: middle; overflow: hidden; text-overflow: ellipsis; line-height: 1.55; }
      .discord-compact-table th { color: #9bdcff; font-size: 12px; white-space: nowrap; }
      .discord-compact-table td { font-size: 13px; }
      .discord-compact-table td strong { font-size: 13px; }
      .discord-compact-table .col-main { width: 18%; }
      .discord-compact-table .col-status { width: 110px; }
      .discord-compact-table .col-small { width: 92px; }
      .discord-compact-table .col-medium { width: 130px; }
      .discord-compact-table .col-wide { width: 170px; }
      .discord-settings-form--readable { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .discord-settings-form--readable label { display: grid; gap: 7px; min-width: 0; }
      .discord-settings-form--readable label span { color: #cbd5e1; font-size: 12px; font-weight: 900; }
      .discord-settings-form--readable textarea { resize: vertical; min-height: 74px; }
      .discord-settings-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; }
      .discord-status-pill { display: inline-flex; align-items: center; justify-content: center; max-width: 100%; min-width: 70px; padding: 5px 9px; border-radius: 999px; font-size: 12px; font-weight: 900; border: 1px solid rgba(148, 163, 184, .24); background: rgba(15, 23, 42, .70); color: #dbeafe; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .discord-status-ok, .discord-status-present, .discord-status-assembled, .discord-status-auto-finished { border-color: rgba(34, 197, 94, .45); color: #bbf7d0; background: rgba(22, 101, 52, .25); }
      .discord-status-info, .discord-status-waiting { border-color: rgba(148, 163, 184, .30); color: #cbd5e1; background: rgba(15, 23, 42, .55); }
      .discord-status-warn, .discord-status-late, .discord-status-assembled-with-extra, .discord-status-partial-active-with-extra { border-color: rgba(250, 204, 21, .45); color: #fef08a; background: rgba(113, 63, 18, .25); }
      .discord-status-error, .discord-status-absent-warning, .discord-status-finish-candidate { border-color: rgba(248, 113, 113, .45); color: #fecaca; background: rgba(127, 29, 29, .28); }
      .discord-status-gathering, .discord-status-partial-active { border-color: rgba(59, 130, 246, .45); color: #bfdbfe; background: rgba(30, 64, 175, .25); }

      .discord-inline-list {
        display: grid;
        gap: 4px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .discord-inline-list li {
        display: grid;
        grid-template-columns: 20px minmax(0, 1fr);
        align-items: start;
        gap: 4px;
        min-width: 0;
        color: #dbeafe;
        line-height: 1.45;
      }
      .discord-inline-list__index {
        color: #60a5fa;
        font-size: 11px;
        font-weight: 900;
      }
      .discord-inline-list__text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #e5e7eb;
      }
      .discord-extra-users { margin-top: 12px; line-height: 1.65; }
      .discord-extra-users-box {
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(56, 189, 248, .20);
        background: rgba(8, 47, 73, .18);
      }
      .discord-extra-users-box strong {
        display: block;
        margin-bottom: 8px;
        color: #dbeafe;
        font-size: 13px;
      }
      .discord-extra-user-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }
      .discord-extra-user-chips span {
        max-width: 360px;
        padding: 6px 9px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, .20);
        background: rgba(15, 23, 42, .55);
        color: #cbd5e1;
        font-size: 12px;
        font-weight: 800;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .discord-filter-card { display: grid; grid-template-columns: minmax(280px, 1fr) 150px auto; align-items: end; gap: 12px; margin: 18px 0; }
      .discord-filter-card label { display: grid; gap: 8px; color: #cbd5e1; font-size: 13px; font-weight: 900; }
      .discord-filter-card input, .discord-filter-card select { width: 100%; min-height: 40px; border-radius: 12px; border: 1px solid rgba(96,165,250,.28); background: rgba(2,6,23,.72); color: #e5e7eb; padding: 0 12px; }
      .discord-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 14px; }
      .discord-pagination a, .discord-pagination span { border: 1px solid rgba(148,163,184,.2); border-radius: 10px; padding: 7px 10px; color: #cbd5e1; text-decoration: none; font-size: 12px; font-weight: 900; }
      .discord-pagination a.is-disabled { opacity: .4; pointer-events: none; }
      .mono-cell { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; color: #cbd5e1; }
      .text-muted-compact { color: #94a3b8; font-size: 12px; line-height: 1.45; }
      @media (max-width: 1320px) {
        .discord-ops-stat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .discord-ops-nav-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .discord-ops-tabs { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .discord-ops-kv { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 860px) {
        .discord-ops-page { width: calc(100vw - 24px); }
        .discord-ops-header { flex-direction: column; }
        .discord-ops-nav-grid, .discord-ops-two-col, .discord-settings-form--readable, .discord-filter-card { grid-template-columns: 1fr; }
        .discord-ops-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .discord-ops-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    `}</style>
  );
}
